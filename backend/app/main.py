import logging

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from .room_handler import RoomConnectionHandler
from .room_manager import RoomManager
from .websocket_manager import ConnectionManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

app = FastAPI(title="FlowVoice API", version="0.1.0")

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
    await room_handler.handle_connection(websocket, room_id, role)
