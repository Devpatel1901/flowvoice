import asyncio
import logging

from openai import AsyncOpenAI

from .config import OPENAI_API_KEY, OPENAI_TIMEOUT, TTS_MODEL, TTS_VOICE

logger = logging.getLogger(__name__)

_client = AsyncOpenAI(api_key=OPENAI_API_KEY)


async def synthesize(text: str) -> bytes | None:
    """Synthesize speech from text using OpenAI TTS. Returns MP3 bytes or None on failure."""
    if not text.strip():
        return None
    try:
        response = await asyncio.wait_for(
            _client.audio.speech.create(
                model=TTS_MODEL,
                voice=TTS_VOICE,
                input=text,
                response_format="mp3",
            ),
            timeout=OPENAI_TIMEOUT,
        )
        audio_bytes = response.content
        logger.info("TTS: synthesized %d bytes for '%s'", len(audio_bytes), text[:60])
        return audio_bytes
    except asyncio.TimeoutError:
        logger.error("TTS: timeout after %ds", OPENAI_TIMEOUT)
        return None
    except Exception as e:
        logger.error("TTS: failed: %s", e)
        return None
