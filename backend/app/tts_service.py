import logging

from .config import ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID
from .elevenlabs_service import synthesize_with_voice

logger = logging.getLogger(__name__)


async def synthesize(text: str, voice_id: str | None = None) -> bytes | None:
    """Synthesize speech from text using ElevenLabs TTS. Returns MP3 bytes or None on failure.
    Uses voice_id if provided, otherwise ELEVENLABS_VOICE_ID from config."""
    if not text.strip():
        return None
    if not ELEVENLABS_API_KEY:
        logger.error("TTS: ELEVENLABS_API_KEY is not configured")
        return None
    effective_voice = voice_id or ELEVENLABS_VOICE_ID
    if not effective_voice:
        logger.error("TTS: No voice_id provided and ELEVENLABS_VOICE_ID is not configured")
        return None
    return await synthesize_with_voice(text, effective_voice)
