import { useRef, useCallback } from "react";

const SAMPLE_RATE = 24000;

export default function useAudioCapture(sendBinary) {
  const contextRef = useRef(null);
  const streamRef = useRef(null);
  const workletRef = useRef(null);
  const sourceRef = useRef(null);

  const start = useCallback(async () => {
    try {
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
      let ctx = contextRef.current;
      
      // If the context is missing or closed, create a new one inside this user interaction tick
      if (!ctx || ctx.state === "closed") {
        try {
          ctx = new AudioContextClass({ sampleRate: SAMPLE_RATE });
        } catch (e) {
          console.warn("Could not create AudioContext with specific sampleRate, using default fallback", e);
          ctx = new AudioContextClass(); // Fallback for Safari
        }
        contextRef.current = ctx;
      }
      
      // If it's suspended (typical in Safari/Chrome if created outside a click event), resume it NOW
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

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
    } catch (err) {
      console.error("Failed to start capture:", err);
      // Cleanup any partial state if we failed
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      throw err; // Let the caller (App.jsx) pop up the red error box
    }
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
