import asyncio
import logging

from openai import AsyncOpenAI

from .config import CLEANUP_MODEL, OPENAI_API_KEY, OPENAI_TIMEOUT

logger = logging.getLogger(__name__)

_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

SYSTEM_PROMPT = (
    "You are a speech cleanup assistant specialized in processing stuttered speech. "
    "Your job is to produce the fluent version of what the speaker INTENDED to say.\n\n"
    "Apply these transformations:\n"
    "- Part-word repetitions: 'b-b-but' -> 'but', 'wh-what' -> 'what'\n"
    "- Whole-word repetitions: 'I I I want' -> 'I want', 'the the' -> 'the'\n"
    "- Phrase repetitions: 'I want to I want to go' -> 'I want to go'\n"
    "- Sound prolongations: 'sssso', 'mmmy' -> 'so', 'my'\n"
    "- Filler words: 'um', 'uh', 'like', 'you know', 'er', 'ah' -> remove\n"
    "- Interjections used as stalling: 'well well well' -> 'well'\n\n"
    "Strict rules:\n"
    "- Preserve the EXACT intended meaning\n"
    "- Do NOT paraphrase, rephrase, or reword\n"
    "- Do NOT summarize or condense multiple sentences into one\n"
    "- Do NOT add words the speaker did not intend to say\n"
    "- Do NOT correct grammar -- only remove disfluencies\n"
    "- If the input is already fluent, return it unchanged\n"
    "- Return ONLY the cleaned text, no explanations or annotations"
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
