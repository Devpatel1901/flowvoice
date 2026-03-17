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
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        background: "radial-gradient(circle at top, #1C1C22 0%, #0B0B0F 60%)",
      }}
    >
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <h1 className="font-bold tracking-tight" style={{ fontSize: 40, color: "#F5F5F7" }}>
            UnStutterAI
          </h1>
          <p className="mt-3 text-sm" style={{ color: "#A1A1AA" }}>
            Clone your voice for personalized speech output
          </p>
        </header>

        <div
          className="rounded-[20px] border border-[#2A2A32] shadow-[0_10px_30px_rgba(0,0,0,0.6)] p-6"
          style={{
            background: "linear-gradient(180deg, #1C1C22, #15151B)",
          }}
        >
          <h2 className="text-center font-semibold mb-2" style={{ fontSize: 22, color: "#F5F5F7" }}>
            Voice Clone
          </h2>
          <p className="text-sm text-center mb-6" style={{ color: "#A1A1AA" }}>
            Record 30–60 seconds of your voice. The assistant will use it to speak in your style. Room:{" "}
            <span className="font-mono" style={{ color: "#D1D5DB" }}>{roomId}</span>
          </p>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2" style={{ color: "#A1A1AA" }}>
              Name (optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="session"
              className="w-full rounded-xl border border-[#2A2A32] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F9CF9] transition-all"
              style={{ background: "#111116", color: "#F5F5F7" }}
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2" style={{ color: "#A1A1AA" }}>
              Read these sentences aloud
            </label>
            <div
              className="rounded-xl border border-[#2A2A32] p-4"
              style={{ background: "#111116" }}
            >
              <ol className="list-decimal list-inside space-y-3 text-sm pl-1" style={{ color: "#D1D5DB" }}>
                {SENTENCES.map((s, i) => (
                  <li key={i}>{s.replace("{name}", displayName)}</li>
                ))}
              </ol>
            </div>
          </div>

          {isRecording ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2" style={{ color: "#34D399" }}>
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF453A] animate-record-pulse" />
                <span className="font-medium">Recording... {duration}s</span>
              </div>
              <p className="text-xs text-center" style={{ color: "#A1A1AA" }}>
                {duration < 30 ? `Record at least ${30 - duration} more seconds` : "You can stop now (30–60 sec recommended)"}
              </p>
              <button
                onClick={stopRecording}
                disabled={duration < 30}
                className="w-full rounded-xl h-12 text-sm font-semibold transition-all btn-interact disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                style={{ background: "#FF453A", color: "#fff" }}
              >
                Stop Recording
              </button>
            </div>
          ) : duration > 0 && chunksRef.current.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-center" style={{ color: "#A1A1AA" }}>
                Recorded {duration}s. Ready to clone.
              </p>
              <button
                onClick={handleUpload}
                disabled={loading}
                className="w-full rounded-xl h-12 text-sm font-semibold transition-all btn-interact disabled:opacity-50"
                style={{ background: "#34D399", color: "#0B0B0F" }}
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
                className="w-full rounded-xl h-12 border border-[#2A2A32] text-sm transition-all btn-interact"
                style={{ background: "#111116", color: "#A1A1AA" }}
              >
                Record Again
              </button>
            </div>
          ) : (
            <button
              onClick={startRecording}
              className="w-full rounded-xl h-12 text-sm font-semibold transition-all btn-interact"
              style={{ background: "#34D399", color: "#0B0B0F" }}
            >
              Start Recording
            </button>
          )}

          {error && (
            <div
              className="rounded-xl border border-[#FF453A] px-4 py-3 text-sm mt-4"
              style={{ background: "rgba(255,69,58,0.1)", color: "#FF453A" }}
            >
              {error}
            </div>
          )}

          <div className="relative pt-4 mt-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#2A2A32]" />
            </div>
            <div className="relative flex justify-center">
              <button
                onClick={handleSkip}
                className="rounded-xl border border-[#2A2A32] px-4 py-2.5 text-sm transition-all btn-interact"
                style={{ background: "#111116", color: "#A1A1AA" }}
              >
                Skip & use default voice
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={onBack}
          className="mt-6 w-full rounded-xl h-12 border border-[#2A2A32] text-sm font-medium transition-all btn-interact"
          style={{ background: "rgba(28,28,34,0.6)", color: "#A1A1AA" }}
        >
          Back to room selection
        </button>
      </div>
    </div>
  );
}
