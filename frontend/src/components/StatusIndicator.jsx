const STATUS_CONFIG = {
  idle: { label: "Idle", color: "bg-gray-500" },
  listening: { label: "Listening", color: "bg-green-500" },
  processing: { label: "Processing", color: "bg-yellow-500" },
  speaking: { label: "Speaking", color: "bg-blue-500" },
};

export default function StatusIndicator({ status }) {
  const { label, color } = STATUS_CONFIG[status] || STATUS_CONFIG.idle;

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-3 w-3 rounded-full ${color} animate-pulse`} />
      <span className="text-sm font-medium text-gray-300">{label}</span>
    </div>
  );
}
