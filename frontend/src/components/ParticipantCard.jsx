export default function ParticipantCard({ label, isSpeaking, isYou }) {
  const roleBadgeLabel = label.toUpperCase().replace(/\s+/g, " ");
  return (
    <div
      className={`relative flex flex-col items-center justify-center p-6 transition-all duration-300 rounded-[20px] ${
        isSpeaking
          ? "border-2 border-[#34D399] shadow-[0_0_20px_rgba(52,211,153,0.4)] animate-glow-pulse"
          : "border border-[#2A2A32]"
      } ${isYou ? "ring-2 ring-[#2A2A32]" : ""}`}
      style={{
        background: isSpeaking
          ? "linear-gradient(180deg, rgba(52,211,153,0.08), #15151B)"
          : "linear-gradient(180deg, #1C1C22, #15151B)",
        boxShadow: isSpeaking ? undefined : "0 10px 30px rgba(0,0,0,0.6)",
      }}
    >
      <div
        className={`flex items-center justify-center w-20 h-20 rounded-full transition-all duration-300 ${
          isSpeaking ? "bg-[#34D399]/30 animate-speak-pulse" : "bg-[#2A2A32]"
        }`}
      >
        <svg
          className={`w-10 h-10 ${isSpeaking ? "text-[#34D399]" : "text-[#A1A1AA]"}`}
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
      </div>
      <span
        className="mt-3 text-sm font-semibold"
        style={{ color: "#F5F5F7" }}
      >
        {label}
      </span>
      <span
        className="mt-1 px-2 py-0.5 rounded-lg text-xs font-medium"
        style={{
          background: "rgba(79,156,249,0.12)",
          color: "#4F9CF9",
        }}
      >
        {roleBadgeLabel}
      </span>
      {isYou && (
        <span className="text-xs mt-1" style={{ color: "#A1A1AA" }}>
          You
        </span>
      )}
    </div>
  );
}
