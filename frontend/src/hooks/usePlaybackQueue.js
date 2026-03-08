import { useRef, useCallback } from "react";

const MAX_QUEUE_SIZE = 5;

export default function usePlaybackQueue(onPlaybackStart, onPlaybackEnd) {
  const queueRef = useRef([]);
  const playingRef = useRef(false);
  const currentUrlRef = useRef(null);
  const currentAudioRef = useRef(null);

  const playNext = useCallback(() => {
    if (playingRef.current || queueRef.current.length === 0) {
      if (queueRef.current.length === 0) {
        onPlaybackEnd?.();
      }
      return;
    }

    playingRef.current = true;
    onPlaybackStart?.();

    const audioData = queueRef.current.shift();
    const blob = new Blob([audioData], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    currentUrlRef.current = url;

    const audio = new Audio(url);
    currentAudioRef.current = audio;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      currentUrlRef.current = null;
      currentAudioRef.current = null;
      playingRef.current = false;
      playNext();
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      currentUrlRef.current = null;
      currentAudioRef.current = null;
      playingRef.current = false;
      playNext();
    };

    audio.play().catch(() => {
      URL.revokeObjectURL(url);
      currentUrlRef.current = null;
      currentAudioRef.current = null;
      playingRef.current = false;
      playNext();
    });
  }, [onPlaybackStart, onPlaybackEnd]);

  const enqueue = useCallback(
    (audioData) => {
      while (queueRef.current.length >= MAX_QUEUE_SIZE) {
        queueRef.current.shift();
      }
      queueRef.current.push(audioData);

      if (!playingRef.current) {
        playNext();
      }
    },
    [playNext]
  );

  const clear = useCallback(() => {
    queueRef.current = [];
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }
    playingRef.current = false;
    onPlaybackEnd?.();
  }, [onPlaybackEnd]);

  return { enqueue, clear };
}
