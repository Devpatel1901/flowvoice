import { useRef, useEffect } from "react";

export default function TranscriptDisplay({ entries }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  return (
    <div className="flex flex-col rounded-lg border border-gray-700 bg-gray-800/50">
      <div className="border-b border-gray-700 px-4 py-2 text-emerald-400">
        <h3 className="text-sm font-semibold">Cleaned Transcript</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-96">
        {entries.length === 0 && (
          <p className="text-sm text-gray-500 italic">No transcripts yet...</p>
        )}
        {entries.map((entry, i) => (
          <p key={i} className="text-sm text-gray-200 leading-relaxed">
            {entry}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
