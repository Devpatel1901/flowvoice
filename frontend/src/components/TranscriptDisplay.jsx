import { useRef, useEffect } from "react";

export default function TranscriptDisplay({ entries }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  return (
    <div
      className="flex flex-col overflow-hidden rounded-[20px] border border-[#2A2A32] shadow-[0_10px_30px_rgba(0,0,0,0.6)]"
      style={{
        background: "linear-gradient(180deg, #1C1C22, #15151B)",
      }}
    >
      <div className="border-b border-[#2A2A32] px-4 py-3 bg-[#111116]/80">
        <h3 className="text-lg font-semibold" style={{ color: "#4F9CF9" }}>
          Live transcript
        </h3>
        <p className="text-xs mt-0.5" style={{ color: "#A1A1AA" }}>
          Cleaned speech
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[280px] min-h-[120px] md:max-h-[360px]">
        {entries.length === 0 && (
          <p
            className="text-sm italic py-6 text-center"
            style={{ color: "#A1A1AA" }}
          >
            Waiting for speech. Your conversation will appear here.
          </p>
        )}
        {entries.map((entry, i) => (
          <div
            key={i}
            className="rounded-xl px-4 py-3 border-l-[3px] border-[#34D399]"
            style={{
              background: "#1C1C22",
              marginBottom: 10,
            }}
          >
            <span
              className="text-xs font-medium block mb-1"
              style={{ color: "#34D399" }}
            >
              Cleaned speech
            </span>
            <p className="text-sm leading-relaxed" style={{ color: "#F5F5F7" }}>
              {entry}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
