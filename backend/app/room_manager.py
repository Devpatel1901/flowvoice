"""Room state management and cross-connection audio routing."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field

from fastapi import WebSocket

from .playback_queue import PlaybackQueue
from .vad import VADTracker

logger = logging.getLogger(__name__)

STALE_THRESHOLD = 5.0  # seconds — held TTS older than this is dropped
MAX_HELD = 5
BINARY_PREFIX_MP3 = b"\x01"
BINARY_PREFIX_PCM = b"\x02"


@dataclass
class Room:
    room_id: str
    stutter_ws: WebSocket | None = None
    listener_ws: WebSocket | None = None
    vad: VADTracker = field(default_factory=VADTracker)
    listener_queue: PlaybackQueue = field(default_factory=PlaybackQueue)
    held_audio: list[tuple[float, bytes]] = field(default_factory=list)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class RoomManager:
    def __init__(self) -> None:
        self._rooms: dict[str, Room] = {}

    def get_or_create(self, room_id: str) -> Room:
        if room_id not in self._rooms:
            self._rooms[room_id] = Room(room_id=room_id)
            logger.info("Room %s created", room_id)
        return self._rooms[room_id]

    def get(self, room_id: str) -> Room | None:
        return self._rooms.get(room_id)

    async def join(self, room_id: str, role: str, ws: WebSocket) -> Room:
        room = self.get_or_create(room_id)
        async with room._lock:
            if role == "stutter":
                if room.stutter_ws is not None:
                    try:
                        await room.stutter_ws.close()
                    except Exception:
                        pass
                    logger.warning(f"Evicted stale Stutter user in room {room_id}")
                room.stutter_ws = ws
            elif role == "listener":
                if room.listener_ws is not None:
                    try:
                        await room.listener_ws.close()
                    except Exception:
                        pass
                    logger.warning(f"Evicted stale Listener user in room {room_id}")
                room.listener_ws = ws
            else:
                raise ValueError(f"Unknown role: {role}")
        logger.info("Room %s: %s joined", room_id, role)
        return room

    async def leave(self, room_id: str, role: str, ws: WebSocket) -> None:
        room = self._rooms.get(room_id)
        if not room:
            return
        
        async with room._lock:
            if role == "stutter" and room.stutter_ws is ws:
                room.stutter_ws = None
            elif role == "listener" and room.listener_ws is ws:
                room.listener_ws = None
                
            if room.stutter_ws is None and room.listener_ws is None:
                del self._rooms[room_id]
                logger.info("Room %s destroyed (empty)", room_id)
            else:
                logger.info("Room %s: %s left", room_id, role)

    def room_status(self, room_id: str) -> dict:
        room = self._rooms.get(room_id)
        if not room:
            return {"room_id": room_id, "stutter": False, "listener": False}
        return {
            "room_id": room_id,
            "stutter": room.stutter_ws is not None,
            "listener": room.listener_ws is not None,
        }

    # ── Audio routing helpers ──────────────────────────────────────────

    async def send_tts_to_listener(self, room: Room, mp3_bytes: bytes) -> None:
        """Send TTS audio to the listener, or hold it if they're speaking."""
        async with room._lock:
            if room.vad.speaking:
                if len(room.held_audio) >= MAX_HELD:
                    room.held_audio.pop(0)
                room.held_audio.append((time.time(), mp3_bytes))
                logger.info(
                    "Room %s: held TTS (%d bytes), %d in buffer",
                    room.room_id, len(mp3_bytes), len(room.held_audio),
                )
            else:
                await room.listener_queue.put(mp3_bytes)

    async def flush_held_tts(self, room: Room) -> None:
        """Release held TTS audio to the listener, dropping stale entries."""
        async with room._lock:
            now = time.time()
            flushed = 0
            for ts, mp3 in room.held_audio:
                if now - ts > STALE_THRESHOLD:
                    logger.info("Room %s: dropped stale held TTS (%.1fs old)", room.room_id, now - ts)
                    continue
                await room.listener_queue.put(mp3)
                flushed += 1
            room.held_audio.clear()
            if flushed:
                logger.info("Room %s: flushed %d held TTS items", room.room_id, flushed)

    async def relay_pcm_to_stutter(self, room: Room, pcm_bytes: bytes) -> None:
        """Relay listener's raw PCM to the stutter user's browser."""
        if room.stutter_ws is not None:
            try:
                await room.stutter_ws.send_bytes(BINARY_PREFIX_PCM + pcm_bytes)
            except Exception:
                pass

    async def send_json_to_both(self, room: Room, data: dict) -> None:
        """Broadcast a JSON message to both room members."""
        for ws in (room.stutter_ws, room.listener_ws):
            if ws is not None:
                try:
                    await ws.send_json(data)
                except Exception:
                    pass

    async def send_json_to_peer(self, room: Room, sender_role: str, data: dict) -> None:
        """Send JSON to the other user in the room."""
        ws = room.listener_ws if sender_role == "stutter" else room.stutter_ws
        if ws is not None:
            try:
                await ws.send_json(data)
            except Exception:
                pass

    async def notify_peer_disconnect(self, room: Room, disconnected_role: str) -> None:
        """Notify the remaining peer that the other user left."""
        await self.send_json_to_peer(room, disconnected_role, {
            "type": "peer_status",
            "status": "disconnected",
        })
