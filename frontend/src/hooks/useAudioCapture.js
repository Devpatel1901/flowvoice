import { useRef, useCallback } from "react";

const SAMPLE_RATE = 24000;

export default function useAudioCapture(sendBinary) {
  const contextRef = useRef(null);
  const streamRef = useRef(null);
  const workletRef = useRef(null);
  const sourceRef = useRef(null);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    streamRef.current = stream;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass({ sampleRate: SAMPLE_RATE });
    contextRef.current = ctx;

    await ctx.audioWorklet.addModule("/audio-processor.js");

    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;

    const worklet = new AudioWorkletNode(ctx, "pcm-processor");
    workletRef.current = worklet;

    worklet.port.onmessage = (event) => {
      sendBinary(event.data);
    };

    source.connect(worklet);
    // don't connect worklet to destination (no local playback of mic)
  }, [sendBinary]);

  const stop = useCallback(() => {
    if (workletRef.current) {
      workletRef.current.port.onmessage = null;
      workletRef.current.disconnect();
      workletRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (contextRef.current) {
      contextRef.current.close();
      contextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  return { start, stop };
}
