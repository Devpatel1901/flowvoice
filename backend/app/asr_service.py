import asyncio
import base64
import json
import logging
from typing import AsyncGenerator

import httpx
import websockets

from .config import OPENAI_API_KEY, REALTIME_API_URL

logger = logging.getLogger(__name__)

CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets"


class ASRService:
    """Manages a WebSocket connection to the OpenAI Realtime API for transcription-only mode."""

    def __init__(self) -> None:
        self._ws: websockets.ClientConnection | None = None
        self._closed = False

    async def _create_transcription_session(self) -> str:
        """Create a GA transcription session via client_secrets and return the ephemeral token."""
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                CLIENT_SECRETS_URL,
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "session": {
                        "type": "transcription",
                        "audio": {
                            "input": {
                                "format": {"type": "audio/pcm", "rate": 24000},
                                "transcription": {
                                    "model": "gpt-4o-mini-transcribe",
                                    "language": "en",
                                },
                                "turn_detection": {
                                    "type": "server_vad",
                                    "threshold": 0.5,
                                    "prefix_padding_ms": 300,
                                    "silence_duration_ms": 600,
                                },
                            }
                        },
                    }
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data["value"]

    async def connect(self) -> None:
        token = await self._create_transcription_session()
        logger.info("ASR: transcription session created, connecting WebSocket")
        self._ws = await websockets.connect(
            REALTIME_API_URL,
            additional_headers={"Authorization": f"Bearer {token}"},
            max_size=1024 * 1024,
        )
        logger.info("ASR: connected to OpenAI Realtime API (transcription session)")

    async def send_audio(self, chunk: bytes) -> None:
        if self._ws is None or self._closed:
            return
        encoded = base64.b64encode(chunk).decode("ascii")
        event = {
            "type": "input_audio_buffer.append",
            "audio": encoded,
        }
        try:
            await self._ws.send(json.dumps(event))
        except websockets.exceptions.ConnectionClosed:
            logger.warning("ASR: connection closed while sending audio")
            self._closed = True

    async def commit_audio(self) -> None:
        if self._ws is None or self._closed:
            return
        event = {"type": "input_audio_buffer.commit"}
        try:
            await self._ws.send(json.dumps(event))
            logger.info("ASR: manually committed audio buffer")
        except websockets.exceptions.ConnectionClosed:
            self._closed = True

    async def delete_item(self, item_id: str) -> None:
        if self._ws is None or self._closed:
            return
        event = {"type": "conversation.item.delete", "item_id": item_id}
        try:
            await self._ws.send(json.dumps(event))
            logger.info("ASR: deleted item %s from context", item_id)
        except websockets.exceptions.ConnectionClosed:
            self._closed = True

    async def listen(self) -> AsyncGenerator[str, None]:
        """Yields final transcript strings from the Realtime API."""
        if self._ws is None:
            return
        try:
            async for raw_message in self._ws:
                if self._closed:
                    break
                try:
                    event = json.loads(raw_message)
                except json.JSONDecodeError:
                    continue

                event_type = event.get("type", "")

                if event_type == "conversation.item.input_audio_transcription.completed":
                    transcript = event.get("transcript", "").strip()
                    item_id = event.get("item_id", "")
                    if transcript:
                        logger.info("ASR: final transcript: %s", transcript[:80])
                        yield transcript
                        if item_id:
                            # Remove this transcript from OpenAI's context so it isn't repeated
                            await self.delete_item(item_id)

                elif event_type == "error":
                    logger.error("ASR: API error: %s", event.get("error", {}))

        except websockets.exceptions.ConnectionClosed:
            logger.info("ASR: connection closed")
        except asyncio.CancelledError:
            logger.info("ASR: listen cancelled")
            # Ensure the websocket is closed immediately if the task is cancelled
            await self.close()
            raise

    async def close(self) -> None:
        self._closed = True
        if self._ws is not None:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
        logger.info("ASR: closed")
