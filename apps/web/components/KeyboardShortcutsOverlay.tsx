"use client";

import { useState, useEffect } from "react";

interface ShortcutGroup {
  label: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: "Editing",
    shortcuts: [
      { keys: ["⌘Z"], description: "Undo" },
      { keys: ["⇧⌘Z"], description: "Redo" },
    ],
  },
  {
    label: "Timeline",
    shortcuts: [
      { keys: ["Space"], description: "Play / pause" },
      { keys: ["←"], description: "Previous step" },
      { keys: ["→"], description: "Next step" },
      { keys: ["+"], description: "Speed up" },
      { keys: ["−"], description: "Slow down" },
    ],
  },
  {
    label: "General",
    shortcuts: [
      { keys: ["?"], description: "Show shortcuts" },
      { keys: ["Esc"], description: "Close overlay" },
    ],
  },
];

export function KeyboardShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "rgba(12,16,24,0.92)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          padding: "24px 28px",
          minWidth: 300,
          maxWidth: 420,
          fontFamily: "'Geist',sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2
            style={{
              fontFamily: "Georgia,'Times New Roman',serif",
              fontSize: 16,
              fontWeight: 600,
              color: "#e4e0d8",
              margin: 0,
            }}
          >
            Keyboard Shortcuts
          </h2>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none",
              border: "none",
              color: "#5a5752",
              fontSize: 18,
              cursor: "pointer",
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.label} style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 10,
                fontFamily: "'Courier New',monospace",
                fontWeight: 700,
                color: "#908c85",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 8,
              }}
            >
              {group.label}
            </div>
            {group.shortcuts.map((s, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "5px 0",
                }}
              >
                <span style={{ fontSize: 12, color: "rgba(200,210,225,0.7)" }}>
                  {s.description}
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  {s.keys.map((k) => (
                    <kbd
                      key={k}
                      style={{
                        display: "inline-block",
                        padding: "2px 7px",
                        fontSize: 11,
                        fontFamily: "'Geist Mono',monospace",
                        color: "rgba(142,203,160,0.9)",
                        background: "rgba(142,203,160,0.08)",
                        border: "1px solid rgba(142,203,160,0.2)",
                        borderRadius: 4,
                        lineHeight: 1.4,
                      }}
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}

        <div
          style={{
            fontSize: 10,
            color: "#5a5752",
            textAlign: "center",
            marginTop: 8,
            fontFamily: "'Geist Mono',monospace",
          }}
        >
          Press ? to toggle · Esc to close
        </div>
      </div>
    </div>
  );
}
