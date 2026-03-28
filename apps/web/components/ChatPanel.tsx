"use client";

import { useRef, useEffect } from "react";
import type { AgentMessage, ToolCallInfo } from "@/lib/hooks/use-agent-chat";
import { TOOL_LABELS } from "@/lib/hooks/use-agent-chat";

// Re-export for backward compatibility
export type ChatMsg = AgentMessage;

// ─── Tool call chip ─────────────────────────────────────────

function ToolChip({ tc }: { tc: ToolCallInfo }) {
  const labels = TOOL_LABELS[tc.toolName] ?? {
    pending: tc.toolName,
    done: tc.toolName,
  };
  const isDone = tc.status === "done";
  const isError = tc.status === "error";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 14,
        fontSize: 11,
        fontFamily: "'Geist',sans-serif",
        background: isError
          ? "rgba(239,68,68,0.08)"
          : isDone
            ? "rgba(142,203,160,0.08)"
            : "rgba(99,130,255,0.08)",
        border: `1px solid ${
          isError
            ? "rgba(239,68,68,0.20)"
            : isDone
              ? "rgba(142,203,160,0.20)"
              : "rgba(99,130,255,0.20)"
        }`,
        color: isError
          ? "rgba(239,68,68,0.8)"
          : isDone
            ? "rgba(142,203,160,0.8)"
            : "rgba(99,130,255,0.8)",
      }}
    >
      {!isDone && !isError && (
        <div
          style={{
            width: 10,
            height: 10,
            border: "2px solid transparent",
            borderTop: "2px solid currentColor",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }}
        />
      )}
      {isDone && <span>&#x2713;</span>}
      {isError && <span>&#x2717;</span>}
      <span>{isDone ? labels.done : labels.pending}</span>
    </div>
  );
}

// ─── Streaming cursor ───────────────────────────────────────

function StreamingCursor() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 14,
        background: "rgba(99,130,255,0.6)",
        marginLeft: 2,
        animation: "blink 1s step-end infinite",
        verticalAlign: "text-bottom",
      }}
    />
  );
}

// ─── ChatPanel ──────────────────────────────────────────────

export function ChatPanel({
  messages,
  input,
  isStreaming = false,
  loading = false,
  onInputChange,
  onSend,
  onStop,
  onUndo,
  canUndo,
  onFileUpload,
  placeholder = "Beskriv vad du vill ändra…",
}: {
  messages: AgentMessage[];
  input: string;
  isStreaming?: boolean;
  /** @deprecated Use isStreaming instead */
  loading?: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
  onFileUpload?: (file: File) => void;
  placeholder?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const busy = isStreaming || loading;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 50% { opacity: 0; } }
      `}</style>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.map((m, i) => {
          const isLast = i === messages.length - 1;
          const showCursor = isLast && m.role === "assistant" && isStreaming;

          return (
            <div
              key={i}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                background:
                  m.role === "user"
                    ? "rgba(99,130,255,0.15)"
                    : "rgba(255,255,255,0.04)",
                border: `1px solid ${
                  m.role === "user"
                    ? "rgba(99,130,255,0.25)"
                    : "rgba(255,255,255,0.06)"
                }`,
                borderRadius: 12,
                padding: "10px 14px",
              }}
            >
              {/* Tool call chips */}
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginBottom: m.content ? 8 : 0,
                  }}
                >
                  {m.toolCalls.map((tc, j) => (
                    <ToolChip key={j} tc={tc} />
                  ))}
                </div>
              )}

              {/* Message text */}
              {m.content && (
                <p
                  style={{
                    fontSize: 13,
                    color:
                      m.role === "user"
                        ? "rgba(99,130,255,0.95)"
                        : "rgba(248,249,251,0.75)",
                    margin: 0,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.content}
                  {showCursor && <StreamingCursor />}
                </p>
              )}
            </div>
          );
        })}

        {/* Loading indicator when no streaming content yet */}
        {busy && messages[messages.length - 1]?.role === "user" && (
          <div
            style={{
              alignSelf: "flex-start",
              padding: "10px 14px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
            }}
          >
            <p style={{ fontSize: 13, color: "rgba(248,249,251,0.35)", margin: 0 }}>
              Tänker…
            </p>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Undo / Stop */}
      <div style={{ display: "flex", gap: 8, margin: "0 20px 8px", alignItems: "center" }}>
        {canUndo && onUndo && !busy && (
          <button
            onClick={onUndo}
            style={{
              fontSize: 12,
              color: "rgba(248,249,251,0.35)",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            Ångra
          </button>
        )}
        {isStreaming && onStop && (
          <button
            onClick={onStop}
            style={{
              fontSize: 12,
              color: "rgba(239,68,68,0.7)",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.20)",
              borderRadius: 6,
              padding: "3px 10px",
              cursor: "pointer",
              fontFamily: "'Geist',sans-serif",
            }}
          >
            Stopp
          </button>
        )}
      </div>

      {/* Input */}
      <div
        style={{
          padding: "12px 20px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          gap: 8,
          flexShrink: 0,
        }}
      >
        {onFileUpload && (
          <>
            <input
              id="chat-file-upload"
              type="file"
              accept=".csv,.tsv,.txt,.geojson,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFileUpload(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => document.getElementById("chat-file-upload")?.click()}
              disabled={busy}
              title="Ladda upp data"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 8,
                padding: "9px 10px",
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.4 : 0.6,
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              &#x1F4CE;
            </button>
          </>
        )}
        <input
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={placeholder}
          disabled={busy}
          style={{
            flex: 1,
            fontFamily: "'Geist',sans-serif",
            fontSize: 13,
            color: "rgba(248,249,251,0.85)",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 8,
            padding: "9px 12px",
            outline: "none",
            opacity: busy ? 0.5 : 1,
          }}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={busy || !input.trim()}
          style={{
            fontFamily: "'Geist',sans-serif",
            fontSize: 13,
            fontWeight: 500,
            color: "rgba(99,130,255,0.90)",
            background: "rgba(99,130,255,0.12)",
            border: "1px solid rgba(99,130,255,0.20)",
            borderRadius: 8,
            padding: "9px 14px",
            cursor: busy || !input.trim() ? "default" : "pointer",
            opacity: busy || !input.trim() ? 0.4 : 1,
          }}
        >
          Skicka
        </button>
      </div>
    </div>
  );
}
