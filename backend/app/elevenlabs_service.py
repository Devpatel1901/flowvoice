"""ElevenLabs voice cloning and TTS service."""

from __future__ import annotations

import logging

import httpx

from .config import ELEVENLABS_API_KEY, ELEVENLABS_TIMEOUT

logger = logging.getLogger(__name__)

_BASE = "https://api.elevenlabs.io/v1"


async def clone_voice(name: str, samples: list[tuple[bytes, str]]) -> str:
    """Upload audio samples and create an ElevenLabs cloned voice. Returns voice_id."""
    if not ELEVENLABS_API_KEY:
        raise ValueError("ELEVENLABS_API_KEY is not configured")

    files = []
    for i, (data, content_type) in enumerate(samples):
        if "webm" in content_type:
            ext = "webm"
        elif "ogg" in content_type:
            ext = "ogg"
        elif "mp4" in content_type:
            ext = "mp4"
        else:
            ext = "wav"
        files.append(("files", (f"sample_{i + 1}.{ext}", data, content_type)))

    async with httpx.AsyncClient(timeout=ELEVENLABS_TIMEOUT) as client:
        response = await client.post(
            f"{_BASE}/voices/add",
            headers={"xi-api-key": ELEVENLABS_API_KEY},
            data={"name": f"UnStutterAI_{name}", "description": f"Voice clone for {name}"},
            files=files,
        )
        response.raise_for_status()
        voice_id = response.json()["voice_id"]
        logger.info("ElevenLabs: cloned voice for %s → voice_id=%s", name, voice_id)
        return voice_id


async def synthesize_with_voice(text: str, voice_id: str) -> bytes | None:
    """Generate TTS audio using a cloned ElevenLabs voice. Returns MP3 bytes or None."""
    if not ELEVENLABS_API_KEY or not text.strip():
        return None
    try:
        async with httpx.AsyncClient(timeout=ELEVENLABS_TIMEOUT) as client:
            response = await client.post(
                f"{_BASE}/text-to-speech/{voice_id}",
                headers={
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg",
                },
                json={
                    "text": text.strip(),
                    "model_id": "eleven_multilingual_v2",
                    "voice_settings": {
                        "stability": 1.0,
                        "similarity_boost": 0.75,
                        "style": 0.15,
                        "speed": 1.0,
                        "use_speaker_boost": True,
                    },
                },
            )
            response.raise_for_status()
            logger.info(
                "ElevenLabs TTS: %d bytes for '%s'", len(response.content), text[:60]
            )
            return response.content
    except Exception as e:
        logger.error("ElevenLabs TTS failed: %s", e)
        return None


async def delete_voice(voice_id: str) -> None:
    """Delete a voice from ElevenLabs (best-effort)."""
    if not ELEVENLABS_API_KEY:
        return
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await client.delete(
                f"{_BASE}/voices/{voice_id}",
                headers={"xi-api-key": ELEVENLABS_API_KEY},
            )
        logger.info("ElevenLabs: deleted voice %s", voice_id)
    except Exception as e:
        logger.warning("ElevenLabs: failed to delete voice %s: %s", voice_id, e)
