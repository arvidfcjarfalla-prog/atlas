"use client";

export function DraftRestoreBanner({
  timestamp,
  onRestore,
  onDismiss,
}: {
  timestamp: number;
  onRestore: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "8px 16px",
        background: "rgba(234,179,8,0.10)",
        borderBottom: "1px solid rgba(234,179,8,0.20)",
        fontFamily: "'Geist',sans-serif",
        fontSize: 13,
        color: "rgba(234,179,8,0.9)",
      }}
    >
      <span>Osparade ändringar hittades ({new Date(timestamp).toLocaleTimeString("sv-SE")})</span>
      <button
        onClick={onRestore}
        style={{
          background: "rgba(234,179,8,0.18)",
          border: "1px solid rgba(234,179,8,0.35)",
          borderRadius: 6,
          padding: "4px 12px",
          fontSize: 12,
          fontWeight: 600,
          color: "rgba(234,179,8,0.95)",
          cursor: "pointer",
        }}
      >
        Återställ
      </button>
      <button
        onClick={onDismiss}
        style={{
          background: "none",
          border: "none",
          padding: "4px 8px",
          fontSize: 12,
          color: "#908c85",
          cursor: "pointer",
        }}
      >
        Ignorera
      </button>
    </div>
  );
}
