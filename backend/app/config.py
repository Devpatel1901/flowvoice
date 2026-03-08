import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

ASR_MODEL = "gpt-4o-mini-transcribe"
CLEANUP_MODEL = "gpt-4o-mini"
TTS_MODEL = "gpt-4o-mini-tts"
TTS_VOICE = "coral"

PLAYBACK_QUEUE_MAX = 5
OPENAI_TIMEOUT = 15

REALTIME_API_URL = "wss://api.openai.com/v1/realtime"
