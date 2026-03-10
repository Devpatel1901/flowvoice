import { useState, useEffect } from "react";

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
        const res = await fetch(`http://localhost:8000/api/rooms/${roomId}`);
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
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="w-full max-w-md px-4">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">FlowVoice</h1>
          <p className="mt-1 text-sm text-gray-400">
            Real-time AI speech accessibility companion
          </p>
        </header>

        <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6 space-y-5">
          <h2 className="text-lg font-semibold text-center">Join a Room</h2>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Room ID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="e.g. demo-room"
                className="flex-1 rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
              <button
                onClick={generateId}
                className="rounded-md border border-gray-600 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700"
              >
                Random
              </button>
            </div>
          </div>

          {roomStatus && (
            <div className="rounded-md bg-gray-700/50 px-3 py-2 text-xs text-gray-400 space-y-1">
              <p>
                Stutter user:{" "}
                <span className={roomStatus.stutter ? "text-emerald-400" : "text-gray-500"}>
                  {roomStatus.stutter ? "Connected" : "Empty"}
                </span>
              </p>
              <p>
                Listener:{" "}
                <span className={roomStatus.listener ? "text-emerald-400" : "text-gray-500"}>
                  {roomStatus.listener ? "Connected" : "Empty"}
                </span>
              </p>
              {roleTaken && (
                <p className="text-amber-400">
                  {role === "stutter"
                    ? "Stutter role already taken. Choose Listener."
                    : "Listener role already taken. Choose Stutter."}
                </p>
              )}
              {checking && <p className="text-gray-500">Checking...</p>}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-2">Your Role</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setRole("stutter")}
                className={`rounded-md border px-4 py-3 text-sm font-medium transition-colors ${
                  role === "stutter"
                    ? "border-emerald-500 bg-emerald-600/20 text-emerald-400"
                    : "border-gray-600 text-gray-400 hover:bg-gray-700"
                }`}
              >
                <div className="font-semibold">I Stutter</div>
                <div className="mt-1 text-xs opacity-70">
                  Your speech will be cleaned
                </div>
              </button>
              <button
                onClick={() => setRole("listener")}
                className={`rounded-md border px-4 py-3 text-sm font-medium transition-colors ${
                  role === "listener"
                    ? "border-blue-500 bg-blue-600/20 text-blue-400"
                    : "border-gray-600 text-gray-400 hover:bg-gray-700"
                }`}
              >
                <div className="font-semibold">Listener</div>
                <div className="mt-1 text-xs opacity-70">
                  You hear cleaned speech
                </div>
              </button>
            </div>
          </div>

          <button
            onClick={() => canJoin && onJoin(roomId.trim(), role)}
            disabled={!canJoin}
            className={`w-full rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ${
              canJoin
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-gray-700 text-gray-500 cursor-not-allowed"
            }`}
          >
            {roleTaken ? "Role taken" : "Join Room"}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-gray-800/50 px-2 text-gray-500">or</span>
            </div>
          </div>

          <button
            onClick={onSoloMode}
            className="w-full rounded-md border border-gray-600 px-4 py-2 text-sm text-gray-400 hover:bg-gray-700 transition-colors"
          >
            Solo Mode (no room)
          </button>
        </div>
      </div>
    </div>
  );
}
