# UnStutterAI

Real-time AI speech accessibility companion. Streams microphone audio through OpenAI's Realtime API for transcription, cleans up disfluencies with GPT-4o-mini, and speaks the cleaned text back via OpenAI TTS.

## Architecture

```
Browser Mic (AudioWorklet, 24kHz PCM)
  → WebSocket
  → FastAPI Backend
  → OpenAI Realtime API (streaming ASR, transcription-only mode)
  → On FINAL transcript:
      → GPT-4o-mini cleanup (remove stuttering, fillers)
      → OpenAI TTS (gpt-4o-mini-tts)
  → Return MP3 audio via WebSocket
  → Frontend playback queue (FIFO, max 5, no overlap)
```

## Prerequisites

- Python 3.12+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) package manager
- OpenAI API key with access to Realtime API, GPT-4o-mini, and TTS

## Setup

### Backend

```bash
cd backend

# Create .env with your API key
echo "OPENAI_API_KEY=sk-your-key-here" > .env

# Install dependencies (venv is already created by uv)
uv sync
```

### Frontend

```bash
cd frontend
npm install
```

## Running

Open two terminals:

**Terminal 1 — Backend:**
```bash
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Open http://localhost:5173 in your browser. Click **Start** and allow microphone access.

## Features

- **Start / Stop** toggle for the streaming pipeline
- **Status indicator**: Idle → Listening → Processing → Speaking
- **Dual transcript display**: Raw (as spoken) and Cleaned (disfluencies removed)
- **Assist Mode toggle**: enable/disable the cleanup + TTS pipeline
- **Latency indicator**: shows processing time per transcript segment

## Memory Safety Design

This system is designed to run continuously for 10+ minutes without memory growth:

| Concern | Solution |
|---|---|
| Frontend audio accumulation | AudioWorklet sends 250ms PCM chunks immediately; no blob array stored |
| Frontend playback blobs | `URL.revokeObjectURL()` called after each playback ends |
| Frontend queue overflow | Max 5 items; oldest dropped with cleanup on overflow |
| Backend audio buffering | PCM chunks forwarded immediately to OpenAI; never stored in memory |
| Backend task leaks | All async tasks cancelled and awaited on client disconnect |
| OpenAI API hangs | 15-second timeout on all GPT and TTS calls |
| WebSocket memory leaks | Both browser-side and OpenAI-side WebSockets explicitly closed on stop |
| Backend queue overflow | `asyncio.Queue(maxsize=5)` with drop-oldest policy |
| Transcript list growth | Frontend caps transcript entries at 50 per panel |

## Project Structure

```
backend/
  pyproject.toml          # uv-managed project config
  .env                    # OPENAI_API_KEY
  app/
    main.py               # FastAPI app, CORS, /ws/audio, /health
    config.py             # Environment and constants
    websocket_manager.py  # Per-connection pipeline orchestrator
    asr_service.py        # OpenAI Realtime API WebSocket (transcription-only)
    cleanup_service.py    # GPT-4o-mini text cleanup
    tts_service.py        # OpenAI TTS synthesis
    playback_queue.py     # Bounded async queue with drop-oldest

frontend/
  public/
    audio-processor.js    # AudioWorklet: 24kHz PCM capture
  src/
    App.jsx               # Main UI with controls
    hooks/
      useWebSocket.js     # Native WebSocket management
      useAudioCapture.js  # AudioWorklet mic capture
      usePlaybackQueue.js # FIFO audio playback (max 5)
    components/
      StatusIndicator.jsx # Listening/Processing/Speaking badge
      TranscriptDisplay.jsx # Raw + Cleaned panels
```

## WebSocket Protocol

**Browser → Backend:** Binary frames (16-bit PCM, 24kHz mono, ~250ms chunks)

**Backend → Browser:**
- Text (JSON): `{ "type": "transcript", "subtype": "raw"|"cleaned", "text": "..." }`
- Text (JSON): `{ "type": "status", "status": "processing"|"speaking" }`
- Text (JSON): `{ "type": "latency", "ms": 1234 }`
- Binary: MP3 audio bytes for playback
