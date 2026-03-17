import logging
from typing import Annotated
from urllib.parse import parse_qs

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from .elevenlabs_service import clone_voice as elevenlabs_clone
from .elevenlabs_service import delete_voice as elevenlabs_delete
from .room_handler import RoomConnectionHandler
from .room_manager import RoomManager
from .voice_store import add_voice, list_voices, remove_voice
from .websocket_manager import ConnectionManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("backend.log")
    ]
)

app = FastAPI(title="UnStutterAI API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

manager = ConnectionManager()
room_manager = RoomManager()
room_handler = RoomConnectionHandler(room_manager)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/rooms/{room_id}")
async def room_status(room_id: str):
    return room_manager.room_status(room_id)


# ── Voice clone API ─────────────────────────────────────────────────────────

@app.get("/api/voices")
async def api_list_voices():
    return list_voices()


@app.post("/api/clone")
async def api_clone_voice(
    name: Annotated[str, Form()],
    samples: Annotated[list[UploadFile], File()],
):
    if not name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    if not samples:
        raise HTTPException(status_code=400, detail="At least one audio sample is required")

    sample_data = [(await f.read(), f.content_type or "audio/webm") for f in samples]

    try:
        voice_id = await elevenlabs_clone(name.strip(), sample_data)
        user = add_voice(name.strip(), voice_id, len(samples))
        return {"success": True, "user": user}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/voices/{user_id}")
async def api_delete_voice(user_id: str):
    removed = remove_voice(user_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Voice profile not found")
    await elevenlabs_delete(removed["voiceId"])
    return {"success": True}


@app.websocket("/ws/audio")
async def websocket_audio(websocket: WebSocket):
    await manager.handle_connection(websocket)


@app.websocket("/ws/room/{room_id}/{role}")
async def websocket_room(websocket: WebSocket, room_id: str, role: str):
    if role not in ("stutter", "listener"):
        await websocket.accept()
        await websocket.send_json({"type": "error", "message": f"Invalid role: {role}"})
        await websocket.close(code=4000)
        return
    voice_id = None
    if role == "stutter":
        qs = (websocket.scope.get("query_string") or b"").decode()
        params = parse_qs(qs)
        voice_id = (params.get("voice_id") or [None])[0] or None
    await room_handler.handle_connection(websocket, room_id, role, voice_id=voice_id)
