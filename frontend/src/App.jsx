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
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Compact header */}
      <header className="shrink-0 px-4 py-4 border-b border-gray-800">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight">StutterAI</h1>
            <p className="text-xs text-gray-500 mt-0.5">Real-time speech accessibility</p>
          </div>
          {isRoom && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span>Room: <span className="text-gray-300 font-mono">{roomId}</span></span>
              <span className="text-gray-700">·</span>
              <span className={role === "stutter" ? "text-emerald-400" : "text-blue-400"}>{roleLabel}</span>
              <span className="text-gray-700">·</span>
              <span className={peerConnected ? "text-emerald-400" : "text-gray-500"}>
                {peerConnected ? "Partner connected" : "Waiting..."}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Alerts */}
      {joinError && (
        <div className="mx-4 mt-2 rounded-lg border border-red-700 bg-red-900/30 px-4 py-2 text-sm text-red-300">
          {joinError}
        </div>
      )}
      {!connected && (
        <div className="mx-4 mt-2 rounded-lg border border-yellow-700 bg-yellow-900/30 px-4 py-2 text-sm text-yellow-300">
          Connecting to server...
        </div>
      )}
      {isRoom && !peerConnected && !joinError && (
        <div className="mx-4 mt-2 rounded-lg border border-blue-700 bg-blue-900/30 px-4 py-2 text-sm text-blue-300">
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
        <div className="shrink-0 px-4 pb-2 max-w-6xl mx-auto w-full">
          <p className="text-xs text-gray-500 text-center">
            {role === "stutter"
              ? "Your speech is processed and sent as clean audio to your partner."
              : "You hear your partner's cleaned speech. Your voice is relayed to them."}
          </p>
        </div>
      )}

      {/* Bottom meeting control bar */}
      <div className="shrink-0 border-t border-gray-800 bg-gray-900/95 backdrop-blur py-4 px-4">
        <div className="max-w-2xl mx-auto flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={handleToggleMute}
            className={`flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-all hover:scale-105 active:scale-95 ${
              isMuted
                ? "bg-gray-700 hover:bg-gray-600 text-white"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
            title={isMuted ? "Unmute microphone" : "Mute microphone"}
          >
            {isMuted ? (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /><line x1="1" y1="1" x2="23" y2="23" strokeWidth="2" strokeLinecap="round" /></svg>
                <span>Unmute</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                <span>Mute</span>
              </>
            )}
          </button>
          <button
            onClick={handleToggleSpeaker}
            className={`flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-all hover:scale-105 active:scale-95 ${
              isSpeakerMuted
                ? "bg-gray-700 hover:bg-gray-600 text-white"
                : "bg-blue-600 hover:bg-blue-500 text-white"
            }`}
            title={isSpeakerMuted ? "Unmute speaker" : "Mute speaker"}
          >
            {isSpeakerMuted ? (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M17.657 6.343a8 8 0 010 11.314M5.8 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.8l4.5-5.5v15l-4.5-5.5z" /><line x1="2" y1="2" x2="22" y2="22" strokeWidth="2" strokeLinecap="round" /></svg>
                <span>Speaker off</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.121-2.121a8 8 0 000-11.314M5.8 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.8l4.5-5.5v15L5.8 15z" /></svg>
                <span>Speaker on</span>
              </>
            )}
          </button>
          <StatusIndicator status={status} />
          {latency !== null && (
            <span className="text-xs text-gray-500 px-2">{latency}ms</span>
          )}
          {!isRoom && (
            <label className="flex cursor-pointer items-center gap-2 rounded-full bg-gray-800 px-4 py-2">
              <span className="text-sm text-gray-400">Assist</span>
              <div
                className={`relative h-6 w-11 rounded-full transition-colors cursor-pointer ${
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
            className="flex items-center gap-2 rounded-full bg-red-600 hover:bg-red-500 px-5 py-3 text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95"
            title="Leave meeting"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2H5z" /></svg>
            <span>Leave</span>
          </button>
        </div>
      </div>
    </div>
  );
}
