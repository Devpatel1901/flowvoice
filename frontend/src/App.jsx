import { useState, useCallback, useRef, useEffect } from "react";
import useWebSocket from "./hooks/useWebSocket";
import useAudioCapture from "./hooks/useAudioCapture";
import usePlaybackQueue from "./hooks/usePlaybackQueue";
import usePCMPlayback from "./hooks/usePCMPlayback";
import StatusIndicator from "./components/StatusIndicator";
import TranscriptDisplay from "./components/TranscriptDisplay";
import ParticipantCard from "./components/ParticipantCard";
import RoomJoin from "./components/RoomJoin";
import VoiceClonePage from "./pages/VoiceClonePage";

// Derive the WebSocket URL dynamically so other devices on the same network can hit it via proxy
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsHost = window.location.host; // includes port (e.g., 5173)
const SOLO_WS_URL = `${wsProtocol}//${wsHost}/ws/audio`;
const ROOM_WS_BASE = `${wsProtocol}//${wsHost}/ws/room`;

function roomWsUrl(roomId, role, voiceId) {
  let url = `${ROOM_WS_BASE}/${roomId}/${role}`;
  if (role === "stutter" && voiceId) {
    url += `?voice_id=${encodeURIComponent(voiceId)}`;
  }
  return url;
}

