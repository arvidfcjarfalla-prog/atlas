"use client";

export function LegacyDataBanner({
  onCreateNew,
}: {
  onCreateNew?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "10px 16px",
        background: "rgba(239,68,68,0.08)",
        borderBottom: "1px solid rgba(239,68,68,0.20)",
        fontFamily: "'Geist',sans-serif",
        fontSize: 13,
        color: "rgba(239,68,68,0.9)",
      }}
    >
      <span>Datan för den här kartan är inte längre tillgänglig.</span>
      {onCreateNew && (
        <button
          onClick={onCreateNew}
          style={{
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(239,68,68,0.30)",
            borderRadius: 6,
            padding: "4px 14px",
            fontSize: 12,
            fontWeight: 600,
            color: "rgba(239,68,68,0.95)",
            cursor: "pointer",
          }}
        >
          Skapa ny med samma fråga
        </button>
      )}
    </div>
  );
}
