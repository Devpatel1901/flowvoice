import { useRef, useCallback, useState } from "react";

const PREFIX_MP3 = 0x01;
const PREFIX_PCM = 0x02;

/**
 * @param {string} url - WebSocket URL (dynamic for room mode)
 * @param {object} callbacks
 * @param {function} callbacks.onTranscript
 * @param {function} callbacks.onAudio     - receives MP3 ArrayBuffer (prefixed 0x01 or solo-mode raw)
 * @param {function} callbacks.onPCM       - receives PCM ArrayBuffer (prefixed 0x02, room mode only)
 * @param {function} callbacks.onStatus
 * @param {function} callbacks.onLatency
 * @param {function} callbacks.onPeerStatus
 * @param {function} callbacks.onInterrupt
 * @param {function} callbacks.onError - receives error message string when backend sends type "error"
 */
export default function useWebSocket(url, {
  onTranscript,
  onAudio,
  onPCM,
  onStatus,
  onLatency,
  onPeerStatus,
  onInterrupt,
  onError,
} = {}) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);

  const onTranscriptRef = useRef(onTranscript);
  const onAudioRef = useRef(onAudio);
  const onPCMRef = useRef(onPCM);
  const onStatusRef = useRef(onStatus);
  const onLatencyRef = useRef(onLatency);
  const onPeerStatusRef = useRef(onPeerStatus);
  const onInterruptRef = useRef(onInterrupt);
  onTranscriptRef.current = onTranscript;
  onAudioRef.current = onAudio;
  onPCMRef.current = onPCM;
  onStatusRef.current = onStatus;
  onLatencyRef.current = onLatency;
  onPeerStatusRef.current = onPeerStatus;
  onInterruptRef.current = onInterrupt;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const urlRef = useRef(url);
  urlRef.current = url;

  const connect = useCallback(() => {
    if (wsRef.current) return;

    const ws = new WebSocket(urlRef.current);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
    };

    ws.onerror = (e) => {
      console.error("WebSocket error:", e);
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "transcript") {
            onTranscriptRef.current?.(msg);
          } else if (msg.type === "status") {
            onStatusRef.current?.(msg.status);
          } else if (msg.type === "latency") {
            onLatencyRef.current?.(msg.ms);
          } else if (msg.type === "peer_status") {
            onPeerStatusRef.current?.(msg.status);
          } else if (msg.type === "interrupt") {
            onInterruptRef.current?.();
          } else if (msg.type === "error") {
            onErrorRef.current?.(msg.message);
          }
        } catch {
          // ignore malformed JSON
        }
      } else if (event.data instanceof ArrayBuffer) {
        const view = new Uint8Array(event.data);
        if (view.length === 0) return;

        const prefix = view[0];
        if (prefix === PREFIX_MP3) {
          onAudioRef.current?.(event.data.slice(1));
        } else if (prefix === PREFIX_PCM) {
          onPCMRef.current?.(event.data.slice(1));
        } else {
          // Solo mode: no prefix, entire buffer is MP3
          onAudioRef.current?.(event.data);
        }
      }
    };

    wsRef.current = ws;
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setConnected(false);
    }
  }, []);

  const sendBinary = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  const sendJson = useCallback((obj) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(obj));
    }
  }, []);

  return { connected, connect, disconnect, sendBinary, sendJson };
}
