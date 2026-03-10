"""Energy-based Voice Activity Detection for listener synchronization."""

import math
import struct


def compute_rms(pcm_bytes: bytes) -> float:
    """Compute RMS energy of 16-bit little-endian PCM audio."""
    n_samples = len(pcm_bytes) // 2
    if n_samples == 0:
        return 0.0
    samples = struct.unpack(f"<{n_samples}h", pcm_bytes)
    sum_sq = sum(s * s for s in samples)
    return math.sqrt(sum_sq / n_samples)


class VADTracker:
    """Hysteresis-based voice activity tracker.

    Speech is detected when RMS exceeds `threshold`.
    Silence is declared only after `silence_frames` consecutive
    frames below threshold (~500ms at 250ms/chunk).
    """

    def __init__(self, threshold: float = 500.0, silence_frames: int = 2):
        self.threshold = threshold
        self.silence_frames = silence_frames
        self._silent_count = 0
        self.speaking = False

    def update(self, pcm_bytes: bytes) -> bool:
        rms = compute_rms(pcm_bytes)
        if rms > self.threshold:
            self._silent_count = 0
            self.speaking = True
        else:
            self._silent_count += 1
            if self._silent_count >= self.silence_frames:
                self.speaking = False
        return self.speaking
