import { useRef, useEffect } from "react";

function TranscriptPanel({ title, entries, accentColor }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  return (
    <div className="flex flex-1 flex-col rounded-lg border border-gray-700 bg-gray-800/50">
      <div className={`border-b border-gray-700 px-4 py-2 ${accentColor}`}>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-80">
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

export default function TranscriptDisplay({ rawEntries, cleanedEntries }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <TranscriptPanel
        title="Raw Transcript"
        entries={rawEntries}
        accentColor="text-gray-400"
      />
      <TranscriptPanel
        title="Cleaned Transcript"
        entries={cleanedEntries}
        accentColor="text-emerald-400"
      />
    </div>
  );
}
