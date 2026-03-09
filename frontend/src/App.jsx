import { useState, useCallback, useRef } from "react";
import useWebSocket from "./hooks/useWebSocket";
import useAudioCapture from "./hooks/useAudioCapture";
import usePlaybackQueue from "./hooks/usePlaybackQueue";
import StatusIndicator from "./components/StatusIndicator";
import TranscriptDisplay from "./components/TranscriptDisplay";

export default function App() {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("idle");
  const [assistMode, setAssistMode] = useState(true);
  const [cleanedEntries, setCleanedEntries] = useState([]);
  const [latency, setLatency] = useState(null);

  const assistRef = useRef(true);
  assistRef.current = assistMode;

  const handleTranscript = useCallback((msg) => {
    if (msg.subtype === "cleaned") {
      setCleanedEntries((prev) => [...prev.slice(-49), msg.text]);
      setStatus("listening");
    }
  }, []);

  const handleStatus = useCallback((s) => {
    setStatus(s);
  }, []);

  const handleLatency = useCallback((ms) => {
    setLatency(ms);
  }, []);

  const { enqueue, clear: clearQueue, warmup } = usePlaybackQueue(
    () => setStatus("speaking"),
    () => setStatus("listening")
  );

  const { connected, connect, disconnect, sendBinary, sendJson } = useWebSocket({
    onTranscript: handleTranscript,
    onAudio: enqueue,
    onStatus: handleStatus,
    onLatency: handleLatency,
  });

  const { start: startCapture, stop: stopCapture } = useAudioCapture(sendBinary);

  const handleToggle = useCallback(async () => {
    if (active) {
      stopCapture();
      disconnect();
      clearQueue();
      setActive(false);
      setStatus("idle");
    } else {
      warmup();
      connect();
      await new Promise((r) => setTimeout(r, 500));
      await startCapture();
      setActive(true);
      setStatus("listening");
    }
  }, [active, connect, disconnect, startCapture, stopCapture, clearQueue, warmup]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">FlowVoice</h1>
          <p className="mt-1 text-sm text-gray-400">
            Real-time AI speech accessibility companion
          </p>
        </header>

        <div className="mb-6 flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800/50 px-6 py-4">
          <div className="flex items-center gap-6">
            <button
              onClick={handleToggle}
              className={`rounded-full px-6 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {active ? "Stop" : "Start"}
            </button>
            <StatusIndicator status={status} />
          </div>

          <div className="flex items-center gap-4">
            {latency !== null && (
              <span className="text-xs text-gray-500">
                {latency}ms
              </span>
            )}

            <label className="flex cursor-pointer items-center gap-2">
              <span className="text-sm text-gray-400">Assist</span>
              <div
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  assistMode ? "bg-emerald-600" : "bg-gray-600"
                }`}
                onClick={() => {
                  const next = !assistMode;
                  setAssistMode(next);
                  sendJson({ type: "assist_toggle", enabled: next });
                }}
              >
                <div
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    assistMode ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </div>
            </label>
          </div>
        </div>

        {!connected && active && (
          <div className="mb-4 rounded-lg border border-yellow-700 bg-yellow-900/30 px-4 py-2 text-sm text-yellow-300">
            Connecting to server...
          </div>
        )}

        <TranscriptDisplay entries={cleanedEntries} />
      </div>
    </div>
  );
}
