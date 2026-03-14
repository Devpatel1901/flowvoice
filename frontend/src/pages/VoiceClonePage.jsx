import { useState, useRef, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

const SENTENCES = [
  "Today I plan to finish a few tasks and maybe take a short walk outside.",
  "Sometimes it takes me a little longer to say what I want, but I always get there.",
  "I enjoy talking with people and sharing ideas during a relaxed conversation.",
];

export default function VoiceClonePage({ roomId, onProceed, onBack }) {
  const [name, setName] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const displayName = name.trim() || "session";

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start(1000);
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((d) => {
          if (d >= 59) {
            clearInterval(timerRef.current);
            stopRecording();
          }
          return d + 1;
        });
      }, 1000);
    } catch (err) {
      setError(`Microphone error: ${err.message || err.name || String(err)}`);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      setIsRecording(false);
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (chunksRef.current.length === 0 || duration < 30) {
      setError("Please record at least 30 seconds of audio.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("name", (name.trim() || "session") + "_" + Date.now());
      formData.append("samples", blob, "recording.webm");

      const res = await fetch(`${API_BASE}/api/clone`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail || res.status);
        throw new Error(detail);
      }
      const data = await res.json();
      onProceed(data.user.voiceId);
    } catch (err) {
      setError(err.message || "Voice clone failed");
    } finally {
      setLoading(false);
    }
  }, [name, duration, onProceed]);

  const handleSkip = useCallback(() => {
    onProceed(null);
  }, [onProceed]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="w-full max-w-md px-4">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">StutterAI</h1>
          <p className="mt-1 text-sm text-gray-400">
            Clone your voice for personalized speech output
          </p>
        </header>

        <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6 space-y-5">
          <h2 className="text-lg font-semibold text-center">Voice Clone</h2>
          <p className="text-sm text-gray-400 text-center">
            Record 30–60 seconds of your voice. The assistant will use it to speak in your style. Room:{" "}
            <span className="font-mono text-gray-300">{roomId}</span>
          </p>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Name (optional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="session"
              className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm text-gray-400">Read these sentences aloud:</label>
            <ol className="list-decimal list-inside space-y-3 text-sm text-gray-300">
              {SENTENCES.map((s, i) => (
                <li key={i}>{s.replace("{name}", displayName)}</li>
              ))}
            </ol>
          </div>

          {isRecording ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span>Recording... {duration}s</span>
              </div>
              <p className="text-xs text-gray-500 text-center">
                {duration < 30 ? `Record at least ${30 - duration} more seconds` : "You can stop now (30–60 sec recommended)"}
              </p>
              <button
                onClick={stopRecording}
                disabled={duration < 30}
                className="w-full rounded-md px-4 py-2.5 text-sm font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Stop Recording
              </button>
            </div>
          ) : duration > 0 && chunksRef.current.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-400 text-center">
                Recorded {duration}s. Ready to clone.
              </p>
              <button
                onClick={handleUpload}
                disabled={loading}
                className="w-full rounded-md px-4 py-2.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Cloning..." : "Clone Voice & Join Room"}
              </button>
              <button
                onClick={() => {
                  setDuration(0);
                  chunksRef.current = [];
                  startRecording();
                }}
                disabled={loading}
                className="w-full rounded-md px-4 py-2 text-sm text-gray-400 hover:bg-gray-700 transition-colors"
              >
                Record Again
              </button>
            </div>
          ) : (
            <button
              onClick={startRecording}
              className="w-full rounded-md px-4 py-2.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 transition-colors"
            >
              Start Recording
            </button>
          )}

          {error && (
            <div className="rounded-md bg-red-900/30 border border-red-700 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="relative pt-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-700" />
            </div>
            <div className="relative flex justify-center">
              <button
                onClick={handleSkip}
                className="rounded-md border border-gray-600 px-4 py-2 text-sm text-gray-400 hover:bg-gray-700 transition-colors"
              >
                Skip & use default voice
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={onBack}
          className="mt-4 w-full rounded-md border border-gray-600 px-4 py-2 text-sm text-gray-400 hover:bg-gray-700 transition-colors"
        >
          Back to room selection
        </button>
      </div>
    </div>
  );
}
