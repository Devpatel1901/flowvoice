import asyncio
import json
import logging
import time

from fastapi import WebSocket, WebSocketDisconnect

from .asr_service import ASRService
from .cleanup_service import clean_text
from .playback_queue import PlaybackQueue
from .tts_service import synthesize

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Orchestrates the per-connection streaming pipeline."""

    async def handle_connection(self, websocket: WebSocket) -> None:
        await websocket.accept()
        logger.info("Client connected")

        asr = ASRService()
        queue = PlaybackQueue()
        tasks: list[asyncio.Task] = []
        state = {"assist": True}

        try:
            await asr.connect()

            receiver = asyncio.create_task(
                self._receiver_loop(websocket, asr, state), name="receiver"
            )
            asr_listener = asyncio.create_task(
                self._asr_listener_loop(websocket, asr, queue, lambda: state["assist"]),
                name="asr_listener",
            )
            sender = asyncio.create_task(
                self._sender_loop(websocket, queue), name="sender"
            )
            tasks = [receiver, asr_listener, sender]

            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
            for task in done:
                if task.exception():
                    logger.error("Task %s raised: %s", task.get_name(), task.exception())

        except WebSocketDisconnect:
            logger.info("Client disconnected")
        except Exception as e:
            logger.error("Connection error: %s", e)
        finally:
            logger.info("Cleaning up connection...")
            # Cancel all tasks immediately
            for task in tasks:
                if not task.done():
                    task.cancel()
            
            # Wait for tasks to acknowledge cancellation
            if tasks:
                # Use a small timeout to force exit if tasks hang
                await asyncio.wait(tasks, timeout=2.0)
                
            await asr.close()
            queue.clear()
            logger.info("Connection cleaned up")

    async def _receiver_loop(
        self, websocket: WebSocket, asr: ASRService, state: dict
    ) -> None:
        """Reads binary PCM frames from the browser and forwards them to ASR."""
        try:
            while True:
                data = await websocket.receive()
                if "bytes" in data and data["bytes"]:
                    await asr.send_audio(data["bytes"])
                elif "text" in data and data["text"]:
                    try:
                        msg = json.loads(data["text"])
                        if msg.get("type") == "assist_toggle":
                            state["assist"] = bool(msg.get("enabled", True))
                            logger.info("Assist mode: %s", state["assist"])
                    except json.JSONDecodeError:
                        pass
        except WebSocketDisconnect:
            logger.info("Receiver: client disconnected")
        except RuntimeError:
            logger.info("Receiver: client already disconnected")
        except asyncio.CancelledError:
            logger.info("Receiver: cancelled")
            raise

    async def _asr_listener_loop(
        self,
        websocket: WebSocket,
        asr: ASRService,
        queue: PlaybackQueue,
        get_assist: callable,
    ) -> None:
        """Listens for final transcripts from ASR, then runs cleanup + TTS pipeline."""
        try:
            async for transcript in asr.listen():
                start_time = time.monotonic()

                if not get_assist():
                    continue

                try:
                    await websocket.send_json({
                        "type": "status",
                        "status": "processing",
                    })
                except Exception:
                    break

                cleaned = await clean_text(transcript)

                try:
                    await websocket.send_json({
                        "type": "transcript",
                        "subtype": "cleaned",
                        "text": cleaned,
                        "timestamp": time.time(),
                    })
                except Exception:
                    break

                audio_bytes = await synthesize(cleaned)
                if audio_bytes:
                    await queue.put(audio_bytes)

                latency_ms = (time.monotonic() - start_time) * 1000
                try:
                    await websocket.send_json({
                        "type": "latency",
                        "ms": round(latency_ms),
                    })
                except Exception:
                    break

        except asyncio.CancelledError:
            logger.info("ASR listener: cancelled")
            raise

    async def _sender_loop(self, websocket: WebSocket, queue: PlaybackQueue) -> None:
        """Pulls audio from the playback queue and sends binary frames to the browser."""
        try:
            while True:
                audio_bytes = await queue.get()
                try:
                    await websocket.send_json({"type": "status", "status": "speaking"})
                    await websocket.send_bytes(audio_bytes)
                    logger.info("Sender: sent %d audio bytes to browser", len(audio_bytes))
                except Exception as e:
                    logger.error("Sender: failed to send audio: %s", e)
                    break
        except asyncio.CancelledError:
            logger.info("Sender: cancelled")
            raise
