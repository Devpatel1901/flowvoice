import { useRef, useCallback } from "react";

const SAMPLE_RATE = 24000;

/**
 * Hook that plays back raw 16-bit PCM audio received from the server
 * using an AudioWorklet with a ring buffer for jitter absorption.
 */
export default function usePCMPlayback() {
  const ctxRef = useRef(null);
  const workletRef = useRef(null);

  const warmup = useCallback(async () => {
    let ctx = ctxRef.current;
    
    if (!ctx || ctx.state === "closed") {
      ctx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: SAMPLE_RATE,
      });
      ctxRef.current = ctx;
    }

    try {
      if (!workletRef.current) {
        await ctx.audioWorklet.addModule("/pcm-playback-processor.js");
        const worklet = new AudioWorkletNode(ctx, "pcm-playback-processor");
        worklet.connect(ctx.destination);
        workletRef.current = worklet;
      }
    } catch (e) {
      console.warn("Could not initialize AudioWorklet (Safari might require secure context or direct interaction):", e);
    }

    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch (e) {
        console.warn("Could not resume PCM AudioContext:", e);
      }
    }
  }, []);

  const feed = useCallback((arrayBuffer) => {
    if (workletRef.current) {
      workletRef.current.port.postMessage(arrayBuffer, [arrayBuffer]);
    }
  }, []);

  const stop = useCallback(() => {
    if (workletRef.current) {
      workletRef.current.disconnect();
      workletRef.current = null;
    }
    if (ctxRef.current) {
      ctxRef.current.close();
      ctxRef.current = null;
    }
  }, []);

  return { warmup, feed, stop };
}
