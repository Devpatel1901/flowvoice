export default function ParticipantCard({ label, isSpeaking, isYou }) {
  return (
    <div
      className={`relative flex flex-col items-center justify-center rounded-2xl border-2 p-6 transition-all duration-300 ${
        isSpeaking
          ? "border-emerald-500 bg-emerald-900/20 shadow-lg shadow-emerald-500/20"
          : "border-gray-700 bg-gray-800/50"
      } ${isYou ? "ring-2 ring-gray-500/50" : ""}`}
    >
      {isSpeaking && (
        <div className="absolute inset-0 rounded-2xl border-2 border-emerald-500 animate-pulse opacity-30 pointer-events-none" />
      )}
      <div
        className={`flex items-center justify-center w-20 h-20 rounded-full transition-all duration-300 ${
          isSpeaking ? "bg-emerald-600/40 animate-speak-pulse" : "bg-gray-700"
        }`}
      >
        <svg
          className={`w-10 h-10 ${isSpeaking ? "text-emerald-300" : "text-gray-400"}`}
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
      </div>
      <span className="mt-3 text-sm font-semibold text-gray-200">{label}</span>
      {isYou && (
        <span className="text-xs text-gray-500 mt-0.5">You</span>
      )}
    </div>
  );
}
