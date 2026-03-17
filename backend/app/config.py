import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "")
ELEVENLABS_TIMEOUT = int(os.getenv("ELEVENLABS_TIMEOUT", "30"))

ASR_MODEL = "gpt-4o-mini-transcribe"
CLEANUP_MODEL = "gpt-4o-mini"
TTS_MODEL = "gpt-4o-mini-tts"
TTS_VOICE = "coral"

PLAYBACK_QUEUE_MAX = 5
OPENAI_TIMEOUT = 15

REALTIME_API_URL = "wss://api.openai.com/v1/realtime"
