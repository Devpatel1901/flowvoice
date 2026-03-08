import asyncio
import logging

from openai import AsyncOpenAI

from .config import CLEANUP_MODEL, OPENAI_API_KEY, OPENAI_TIMEOUT

logger = logging.getLogger(__name__)

_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

SYSTEM_PROMPT = (
    "You are a speech cleanup assistant. "
    "Clean the following transcribed speech by applying these rules strictly:\n"
    "- Remove stuttering repetitions (e.g., 'I I I want' → 'I want')\n"
    "- Remove prolonged sounds (e.g., 'sooo' → 'so')\n"
    "- Remove filler words (um, uh, like, you know, etc.)\n"
    "- Preserve the exact meaning of the original speech\n"
    "- Do NOT paraphrase\n"
    "- Do NOT summarize\n"
    "- Do NOT expand or add new words\n"
    "- Return ONLY the cleaned text, nothing else"
)


async def clean_text(text: str) -> str:
    """Clean transcribed speech using GPT-4o-mini. Returns cleaned text or original on failure."""
    if not text.strip():
        return text
    try:
        response = await asyncio.wait_for(
            _client.chat.completions.create(
                model=CLEANUP_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": text},
                ],
                temperature=0.1,
                max_tokens=1024,
            ),
            timeout=OPENAI_TIMEOUT,
        )
        cleaned = response.choices[0].message.content.strip()
        logger.info("Cleanup: '%s' → '%s'", text[:60], cleaned[:60])
        return cleaned
    except asyncio.TimeoutError:
        logger.error("Cleanup: timeout after %ds", OPENAI_TIMEOUT)
        return text
    except Exception as e:
        logger.error("Cleanup: failed: %s", e)
        return text
