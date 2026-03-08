import { useRef, useCallback, useState } from "react";

const WS_URL = "ws://localhost:8000/ws/audio";

export default function useWebSocket({ onTranscript, onAudio, onStatus, onLatency }) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);

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
            onTranscript?.(msg);
          } else if (msg.type === "status") {
            onStatus?.(msg.status);
          } else if (msg.type === "latency") {
            onLatency?.(msg.ms);
          }
        } catch {
          // ignore malformed JSON
        }
      } else if (event.data instanceof ArrayBuffer) {
        onAudio?.(event.data);
      }
    };

    wsRef.current = ws;
  }, [onTranscript, onAudio, onStatus, onLatency]);

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
