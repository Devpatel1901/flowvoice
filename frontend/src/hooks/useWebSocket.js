import { useRef, useCallback, useState } from "react";

const WS_URL = "ws://localhost:8000/ws/audio";

export default function useWebSocket({ onTranscript, onAudio, onStatus, onLatency }) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);

  const onTranscriptRef = useRef(onTranscript);
  const onAudioRef = useRef(onAudio);
  const onStatusRef = useRef(onStatus);
  const onLatencyRef = useRef(onLatency);
  onTranscriptRef.current = onTranscript;
  onAudioRef.current = onAudio;
  onStatusRef.current = onStatus;
  onLatencyRef.current = onLatency;

  const connect = useCallback(() => {
    if (wsRef.current) return;

    const ws = new WebSocket(WS_URL);
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
          }
        } catch {
          // ignore malformed JSON
        }
      } else if (event.data instanceof ArrayBuffer) {
        onAudioRef.current?.(event.data);
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
