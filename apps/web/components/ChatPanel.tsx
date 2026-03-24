"use client";

import { useRef, useEffect } from "react";

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  changes?: string[];
}

/**
 * Shared chat panel — message list + input.
 * Used by both the edit page and the /maps/new generation page.
 */
export function ChatPanel({
  messages,
  input,
  loading,
  onInputChange,
  onSend,
  onUndo,
  canUndo,
  placeholder = "Beskriv vad du vill ändra…",
}: {
  messages: ChatMsg[];
  input: string;
  loading: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
  placeholder?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              background: m.role === "user" ? "rgba(99,130,255,0.15)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${m.role === "user" ? "rgba(99,130,255,0.25)" : "rgba(255,255,255,0.06)"}`,
              borderRadius: 12,
              padding: "10px 14px",
            }}
          >
            <p style={{ fontSize: 13, color: m.role === "user" ? "rgba(99,130,255,0.95)" : "rgba(248,249,251,0.75)", margin: 0, lineHeight: 1.5 }}>
              {m.content}
            </p>
            {m.changes && m.changes.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {m.changes.map((c, j) => (
                  <p key={j} style={{ fontSize: 11, color: "rgba(248,249,251,0.35)", margin: "2px 0", fontFamily: "'Geist Mono',monospace" }}>
                    {c}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: "flex-start", padding: "10px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
            <p style={{ fontSize: 13, color: "rgba(248,249,251,0.35)", margin: 0 }}>Tänker…</p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Undo */}
      {canUndo && onUndo && (
        <button
          onClick={onUndo}
          style={{ margin: "0 20px 8px", fontSize: 12, color: "rgba(248,249,251,0.35)", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
        >
          Ångra
        </button>
      )}

      {/* Input */}
      <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8, flexShrink: 0 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          placeholder={placeholder}
          disabled={loading}
          style={{ flex: 1, fontFamily: "'Geist',sans-serif", fontSize: 13, color: "rgba(248,249,251,0.85)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8, padding: "9px 12px", outline: "none", opacity: loading ? 0.5 : 1 }}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={loading || !input.trim()}
          style={{ fontFamily: "'Geist',sans-serif", fontSize: 13, fontWeight: 500, color: "rgba(99,130,255,0.90)", background: "rgba(99,130,255,0.12)", border: "1px solid rgba(99,130,255,0.20)", borderRadius: 8, padding: "9px 14px", cursor: loading || !input.trim() ? "default" : "pointer", opacity: loading || !input.trim() ? 0.4 : 1 }}
        >
          Skicka
        </button>
      </div>
    </div>
  );
}
