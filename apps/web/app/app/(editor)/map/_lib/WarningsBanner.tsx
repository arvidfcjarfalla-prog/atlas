"use client";

export function WarningsBanner({
  warnings,
  onDismiss,
}: {
  warnings: string[];
  onDismiss: () => void;
}) {
  if (warnings.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "10px 16px",
        background: "rgba(234,179,8,0.08)",
        borderBottom: "1px solid rgba(234,179,8,0.20)",
        fontFamily: "'Geist Mono',monospace",
        fontSize: 12,
        color: "rgba(234,179,8,0.85)",
      }}
    >
      <div style={{ flex: 1 }}>
        {warnings.map((w, i) => (
          <div key={i}>{w}</div>
        ))}
      </div>
      <button
        onClick={onDismiss}
        style={{
          background: "none",
          border: "none",
          color: "rgba(234,179,8,0.5)",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          padding: 0,
          flexShrink: 0,
        }}
        title="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
