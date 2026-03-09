import { useRef, useCallback } from "react";

const MAX_QUEUE_SIZE = 5;

export default function usePlaybackQueue(onPlaybackStart, onPlaybackEnd) {
  const queueRef = useRef([]);
  const playingRef = useRef(false);
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);

  const onPlaybackStartRef = useRef(onPlaybackStart);
  const onPlaybackEndRef = useRef(onPlaybackEnd);
  onPlaybackStartRef.current = onPlaybackStart;
  onPlaybackEndRef.current = onPlaybackEnd;

  const warmup = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
  }, []);

  const playNext = useCallback(() => {
    if (playingRef.current || queueRef.current.length === 0) {
      if (queueRef.current.length === 0) {
        onPlaybackEndRef.current?.();
      }
      return;
    }

    const ctx = audioCtxRef.current;
    if (!ctx) {
      console.error("AudioContext not initialized — call warmup() first");
      return;
    }

    playingRef.current = true;
    onPlaybackStartRef.current?.();

    const audioData = queueRef.current.shift();

    ctx.decodeAudioData(
      audioData.slice(0),
      (buffer) => {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        sourceRef.current = source;

        source.onended = () => {
          sourceRef.current = null;
          playingRef.current = false;
          playNext();
        };

        source.start(0);
      },
      (err) => {
        console.error("Audio decode error:", err);
        playingRef.current = false;
        playNext();
      }
    );
  }, []);

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
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        // already stopped
      }
      sourceRef.current = null;
    }
    playingRef.current = false;
    onPlaybackEndRef.current?.();
  }, []);

  return { enqueue, clear, warmup };
}
