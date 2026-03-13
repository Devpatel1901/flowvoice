import logging

from .config import ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID
from .elevenlabs_service import synthesize_with_voice

logger = logging.getLogger(__name__)


async def synthesize(text: str) -> bytes | None:
    """Synthesize speech from text using ElevenLabs TTS. Returns MP3 bytes or None on failure."""
    if not text.strip():
        return None
    if not ELEVENLABS_API_KEY:
        logger.error("TTS: ELEVENLABS_API_KEY is not configured")
        return None
    if not ELEVENLABS_VOICE_ID:
        logger.error("TTS: ELEVENLABS_VOICE_ID is not configured; set your cloned voice ID in .env")
        return None
    return await synthesize_with_voice(text, ELEVENLABS_VOICE_ID)
