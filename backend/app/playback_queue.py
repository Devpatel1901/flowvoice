import asyncio
import logging

from .config import PLAYBACK_QUEUE_MAX

logger = logging.getLogger(__name__)


class PlaybackQueue:
    """Bounded async queue that drops the oldest item when full."""

    def __init__(self, maxsize: int = PLAYBACK_QUEUE_MAX) -> None:
        self._queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=maxsize)

    async def put(self, item: bytes) -> None:
        if self._queue.full():
            try:
                dropped = self._queue.get_nowait()
                logger.warning(
                    "PlaybackQueue: dropped oldest item (%d bytes) to make room",
                    len(dropped),
                )
            except asyncio.QueueEmpty:
                pass
        try:
            self._queue.put_nowait(item)
        except asyncio.QueueFull:
            logger.warning("PlaybackQueue: still full after drop, skipping item")

    async def get(self) -> bytes:
        return await self._queue.get()

    def clear(self) -> None:
        while not self._queue.empty():
            try:
                self._queue.get_nowait()
            except asyncio.QueueEmpty:
                break
        logger.info("PlaybackQueue: cleared")

    @property
    def size(self) -> int:
        return self._queue.qsize()
