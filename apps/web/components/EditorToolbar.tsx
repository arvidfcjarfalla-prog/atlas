"use client";

import { useState, useRef, useCallback } from "react";
import { ExportMenu } from "./ExportMenu";

interface EditorToolbarProps {
  title: string;
  onTitleChange: (title: string) => void;
  mode: "interactive" | "presentation";
  onModeChange: (mode: "interactive" | "presentation") => void;
  onShare: () => void;
  onBack: () => void;
  onExportPNG?: () => void;
  onExportGeoJSON?: () => void;
}

// Design tokens from docs/prototype/atlas.html EditorView
const bd = "rgba(255,255,255,0.05)";

export function EditorToolbar({
  title,
  onTitleChange,
  mode,
  onModeChange,
  onShare,
  onBack,
  onExportPNG,
  onExportGeoJSON,
}: EditorToolbarProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(() => {
    setDraft(title);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }, [title]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== title) onTitleChange(trimmed);
  }, [draft, title, onTitleChange]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        height: 46,
        background: "rgba(12,16,20,0.9)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: `1px solid ${bd}`,
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      {/* Logo */}
      <div
        onClick={onBack}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginRight: 24,
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#8ecba0",
            boxShadow: "0 0 8px rgba(142,203,160,0.27)",
          }}
        />
        <span
          style={{
            fontSize: 14,
            fontFamily: "Georgia,'Times New Roman',serif",
            color: "#e4e0d8",
          }}
        >
          Atlas
        </span>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 22, background: bd }} />

      {/* Title — Georgia serif, editable */}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") setEditing(false);
          }}
          style={{
            fontFamily: "Georgia,'Times New Roman',serif",
            fontSize: 13,
            fontWeight: 500,
            color: "#e4e0d8",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(142,203,160,0.3)",
            borderRadius: 4,
            padding: "3px 10px",
            outline: "none",
            minWidth: 120,
            maxWidth: 300,
          }}
        />
      ) : (
        <span
          onClick={startEdit}
          style={{
            fontSize: 13,
            fontWeight: 500,
            fontFamily: "Georgia,'Times New Roman',serif",
            color: "#e4e0d8",
            padding: "0 14px",
            cursor: "text",
            maxWidth: 300,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
      )}

      {/* Divider */}
      <div style={{ width: 1, height: 22, background: bd }} />

      {/* Mode toggle — pill with background */}
      <div
        style={{
          display: "flex",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 7,
          padding: 2,
          marginLeft: 8,
        }}
      >
        {(["interactive", "presentation"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            style={{
              padding: "5px 14px",
              fontSize: 11,
              fontFamily: "'Segoe UI',-apple-system,sans-serif",
              color: mode === m ? "#e4e0d8" : "#5a5752",
              background:
                mode === m ? "rgba(255,255,255,0.07)" : "transparent",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              transition: "all 0.12s ease",
            }}
          >
            {m === "interactive" ? "Interactive" : "Presentation"}
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Export */}
      {onExportPNG && onExportGeoJSON ? (
        <ExportMenu onExportPNG={onExportPNG} onExportGeoJSON={onExportGeoJSON} />
      ) : (
        <button
          style={{
            fontSize: 11,
            fontFamily: "'Segoe UI',-apple-system,sans-serif",
            color: "#5a5752",
            background: "none",
            border: "none",
            padding: "6px 12px",
          }}
        >
          Export ↓
        </button>
      )}

      {/* Share — gold button */}
      <button
        onClick={onShare}
        style={{
          background: "#d4a574",
          color: "#0d1217",
          border: "none",
          padding: "7px 18px",
          fontSize: 11,
          fontFamily: "'Courier New',monospace",
          fontWeight: 700,
          borderRadius: 6,
          cursor: "pointer",
          boxShadow: "0 0 16px rgba(212,165,116,0.2)",
        }}
      >
        Share
      </button>
    </div>
  );
}
