import { useState, useCallback, useRef, useEffect } from "react";
import useWebSocket from "./hooks/useWebSocket";
import useAudioCapture from "./hooks/useAudioCapture";
import usePlaybackQueue from "./hooks/usePlaybackQueue";
import usePCMPlayback from "./hooks/usePCMPlayback";
import StatusIndicator from "./components/StatusIndicator";
import TranscriptDisplay from "./components/TranscriptDisplay";
import RoomJoin from "./components/RoomJoin";

const SOLO_WS_URL = "ws://localhost:8000/ws/audio";
const ROOM_WS_BASE = "ws://localhost:8000/ws/room";

function roomWsUrl(roomId, role) {
  return `${ROOM_WS_BASE}/${roomId}/${role}`;
}

export default function App() {
  // ── Navigation state ────────────────────────────────────────────────
  const [mode, setMode] = useState(null); // null | "solo" | "room"
  const [roomId, setRoomId] = useState(null);
  const [role, setRole] = useState(null); // "stutter" | "listener"

  // ── Session state ───────────────────────────────────────────────────
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("idle");
  const [assistMode, setAssistMode] = useState(true);
  const [cleanedEntries, setCleanedEntries] = useState([]);
  const [latency, setLatency] = useState(null);
  const [peerConnected, setPeerConnected] = useState(false);
  const [joinError, setJoinError] = useState(null);

  const assistRef = useRef(true);
  assistRef.current = assistMode;
  const partnerLeftRef = useRef(null);

  // ── Determine WebSocket URL ─────────────────────────────────────────
  const wsUrl =
    mode === "room" && roomId && role
      ? roomWsUrl(roomId, role)
      : SOLO_WS_URL;

  // ── Callbacks ───────────────────────────────────────────────────────
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

  const handlePeerStatus = useCallback((s) => {
    if (s === "connected") {
      setPeerConnected(true);
    } else if (s === "disconnected") {
      setPeerConnected(false);
      partnerLeftRef.current?.();
    }
  }, []);

  const handleError = useCallback((message) => {
    setJoinError(message || "Connection error");
  }, []);

  // ── Playback (TTS MP3 — used by listener in room mode, or solo mode) ─
  const {
    enqueue: enqueueTTS,
    clear: clearTTSQueue,
    warmup: warmupTTS,
  } = usePlaybackQueue(
    () => setStatus("speaking"),
    () => setStatus("listening")
  );

  // ── Playback (PCM relay — used by stutter user to hear listener) ────
  const {
    warmup: warmupPCM,
    feed: feedPCM,
    stop: stopPCM,
  } = usePCMPlayback();

  // ── Interrupt handler (listener stops TTS when they speak) ──────────
  const handleInterrupt = useCallback(() => {
    clearTTSQueue();
  }, [clearTTSQueue]);

  // ── Wire audio callbacks based on role ──────────────────────────────
  const handleAudio = useCallback(
    (data) => {
      enqueueTTS(data);
    },
    [enqueueTTS]
  );

  const handlePCM = useCallback(
    (data) => {
      feedPCM(data);
    },
    [feedPCM]
  );

  // ── WebSocket ───────────────────────────────────────────────────────
  const { connected, connect, disconnect, sendBinary, sendJson } = useWebSocket(
    wsUrl,
    {
      onTranscript: handleTranscript,
      onAudio: handleAudio,
      onPCM: handlePCM,
      onStatus: handleStatus,
      onLatency: handleLatency,
      onPeerStatus: handlePeerStatus,
      onInterrupt: handleInterrupt,
      onError: handleError,
    }
  );

  const { start: startCapture, stop: stopCapture } = useAudioCapture(sendBinary);

  const handlePartnerLeft = useCallback(() => {
    stopCapture();
    disconnect();
    clearTTSQueue();
    stopPCM();
    setActive(false);
    setMode(null);
    setRoomId(null);
    setRole(null);
    setStatus("idle");
    setCleanedEntries([]);
    setLatency(null);
    setPeerConnected(false);
    setJoinError(null);
  }, [stopCapture, disconnect, clearTTSQueue, stopPCM]);
  partnerLeftRef.current = handlePartnerLeft;

  // ── Auto-connect when entering room ─────────────────────────────────
  useEffect(() => {
    if (mode === "room" && roomId && role) {
      setJoinError(null);
      try {
        warmupTTS();
      } catch (e) {
        console.warn("Failed to warmup TTS AudioContext:", e);
      }
      
      const doConnect = async () => {
        if (role === "stutter") {
          try {
            await warmupPCM();
          } catch (e) {
            console.warn("Failed to warmup PCM AudioContext:", e);
          }
        }
        try {
          connect();
        } catch (e) {
          console.error("WebSocket connect failed:", e);
          setJoinError("Failed to open connection to server.");
        }
      };
      
      doConnect();
    }
  }, [mode, roomId, role, connect, warmupTTS, warmupPCM]);

  // ── Toggle start / stop ─────────────────────────────────────────────
  const handleToggle = useCallback(async () => {
    if (active) {
      stopCapture();
      clearTTSQueue();
      stopPCM();
      setActive(false);
      setStatus("idle");
      if (mode === "solo") {
        disconnect();
      }
    } else {
      setJoinError(null);
      if (mode === "solo") {
        try {
          warmupTTS();
        } catch (e) {
          console.warn(e);
        }
        try {
          connect();
        } catch (e) {
          console.warn(e);
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      try {
        await startCapture();
        setActive(true);
        setStatus("listening");
      } catch (err) {
        console.error("Start capture failed:", err);
        setJoinError(`Microphone error: ${err.message || err.name || String(err)}`);
      }
    }
  }, [
    active, mode, connect, disconnect,
    startCapture, stopCapture,
    clearTTSQueue, warmupTTS,
    stopPCM,
  ]);

  // ── Room join handlers ──────────────────────────────────────────────
  const handleJoinRoom = useCallback((id, r) => {
    setRoomId(id);
    setRole(r);
    setMode("room");
    setCleanedEntries([]);
    setLatency(null);
    setPeerConnected(false);
    setJoinError(null);
  }, []);

  const handleSoloMode = useCallback(() => {
    setMode("solo");
    setRole(null);
    setRoomId(null);
    setCleanedEntries([]);
    setLatency(null);
  }, []);

  const handleLeaveRoom = useCallback(() => {
    if (active) {
      stopCapture();
      disconnect();
      clearTTSQueue();
      stopPCM();
      setActive(false);
    }
    setMode(null);
    setRoomId(null);
    setRole(null);
    setStatus("idle");
    setCleanedEntries([]);
    setLatency(null);
    setPeerConnected(false);
    setJoinError(null);
  }, [active, stopCapture, disconnect, clearTTSQueue, stopPCM]);

  // ── Landing screen ──────────────────────────────────────────────────
  if (mode === null) {
    return <RoomJoin onJoin={handleJoinRoom} onSoloMode={handleSoloMode} />;
  }

  // ── Main session UI ─────────────────────────────────────────────────
  const isRoom = mode === "room";
  const roleLabel =
    role === "stutter" ? "Stutter User" : role === "listener" ? "Listener" : "";

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">FlowVoice</h1>
          <p className="mt-1 text-sm text-gray-400">
            Real-time AI speech accessibility companion
          </p>
          {isRoom && (
            <div className="mt-2 flex items-center justify-center gap-3 text-xs text-gray-500">
              <span>
                Room: <span className="text-gray-300 font-mono">{roomId}</span>
              </span>
              <span className="text-gray-700">|</span>
              <span>
                Role:{" "}
                <span
                  className={
                    role === "stutter" ? "text-emerald-400" : "text-blue-400"
                  }
                >
                  {roleLabel}
                </span>
              </span>
              <span className="text-gray-700">|</span>
              <span>
                Partner:{" "}
                <span
                  className={
                    peerConnected ? "text-emerald-400" : "text-gray-500"
                  }
                >
                  {peerConnected ? "Connected" : "Waiting..."}
                </span>
              </span>
            </div>
          )}
        </header>

        {/* Controls bar */}
        <div className="mb-6 flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800/50 px-6 py-4">
          <div className="flex items-center gap-4">
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
              <span className="text-xs text-gray-500">{latency}ms</span>
            )}

            {/* Assist toggle only in solo mode */}
            {!isRoom && (
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
            )}

            <button
              onClick={handleLeaveRoom}
              className="rounded-md border border-gray-600 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-700 transition-colors"
            >
              Leave
            </button>
          </div>
        </div>

        {joinError && (
          <div className="mb-4 rounded-lg border border-red-700 bg-red-900/30 px-4 py-2 text-sm text-red-300">
            {joinError}
          </div>
        )}

        {!connected && active && (
          <div className="mb-4 rounded-lg border border-yellow-700 bg-yellow-900/30 px-4 py-2 text-sm text-yellow-300">
            Connecting to server...
          </div>
        )}

        {isRoom && !peerConnected && !joinError && (
          <div className="mb-4 rounded-lg border border-blue-700 bg-blue-900/30 px-4 py-2 text-sm text-blue-300">
            Waiting for your partner to join room{" "}
            <span className="font-mono font-semibold">{roomId}</span>...
          </div>
        )}

        <TranscriptDisplay entries={cleanedEntries} />

        {isRoom && (
          <div className="mt-4 rounded-lg border border-gray-700 bg-gray-800/30 px-4 py-3 text-xs text-gray-500">
            {role === "stutter" ? (
              <p>
                Your speech is processed and sent as clean audio to your partner.
                You will hear your partner&apos;s voice directly.
              </p>
            ) : (
              <p>
                You will hear your partner&apos;s cleaned speech.
                Your voice is relayed directly to your partner.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
