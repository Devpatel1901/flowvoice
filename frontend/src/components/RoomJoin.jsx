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
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">StutterAI</h1>
          <p className="mt-2 text-sm text-gray-400">
            Real-time AI speech accessibility companion
          </p>
        </header>

        <div className="rounded-2xl border border-gray-700 bg-gray-800/60 shadow-xl p-6 space-y-6">
          <h2 className="text-lg font-semibold text-center text-gray-100">Join a Room</h2>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Room ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="e.g. demo-room"
                className="flex-1 rounded-xl border border-gray-600 bg-gray-700/80 px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
              <button
                onClick={generateId}
                className="rounded-xl border border-gray-600 bg-gray-700/80 px-4 py-3 text-sm font-medium text-gray-300 hover:bg-gray-600 transition-colors"
              >
                Random
              </button>
            </div>
          </div>

          {roomStatus && (
            <div className="rounded-xl bg-gray-700/40 border border-gray-600/50 px-4 py-3 text-xs text-gray-400 space-y-1.5">
              <p className="flex justify-between">
                Stutter user:{" "}
                <span className={roomStatus.stutter ? "text-emerald-400 font-medium" : "text-gray-500"}>
                  {roomStatus.stutter ? "Connected" : "Empty"}
                </span>
              </p>
              <p className="flex justify-between">
                Listener:{" "}
                <span className={roomStatus.listener ? "text-emerald-400 font-medium" : "text-gray-500"}>
                  {roomStatus.listener ? "Connected" : "Empty"}
                </span>
              </p>
              {roleTaken && (
                <p className="text-amber-400 pt-1">
                  {role === "stutter"
                    ? "Stutter role already taken. Choose Listener."
                    : "Listener role already taken. Choose Stutter."}
                </p>
              )}
              {checking && <p className="text-gray-500">Checking...</p>}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Your Role</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setRole("stutter")}
                className={`rounded-xl border-2 px-4 py-4 text-sm font-medium transition-all ${
                  role === "stutter"
                    ? "border-emerald-500 bg-emerald-600/20 text-emerald-400 shadow-lg shadow-emerald-500/10"
                    : "border-gray-600 text-gray-400 hover:bg-gray-700/50 hover:border-gray-500"
                }`}
              >
                <div className="font-semibold">I Stutter</div>
                <div className="mt-1 text-xs opacity-80">Your speech will be cleaned</div>
              </button>
              <button
                onClick={() => setRole("listener")}
                className={`rounded-xl border-2 px-4 py-4 text-sm font-medium transition-all ${
                  role === "listener"
                    ? "border-blue-500 bg-blue-600/20 text-blue-400 shadow-lg shadow-blue-500/10"
                    : "border-gray-600 text-gray-400 hover:bg-gray-700/50 hover:border-gray-500"
                }`}
              >
                <div className="font-semibold">Listener</div>
                <div className="mt-1 text-xs opacity-80">You hear cleaned speech</div>
              </button>
            </div>
          </div>

          <button
            onClick={() => canJoin && onJoin(roomId.trim(), role)}
            disabled={!canJoin}
            className={`w-full rounded-xl px-4 py-3.5 text-sm font-semibold transition-all ${
              canJoin
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30"
                : "bg-gray-700 text-gray-500 cursor-not-allowed"
            }`}
          >
            {roleTaken ? "Role taken" : "Join Room"}
          </button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-700" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-gray-800/60 px-3 text-sm text-gray-500">or</span>
            </div>
          </div>

          <button
            onClick={onSoloMode}
            className="w-full rounded-xl border border-gray-600 bg-gray-700/40 px-4 py-3 text-sm font-medium text-gray-300 hover:bg-gray-700/60 transition-colors"
          >
            Solo Mode (no room)
          </button>
        </div>
      </div>
    </div>
  );
}