export default function App() {
  // ── Navigation state ────────────────────────────────────────────────
  const [mode, setMode] = useState(null); // null | "solo" | "room" | "voiceClone"
  const [roomId, setRoomId] = useState(null);
  const [role, setRole] = useState(null); // "stutter" | "listener"
  const [voiceId, setVoiceId] = useState(null);

  // ── Session state ───────────────────────────────────────────────────
  const [isMuted, setIsMuted] = useState(true);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const speakerMutedRef = useRef(false);
  speakerMutedRef.current = isSpeakerMuted;
  
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
      ? roomWsUrl(roomId, role, voiceId)
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
    clear: clearPCM,
  } = usePCMPlayback();

  // ── Interrupt handler (listener stops TTS when they speak) ──────────
  const handleInterrupt = useCallback(() => {
    clearTTSQueue();
    clearPCM();
  }, [clearTTSQueue, clearPCM]);

  // ── Wire audio callbacks based on role ──────────────────────────────
  const handleAudio = useCallback(
    (data) => {
      if (!speakerMutedRef.current) {
        enqueueTTS(data);
      }
    },
    [enqueueTTS]
  );

  const handlePCM = useCallback(
    (data) => {
      if (!speakerMutedRef.current) {
        feedPCM(data);
      }
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
    clearPCM();
    stopPCM();
    setIsMuted(true);
    setMode(null);
    setRoomId(null);
    setRole(null);
    setVoiceId(null);
    setStatus("idle");
    setCleanedEntries([]);
    setLatency(null);
    setPeerConnected(false);
    setJoinError(null);
  }, [stopCapture, disconnect, clearTTSQueue, clearPCM, stopPCM]);
  partnerLeftRef.current = handlePartnerLeft;

  // ── Auto-connect when entering room ─────────────────────────────────
  useEffect(() => {
    if (mode === "room" && roomId && role) {
      setJoinError(null);
      // Try initializing AudioContext right away so we can hear
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
      
      return () => {
        disconnect();
      }
    }
  }, [mode, roomId, role, connect, warmupTTS, warmupPCM, disconnect]);

  // ── Toggle Mute / Unmute ────────────────────────────────────────────
  const handleToggleMute = useCallback(async () => {
    if (!isMuted) {
      stopCapture();
      setIsMuted(true);
      setStatus("idle");
      sendJson({ type: "mute" });
    } else {
      setJoinError(null);
      // If we are in Solo mode, the user isn't auto-connected until they start
      if (mode === "solo" && !connected) {
        try { warmupTTS(); } catch (e) { console.warn(e); }
        try { connect(); } catch (e) { console.warn(e); }
        await new Promise((r) => setTimeout(r, 500));
      }
      
      try {
        await startCapture();
        setIsMuted(false);
        setStatus("listening");
      } catch (err) {
        console.error("Start capture failed:", err);
        setJoinError(`Microphone error: ${err.message || err.name || String(err)}`);
      }
    }
  }, [
    isMuted, mode, connected, connect,
    startCapture, stopCapture, warmupTTS
  ]);

  const handleToggleSpeaker = useCallback(() => {
    setIsSpeakerMuted(prev => {
      const isNowMuted = !prev;
      if (isNowMuted) {
        clearTTSQueue();
        clearPCM();
      }
      return isNowMuted;
    });
  }, [clearTTSQueue, clearPCM]);

  // ── Room join handlers ──────────────────────────────────────────────
  const handleJoinRoom = useCallback((id, r) => {
    setRoomId(id);
    setRole(r);
    setIsMuted(true); // Always join muted
    setCleanedEntries([]);
    setLatency(null);
    setPeerConnected(false);
    setJoinError(null);
    if (r === "stutter") {
      setMode("voiceClone"); // Stutter user: voice clone step first
    } else {
      setMode("room"); // Listener: go straight to room
    }
  }, []);

  const handleProceedFromVoiceClone = useCallback((vid) => {
    setVoiceId(vid);
    setMode("room");
  }, []);

  const handleBackFromVoiceClone = useCallback(() => {
    setMode(null);
    setRoomId(null);
    setRole(null);
    setVoiceId(null);
  }, []);

  const handleSoloMode = useCallback(() => {
    setMode("solo");
    setRole(null);
    setRoomId(null);
    setIsMuted(true); // Start Solo mode muted
    setCleanedEntries([]);
    setLatency(null);
  }, []);

  const handleLeaveRoom = useCallback(() => {
    stopCapture();
    disconnect();
    clearTTSQueue();
    clearPCM();
    stopPCM();
    setIsMuted(true);
    setMode(null);
    setRoomId(null);
    setRole(null);
    setVoiceId(null);
    setStatus("idle");
    setCleanedEntries([]);
    setLatency(null);
    setPeerConnected(false);
    setJoinError(null);
  }, [stopCapture, disconnect, clearTTSQueue, clearPCM, stopPCM]);

  // ── Landing screen ──────────────────────────────────────────────────
  if (mode === null) {
    return <RoomJoin onJoin={handleJoinRoom} onSoloMode={handleSoloMode} />;
  }

  // ── Voice clone (stutter user only, before room) ────────────────────
  if (mode === "voiceClone" && roomId && role === "stutter") {
    return (
      <VoiceClonePage
        roomId={roomId}
        onProceed={handleProceedFromVoiceClone}
        onBack={handleBackFromVoiceClone}
      />
    );
  }

  // ── Main session UI ─────────────────────────────────────────────────
  const isRoom = mode === "room";
  const roleLabel =
    role === "stutter" ? "Stutter User" : role === "listener" ? "Listener" : "";

  const isStutterSpeaking =
    (role === "stutter" && !isMuted) || (role === "listener" && status === "speaking");
  const isListenerSpeaking =
    (role === "listener" && !isMuted) || (role === "stutter" && status === "speaking");

  return (
    <div
      className="min-h-screen text-white flex flex-col"
      style={{
        background: "radial-gradient(circle at top, #1C1C22 0%, #0B0B0F 60%)",
      }}
    >
      {/* Compact header */}
      <header className="shrink-0 px-6 py-4 border-b border-[#2A2A32] bg-[#0B0B0F]/80 backdrop-blur-[10px]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight" style={{ color: "#F5F5F7" }}>
              UnStutterAI
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "#A1A1AA" }}>
              Real-time speech accessibility
            </p>
          </div>
          {isRoom && (
            <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "#A1A1AA" }}>
              <span>Room: <span className="font-mono" style={{ color: "#D1D5DB" }}>{roomId}</span></span>
              <span style={{ color: "#2A2A32" }}>·</span>
              <span style={{ color: role === "stutter" ? "#34D399" : "#4F9CF9" }}>{roleLabel}</span>
              <span style={{ color: "#2A2A32" }}>·</span>
              <span style={{ color: peerConnected ? "#34D399" : "#A1A1AA" }}>
                {peerConnected ? "Partner connected" : "Waiting..."}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Alerts */}
      {joinError && (
        <div className="mx-4 mt-3 rounded-xl border border-[#FF453A] px-4 py-3 text-sm" style={{ background: "rgba(255,69,58,0.1)", color: "#FF453A" }}>
          {joinError}
        </div>
      )}
      {!connected && (
        <div className="mx-4 mt-3 rounded-xl border border-[#4F9CF9] px-4 py-3 text-sm" style={{ background: "rgba(79,156,249,0.1)", color: "#4F9CF9" }}>
          Connecting to server...
        </div>
      )}
      {isRoom && !peerConnected && !joinError && (
        <div className="mx-4 mt-3 rounded-xl border border-[#4F9CF9] px-4 py-3 text-sm" style={{ background: "rgba(79,156,249,0.1)", color: "#4F9CF9" }}>
          Waiting for your partner to join room <span className="font-mono font-semibold">{roomId}</span>...
        </div>
      )}

      {/* Main: participant grid + transcript side panel */}
      <main className="flex-1 flex flex-col lg:flex-row gap-4 p-4 max-w-6xl w-full mx-auto overflow-auto">
        <section className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 content-start min-h-0">
          <ParticipantCard
            label="Stutter User"
            isSpeaking={isStutterSpeaking}
            isYou={role === "stutter"}
          />
          <ParticipantCard
            label={isRoom ? "Listener" : "Assistant"}
            isSpeaking={isListenerSpeaking}
            isYou={role === "listener"}
          />
        </section>
        <aside className="w-full lg:w-80 xl:w-96 shrink-0 flex flex-col min-h-0">
          <TranscriptDisplay entries={cleanedEntries} />
        </aside>
      </main>

      {/* Role description (room only) */}
      {isRoom && (
        <div className="shrink-0 px-4 pb-3 max-w-6xl mx-auto w-full">
          <p className="text-xs text-center" style={{ color: "#A1A1AA" }}>
            {role === "stutter"
              ? "Your speech is processed and sent as clean audio to your partner."
              : "You hear your partner's cleaned speech. Your voice is relayed to them."}
          </p>
        </div>
      )}

      {/* Bottom meeting control bar */}
      <div
        className="shrink-0 border-t border-[#2A2A32] py-4 px-4 backdrop-blur-[10px]"
        style={{ background: "rgba(11,11,15,0.8)" }}
      >
        <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={handleToggleMute}
            className="flex items-center justify-center w-14 h-14 rounded-full text-white font-semibold transition-all btn-interact"
            style={{
              background: isMuted ? "#FF453A" : "#1C1C22",
            }}
            title={isMuted ? "Unmute microphone" : "Mute microphone"}
          >
            {isMuted ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /><line x1="1" y1="1" x2="23" y2="23" strokeWidth="2" strokeLinecap="round" /></svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            )}
          </button>
          <button
            onClick={handleToggleSpeaker}
            className={`flex items-center justify-center w-14 h-14 rounded-full text-white font-semibold transition-all btn-interact ${
              !isSpeakerMuted ? "bg-[#4F9CF9] hover:bg-[#3B82F6]" : ""
            }`}
            style={isSpeakerMuted ? { background: "#1C1C22" } : undefined}
            title={isSpeakerMuted ? "Unmute speaker" : "Mute speaker"}
          >
            {isSpeakerMuted ? (
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </button>
          <StatusIndicator status={status} />
          {latency !== null && (
            <span className="text-xs px-2" style={{ color: "#A1A1AA" }}>{latency}ms</span>
          )}
          {!isRoom && (
            <label className="flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 transition-all btn-interact" style={{ background: "#1C1C22", border: "1px solid #2A2A32" }}>
              <span className="text-sm" style={{ color: "#A1A1AA" }}>Assist</span>
              <div
                className={`relative h-6 w-11 rounded-full transition-colors cursor-pointer ${
                  assistMode ? "" : "opacity-60"
                }`}
                style={{ background: assistMode ? "#34D399" : "#2A2A32" }}
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
            className="flex items-center justify-center w-14 h-14 rounded-full text-white font-semibold transition-all btn-interact bg-[#FF453A] hover:bg-[#E03E34]"
            title="Leave meeting"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2H5z" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
