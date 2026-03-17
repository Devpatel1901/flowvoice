# UnStutterAI

Real-time AI speech accessibility companion designed to help people who stutter communicate more fluently in live conversations. The app transcribes speech in real time, removes disfluencies (repetitions, fillers, prolongations) while preserving meaning, and streams back natural-sounding audio so listeners hear a cleaner, more fluent version of what was intended.

---

## 1. Introduction (Use Case)

- **Problem**: Stuttering can make real-time conversations and meetings stressful and harder to follow for both speaker and listener.
- **Solution**: UnStutterAI provides an **assistive live “speech cleanup” layer** for conferencing. The stutter user speaks normally; the listener hears cleaned audio produced by the AI pipeline.
- **Modes**:
  - **Solo mode**: run the pipeline locally for demos/practice.
  - **Room mode**: two-person “meeting” with roles (**Stutter User** and **Listener**) and real-time routing between them.

---

## 2. Prerequisites & Setup (Any PC)

### Prerequisites

- **Python**: 3.12+
- **Node.js**: 18+
- **uv** package manager: [Astral uv](https://docs.astral.sh/uv/)
- API keys:
  - **OpenAI** key with access to Realtime API + `gpt-4o-mini`
  - **ElevenLabs** key for TTS + voice cloning

### Backend setup

```bash
cd backend

# Create .env (example)
cat <<'EOF' > .env
OPENAI_API_KEY=sk-your-openai-key
ELEVENLABS_API_KEY=your-elevenlabs-key
# Optional: default voice if user skips cloning
ELEVENLABS_VOICE_ID=
EOF

uv sync
```

Run backend:

```bash
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Open the app at `http://localhost:5173` and allow microphone access.

### Configuration notes

- **API base URL**: the frontend uses `VITE_API_URL` (optional). If unset it calls relative `/api/...` and expects the Vite proxy to route to the backend.
- **Network demos**: backend binds to `0.0.0.0` so other devices on the same network can join if you expose the frontend.

---

## 3. Features

- **Solo mode** (no room)
- **Room mode** (two-person meeting):
  - Roles: **Stutter User** and **Listener**
  - **Room status** endpoint to show whether each role is connected
  - **Peer connected** indicators + disconnect handling
- **Live speech cleanup pipeline**:
  - Streaming transcription (OpenAI Realtime API)
  - Disfluency removal (GPT-4o-mini)
  - Synthesized output audio (ElevenLabs TTS)
- **Voice cloning (optional)**:
  - Record **30–60 seconds** in-app
  - Or **upload an MP3**
  - Or **skip** and use a default voice (if configured)
- **Modern conferencing controls**:
  - Mute/unmute mic
  - Speaker mute (local playback mute)
  - Leave meeting
- **Transcript panel** with cleaned messages
- **Status + latency** indicators for each turn
- **Responsive Apple-style premium dark UI** (Plus Jakarta Sans, glass/gradient cards, micro-animations)

---

## 4. Backend Architecture (Meeting + Pipeline)

The backend has **two WebSocket entrypoints**:

- **Solo**: `GET ws://<host>/ws/audio`
- **Room**: `GET ws://<host>/ws/room/{room_id}/{role}?voice_id=...`

Below is a backend-focused diagram emphasizing the meeting pipeline and frontend integration:

```mermaid
flowchart TB
  subgraph Frontend[Frontend - Browser]
    Mic[Mic AudioWorklet 24kHz PCM]
    WsClient[WebSocket Client]
    UI[Meeting UI + Controls]
    Player[Playback Queue (MP3) + PCM Playback]
  end

  subgraph Backend[Backend - FastAPI]
    WsSolo[/ws/audio (solo)/]
    WsRoom[/ws/room/{room_id}/{role} (meeting)/]
    RoomMgr[RoomManager\njoin/leave + role status]
    VAD[VADTracker (listener speaking detection)]
    Hold[Held TTS buffer + interrupt/flush]
  end

  subgraph OpenAI[OpenAI]
    ASR[Realtime ASR\n(gpt-4o-mini-transcribe)]
    Clean[Cleanup\n(GPT-4o-mini)]
  end

  subgraph ElevenLabs[ElevenLabs]
    Clone[Voice Clone\n(voices/add)]
    TTS[TTS\n(eleven_multilingual_v2)]
  end

  Mic --> WsClient --> WsRoom
  WsRoom --> RoomMgr

  %% Stutter user pipeline
  WsRoom -->|PCM stream| ASR -->|Final text| Clean -->|Cleaned text| TTS -->|MP3| Hold -->|MP3 prefixed 0x01| WsRoom --> WsClient --> Player

  %% Listener pipeline
  WsRoom -->|Listener PCM| VAD -->|speaking start| Hold
  VAD -->|speaking stop| Hold
  Hold -->|interrupt JSON| WsRoom
  WsRoom -->|Listener PCM relayed prefixed 0x02| WsClient --> Player

  %% Voice clone control path
  UI -->|POST /api/clone (webm/mp3)| Backend --> Clone
  Clone -->|voice_id| RoomMgr
```

---

## 5. Project Structure

```
backend/
  pyproject.toml
  uv.lock
  app/
    main.py               # FastAPI routes + websockets
    config.py             # env + model constants
    websocket_manager.py  # solo pipeline orchestrator (/ws/audio)
    room_handler.py       # room pipeline orchestrator (/ws/room)
    room_manager.py       # room state + routing + VAD-held TTS logic
    asr_service.py        # OpenAI Realtime transcription websocket
    cleanup_service.py    # GPT cleanup prompt + call
    elevenlabs_service.py # voice clone + ElevenLabs TTS HTTP calls
    tts_service.py        # selects voice_id + calls ElevenLabs
    playback_queue.py     # bounded queue (max 5)
    vad.py                # speaking detection for listener
    voice_store.py        # in-memory store for cloned voices

frontend/
  index.html              # Plus Jakarta Sans
  vite.config.js          # /api proxy
  public/
    audio-processor.js          # AudioWorklet: capture 24kHz PCM
    pcm-playback-processor.js   # PCM playback worklet
  src/
    App.jsx               # meeting flow + controls
    pages/
      VoiceClonePage.jsx  # record/upload MP3/skip cloning
    components/
      RoomJoin.jsx        # room id + role selection + status check
      ParticipantCard.jsx
      TranscriptDisplay.jsx
      StatusIndicator.jsx
    hooks/
      useWebSocket.js
      useAudioCapture.js
      usePlaybackQueue.js
      usePCMPlayback.js
    index.css             # premium dark design system
```

---

## 6. Technical Implementation (End-to-End)

### Audio format + transport

- **Capture**: AudioWorklet captures mic audio and converts to **16-bit PCM** at **24kHz** (mono).
- **Streaming**: PCM is sent to backend over WebSocket as binary frames (~250ms per chunk).

### AI pipeline

1. **ASR (streaming)**: backend streams PCM to the **OpenAI Realtime API** in transcription-only mode (`gpt-4o-mini-transcribe`) with server VAD.
2. **Cleanup**: each final transcript is cleaned using **GPT-4o-mini** with strict rules:
   - remove repetitions/fillers/prolongations
   - preserve intended meaning
   - avoid paraphrasing
3. **TTS**: cleaned text is synthesized into **MP3** via **ElevenLabs** (`eleven_multilingual_v2`) using either:
   - a **cloned voice_id** created from recording/MP3 upload, or
   - a **default voice_id** from env config

### Meeting (room) routing

- **Stutter user → Listener**: cleaned MP3 is routed to the listener.
- **Listener → Stutter user**: listener PCM is relayed so the stutter user can hear them.
- **Interrupt/hold logic**:
  - listener VAD triggers an **interrupt** when they start speaking (so their client can stop TTS playback)
  - cleaned MP3 is **held** while listener is speaking and flushed when they stop (stale audio is dropped)

---

## 7. Collaborators

Add your team here:

| Name | Email |
|------|-------|
| Dev Patel | entrepreneurdev1901@gmail.com |
| Aaryan Purohit | aaryan.prof1@gmail.com |
| Abhishek Patel | abhishek.sutaria@gmail.com |
| Neel Shah | shahneelsachin@gmail.com |
