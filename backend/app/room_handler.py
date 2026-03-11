"""WebSocket orchestration for room-based two-person conferencing."""

from __future__ import annotations

import asyncio
import json
import logging
import time

from fastapi import WebSocket, WebSocketDisconnect

from .asr_service import ASRService
from .cleanup_service import clean_text
from .room_manager import BINARY_PREFIX_MP3, Room, RoomManager
from .tts_service import synthesize

logger = logging.getLogger(__name__)


class RoomConnectionHandler:
    def __init__(self, room_manager: RoomManager) -> None:
        self._mgr = room_manager

    async def handle_connection(
        self, websocket: WebSocket, room_id: str, role: str
    ) -> None:
        await websocket.accept()

        try:
            room = await self._mgr.join(room_id, role, websocket)
        except ValueError as e:
            await websocket.send_json({"type": "error", "message": str(e)})
            await websocket.close(code=4001)
            return

        logger.info("Room %s: %s connected", room_id, role)

        # Notify the peer that someone joined
        await self._mgr.send_json_to_peer(room, role, {
            "type": "peer_status",
            "status": "connected",
        })

        # If the newly joining user's peer was already in the room, notify them too
        if (role == "stutter" and room.listener_ws is not None) or (role == "listener" and room.stutter_ws is not None):
            await websocket.send_json({"type": "peer_status", "status": "connected"})

        try:
            if role == "stutter":
                await self._run_stutter_pipeline(websocket, room)
            else:
                await self._run_listener_pipeline(websocket, room)
        except WebSocketDisconnect:
            logger.info("Room %s: %s disconnected (WebSocketDisconnect)", room_id, role)
        except Exception as e:
            logger.error("Room %s: %s error: %s", room_id, role, e)
        finally:
            logger.info("Room %s: %s cleaning up...", room_id, role)
            
            try:
                # Notify peer (will fail safely if peer is already gone or we are gone)
                await self._mgr.notify_peer_disconnect(room, role)
            except Exception as e:
                logger.error("Room %s: %s failed to notify peer: %s", room_id, role, e)
                
            # Remove from room BEFORE we spend time closing ASR, 
            # so new connections don't see a ghost user
            self._mgr.leave(room_id, role)
            logger.info("Room %s: %s cleaned up", room_id, role)

    # ── Stutter-user pipeline ──────────────────────────────────────────

    async def _run_stutter_pipeline(
        self, websocket: WebSocket, room: Room
    ) -> None:
        asr = ASRService()
        tasks: list[asyncio.Task] = []

        try:
            await asr.connect()

            receiver = asyncio.create_task(
                self._stutter_receiver(websocket, asr), name="stutter-rx"
            )
            processor = asyncio.create_task(
                self._stutter_asr_processor(websocket, asr, room),
                name="stutter-proc",
            )
            tasks = [receiver, processor]

            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
            for t in done:
                if t.exception():
                    logger.error("Task %s raised: %s", t.get_name(), t.exception())
        finally:
            for t in tasks:
                if not t.done():
                    t.cancel()
            if tasks:
                await asyncio.wait(tasks, timeout=2.0)
            await asr.close()

    async def _stutter_receiver(
        self, websocket: WebSocket, asr: ASRService
    ) -> None:
        """Reads PCM from the stutter user's browser and forwards to ASR."""
        try:
            while True:
                data = await websocket.receive()
                if "bytes" in data and data["bytes"]:
                    await asr.send_audio(data["bytes"])
                elif "text" in data and data["text"]:
                    pass  # no control messages needed from stutter user in room mode
        except WebSocketDisconnect:
            logger.info("Stutter receiver: client disconnected")
        except RuntimeError:
            logger.info("Stutter receiver: client already disconnected")
        except asyncio.CancelledError:
            logger.info("Stutter receiver: cancelled")
            raise

    async def _stutter_asr_processor(
        self, websocket: WebSocket, asr: ASRService, room: Room
    ) -> None:
        """Listens for ASR transcripts, runs cleanup + TTS, routes to listener."""
        try:
            async for transcript in asr.listen():
                if len(transcript) < 2:
                    continue

                start_time = time.monotonic()

                # Notify stutter user they're being processed
                try:
                    await websocket.send_json({"type": "status", "status": "processing"})
                except Exception:
                    break

                cleaned = await clean_text(transcript)

                # Send transcript to BOTH users
                transcript_msg = {
                    "type": "transcript",
                    "subtype": "cleaned",
                    "text": cleaned,
                    "timestamp": time.time(),
                }
                await self._mgr.send_json_to_both(room, transcript_msg)

                # Synthesize and route to listener (held if listener is speaking)
                audio_bytes = await synthesize(cleaned)
                if audio_bytes and room.listener_ws is not None:
                    await self._mgr.send_tts_to_listener(room, audio_bytes)

                latency_ms = (time.monotonic() - start_time) * 1000
                try:
                    await websocket.send_json({"type": "latency", "ms": round(latency_ms)})
                except Exception:
                    break

                # Notify stutter user they can keep talking
                try:
                    await websocket.send_json({"type": "status", "status": "listening"})
                except Exception:
                    break

        except asyncio.CancelledError:
            logger.info("Stutter ASR processor: cancelled")
            raise

    # ── Listener pipeline ──────────────────────────────────────────────

    async def _run_listener_pipeline(
        self, websocket: WebSocket, room: Room
    ) -> None:
        tasks: list[asyncio.Task] = []

        try:
            receiver = asyncio.create_task(
                self._listener_receiver(websocket, room), name="listener-rx"
            )
            sender = asyncio.create_task(
                self._listener_tts_sender(websocket, room), name="listener-tx"
            )
            tasks = [receiver, sender]

            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
            for t in done:
                if t.exception():
                    logger.error("Task %s raised: %s", t.get_name(), t.exception())
        finally:
            for t in tasks:
                if not t.done():
                    t.cancel()
            if tasks:
                await asyncio.wait(tasks, timeout=2.0)
            room.listener_queue.clear()

    async def _listener_receiver(
        self, websocket: WebSocket, room: Room
    ) -> None:
        """Reads PCM from the listener, runs VAD, relays to stutter user."""
        try:
            while True:
                data = await websocket.receive()
                if "bytes" in data and data["bytes"]:
                    pcm = data["bytes"]

                    was_speaking = room.vad.speaking
                    is_speaking = room.vad.update(pcm)

                    # Transition: speaking → silent — flush held TTS
                    if was_speaking and not is_speaking:
                        logger.info("Room %s: listener stopped speaking, flushing held TTS", room.room_id)
                        await self._mgr.flush_held_tts(room)

                    # Transition: silent → speaking — interrupt listener's TTS playback
                    if not was_speaking and is_speaking:
                        logger.info("Room %s: listener started speaking, sending interrupt", room.room_id)
                        try:
                            await websocket.send_json({"type": "interrupt"})
                        except Exception:
                            pass

                    # Relay listener's voice to stutter user
                    await self._mgr.relay_pcm_to_stutter(room, pcm)

                elif "text" in data and data["text"]:
                    pass  # no control messages from listener in room mode
        except WebSocketDisconnect:
            logger.info("Listener receiver: client disconnected")
        except RuntimeError:
            logger.info("Listener receiver: client already disconnected")
        except asyncio.CancelledError:
            logger.info("Listener receiver: cancelled")
            raise

    async def _listener_tts_sender(
        self, websocket: WebSocket, room: Room
    ) -> None:
        """Pulls TTS MP3 from the listener's queue and sends to their browser."""
        try:
            while True:
                mp3_bytes = await room.listener_queue.get()
                try:
                    await websocket.send_json({"type": "status", "status": "speaking"})
                    await websocket.send_bytes(BINARY_PREFIX_MP3 + mp3_bytes)
                    logger.info(
                        "Room %s: sent %d TTS bytes to listener",
                        room.room_id, len(mp3_bytes),
                    )
                except Exception as e:
                    logger.error("Listener TTS sender: failed: %s", e)
                    break
        except asyncio.CancelledError:
            logger.info("Listener TTS sender: cancelled")
            raise
