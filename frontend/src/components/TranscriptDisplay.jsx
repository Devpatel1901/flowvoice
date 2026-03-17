import { useRef, useEffect } from "react";

export default function TranscriptDisplay({ entries }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  return (
    <div className="flex flex-col rounded-xl border border-gray-700 bg-gray-800/80 shadow-lg overflow-hidden">
      <div className="border-b border-gray-700 px-4 py-3 bg-gray-800">
        <h3 className="text-sm font-semibold text-emerald-400">Live transcript</h3>
        <p className="text-xs text-gray-500 mt-0.5">Cleaned speech</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[280px] min-h-[120px] md:max-h-[360px]">
        {entries.length === 0 && (
          <p className="text-sm text-gray-500 italic py-4">No transcripts yet...</p>
        )}
        {entries.map((entry, i) => (
          <div
            key={i}
            className="flex gap-3 text-sm text-gray-200 leading-relaxed pl-3 border-l-2 border-emerald-500/50"
          >
            <span className="shrink-0 text-gray-500 text-xs font-medium w-8">{i + 1}</span>
            <p className="flex-1">{entry}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
