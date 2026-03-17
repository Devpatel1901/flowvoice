import { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function RoomJoin({ onJoin, onSoloMode }) {
  const [roomId, setRoomId] = useState("");
  const [role, setRole] = useState("stutter");
  const [roomStatus, setRoomStatus] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (roomId.length < 2) {
      setRoomStatus(null);
      return;
    }
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch(`${API_BASE}/api/rooms/${roomId}`);
        if (res.ok) setRoomStatus(await res.json());
      } catch {
        setRoomStatus(null);
      } finally {
        setChecking(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [roomId]);

  const generateId = () => {
    setRoomId(Math.random().toString(36).substring(2, 8));
  };

  const roleTaken =
    roomStatus &&
    ((role === "stutter" && roomStatus.stutter) ||
      (role === "listener" && roomStatus.listener));
  const canJoin = roomId.trim().length >= 2 && !roleTaken;

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
            StutterAI
          </h1>
          <p className="mt-3 text-sm" style={{ color: "#A1A1AA" }}>
            Real-time AI speech accessibility companion
          </p>
        </header>

        <div
          className="rounded-[20px] border border-[#2A2A32] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.6)]"
          style={{
            background: "linear-gradient(180deg, #1C1C22, #15151B)",
          }}
        >
          <h2 className="text-center font-semibold mb-6" style={{ fontSize: 22, color: "#F5F5F7" }}>
            Join a Room
          </h2>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2" style={{ color: "#A1A1AA" }}>
              Room ID
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="e.g. demo-room"
                className="flex-1 rounded-xl border border-[#2A2A32] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F9CF9] transition-all"
                style={{ background: "#111116", color: "#F5F5F7" }}
              />
              <button
                onClick={generateId}
                className="rounded-xl border border-[#2A2A32] px-4 py-3 text-sm font-medium transition-all btn-interact"
                style={{ background: "#111116", color: "#D1D5DB" }}
              >
                Random
              </button>
            </div>
          </div>

          {roomStatus && (
            <div
              className="rounded-xl border border-[#2A2A32] px-4 py-3 mb-6 text-xs space-y-1.5"
              style={{ background: "#111116" }}
            >
              <p className="flex justify-between" style={{ color: "#A1A1AA" }}>
                Stutter user:{" "}
                <span style={{ color: roomStatus.stutter ? "#34D399" : "#A1A1AA", fontWeight: 500 }}>
                  {roomStatus.stutter ? "Connected" : "Empty"}
                </span>
              </p>
              <p className="flex justify-between" style={{ color: "#A1A1AA" }}>
                Listener:{" "}
                <span style={{ color: roomStatus.listener ? "#34D399" : "#A1A1AA", fontWeight: 500 }}>
                  {roomStatus.listener ? "Connected" : "Empty"}
                </span>
              </p>
              {roleTaken && (
                <p className="pt-1" style={{ color: "#FF453A" }}>
                  {role === "stutter"
                    ? "Stutter role already taken. Choose Listener."
                    : "Listener role already taken. Choose Stutter."}
                </p>
              )}
              {checking && <p style={{ color: "#A1A1AA" }}>Checking...</p>}
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2" style={{ color: "#A1A1AA" }}>
              Your Role
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setRole("stutter")}
                className={`rounded-xl border-2 px-4 py-4 text-sm font-medium transition-all card-hover ${
                  role === "stutter"
                    ? "border-[#4F9CF9]"
                    : "border-[#2A2A32]"
                }`}
                style={{
                  background: role === "stutter" ? "rgba(79,156,249,0.08)" : "#111116",
                  color: role === "stutter" ? "#4F9CF9" : "#A1A1AA",
                }}
              >
                <div className="font-semibold">I Stutter</div>
                <div className="mt-1 text-xs opacity-80">Your speech will be cleaned</div>
              </button>
              <button
                onClick={() => setRole("listener")}
                className={`rounded-xl border-2 px-4 py-4 text-sm font-medium transition-all card-hover ${
                  role === "listener"
                    ? "border-[#4F9CF9]"
                    : "border-[#2A2A32]"
                }`}
                style={{
                  background: role === "listener" ? "rgba(79,156,249,0.08)" : "#111116",
                  color: role === "listener" ? "#4F9CF9" : "#A1A1AA",
                }}
              >
                <div className="font-semibold">Listener</div>
                <div className="mt-1 text-xs opacity-80">You hear cleaned speech</div>
              </button>
            </div>
          </div>

          <button
            onClick={() => canJoin && onJoin(roomId.trim(), role)}
            disabled={!canJoin}
            className="w-full rounded-xl h-12 text-sm font-semibold transition-all btn-interact disabled:cursor-not-allowed disabled:transform-none"
            style={{
              background: canJoin ? "#4F9CF9" : "#1C1C22",
              color: canJoin ? "#fff" : "#A1A1AA",
            }}
          >
            {roleTaken ? "Role taken" : "Join Room"}
          </button>

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#2A2A32]" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 text-sm" style={{ background: "linear-gradient(180deg, #1C1C22, #15151B)", color: "#A1A1AA" }}>or</span>
            </div>
          </div>

          <button
            onClick={onSoloMode}
            className="w-full rounded-xl h-12 border border-[#2A2A32] text-sm font-medium transition-all btn-interact"
            style={{ background: "#111116", color: "#A1A1AA" }}
          >
            Solo Mode (no room)
          </button>
        </div>
      </div>
    </div>
  );
}
