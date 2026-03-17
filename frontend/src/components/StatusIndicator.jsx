const STATUS_CONFIG = {
  idle: { label: "Idle", color: "#A1A1AA" },
  listening: { label: "Listening", color: "#34D399" },
  processing: { label: "Processing", color: "#4F9CF9" },
  speaking: { label: "Speaking", color: "#4F9CF9" },
};

export default function StatusIndicator({ status }) {
  const { label, color } = STATUS_CONFIG[status] || STATUS_CONFIG.idle;

  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-3 w-3 rounded-full animate-pulse"
        style={{ background: color }}
      />
      <span className="text-sm font-medium" style={{ color: "#A1A1AA" }}>
        {label}
      </span>
    </div>
  );
}
