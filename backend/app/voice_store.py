"""Simple JSON-backed store for voice clone profiles."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from uuid import uuid4

logger = logging.getLogger(__name__)

_VOICES_FILE = os.path.join(os.path.dirname(__file__), "voices.json")


def _read() -> dict:
    if not os.path.exists(_VOICES_FILE):
        return {"users": []}
    try:
        with open(_VOICES_FILE) as f:
            return json.load(f)
    except Exception:
        return {"users": []}


def _write(data: dict) -> None:
    with open(_VOICES_FILE, "w") as f:
        json.dump(data, f, indent=2)


def list_voices() -> list[dict]:
    return _read()["users"]


def find_by_name(name: str) -> dict | None:
    return next(
        (u for u in _read()["users"] if u["name"].lower() == name.lower()), None
    )


def add_voice(name: str, voice_id: str, sample_count: int) -> dict:
    data = _read()
    user = {
        "id": str(uuid4()),
        "name": name,
        "voiceId": voice_id,
        "sampleCount": sample_count,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    data["users"].append(user)
    _write(data)
    logger.info("voices_store: saved profile for %s (voice_id=%s)", name, voice_id)
    return user


def remove_voice(user_id: str) -> dict | None:
    data = _read()
    idx = next((i for i, u in enumerate(data["users"]) if u["id"] == user_id), None)
    if idx is None:
        return None
    removed = data["users"].pop(idx)
    _write(data)
    return removed
