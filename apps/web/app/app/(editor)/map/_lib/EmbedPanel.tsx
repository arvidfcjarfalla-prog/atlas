"use client";

import { useState } from "react";

export function EmbedPanel({ slug }: { slug: string }) {
  const [embedCopied, setEmbedCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const host = typeof window !== "undefined" ? window.location.host : "atlas.app";
  const embedCode = `<iframe src="${window.location.protocol}//${host}/m/${slug}/embed" width="100%" height="500" frameborder="0" style="border-radius:8px;border:none"></iframe>`;

  async function handleCopyEmbed() {
    await navigator.clipboard.writeText(embedCode).catch(() => {});
    setEmbedCopied(true);
    setTimeout(() => setEmbedCopied(false), 2000);
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          padding: "7px 12px",
          fontSize: 12,
          fontFamily: "'Geist',sans-serif",
          color: "#908c85",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        {open ? "Stäng embed" : "Bädda in karta"}
      </button>
      {open && (
        <div
          style={{
            marginTop: 8,
            background: "#0d1217",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.08)",
            padding: "10px 12px",
          }}
        >
          <pre
            style={{
              fontFamily: "'Geist Mono',monospace",
              fontSize: 11,
              color: "#908c85",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            {embedCode}
          </pre>
          <button
            onClick={handleCopyEmbed}
            style={{
              marginTop: 8,
              width: "100%",
              fontFamily: "'Geist',sans-serif",
              fontSize: 12,
              padding: "5px 0",
              borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: embedCopied ? "#8ecba0" : "#908c85",
              cursor: "pointer",
            }}
          >
            {embedCopied ? "\u2713 Kopierad!" : "Kopiera"}
          </button>
        </div>
      )}
    </div>
  );
}
