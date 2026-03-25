"use client";

import { useState, useCallback, useEffect } from "react";

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  mapId: string;
  mapTitle: string;
  isPublic: boolean;
  slug: string | null;
  onTogglePublic: (isPublic: boolean) => Promise<{ slug: string | null }>;
}

const bd = "rgba(255,255,255,0.08)";

export function ShareModal({
  open,
  onClose,
  mapId,
  mapTitle,
  isPublic,
  slug,
  onTogglePublic,
}: ShareModalProps) {
  const [toggling, setToggling] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [localPublic, setLocalPublic] = useState(isPublic);
  const [localSlug, setLocalSlug] = useState(slug);

  // Sync with external prop changes
  useEffect(() => {
    setLocalPublic(isPublic);
    setLocalSlug(slug);
  }, [isPublic, slug]);

  const host = typeof window !== "undefined" ? window.location.host : "atlas.app";
  const shareUrl = localSlug ? `${window.location.protocol}//${host}/m/${localSlug}` : null;
  const embedCode = shareUrl
    ? `<iframe src="${shareUrl}/embed" width="100%" height="500" frameborder="0" style="border-radius:8px;border:none"></iframe>`
    : null;

  const handleToggle = useCallback(async () => {
    setToggling(true);
    try {
      const next = !localPublic;
      const result = await onTogglePublic(next);
      setLocalPublic(next);
      if (result.slug) setLocalSlug(result.slug);
    } finally {
      setToggling(false);
    }
  }, [localPublic, onTogglePublic]);

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl).catch(() => {});
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  async function copyEmbed() {
    if (!embedCode) return;
    await navigator.clipboard.writeText(embedCode).catch(() => {});
    setEmbedCopied(true);
    setTimeout(() => setEmbedCopied(false), 2000);
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 201,
          width: 420,
          maxWidth: "calc(100vw - 32px)",
          background: "#131920",
          border: `1px solid ${bd}`,
          borderRadius: 14,
          padding: "24px 28px",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2
            style={{
              fontFamily: "Georgia,'Times New Roman',serif",
              fontSize: 16,
              fontWeight: 600,
              color: "#e4e0d8",
              margin: 0,
            }}
          >
            Dela karta
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#5a5752",
              fontSize: 18,
              cursor: "pointer",
              padding: "2px 6px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Public/Private toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${bd}`,
            borderRadius: 10,
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontFamily: "'Geist',sans-serif", fontSize: 13, fontWeight: 500, color: "#e4e0d8" }}>
              {localPublic ? "Publik" : "Privat"}
            </div>
            <div style={{ fontFamily: "'Geist',sans-serif", fontSize: 11, color: "#5a5752", marginTop: 2 }}>
              {localPublic ? "Alla med länken kan se kartan" : "Bara du kan se kartan"}
            </div>
          </div>
          <button
            onClick={handleToggle}
            disabled={toggling}
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              border: "none",
              cursor: toggling ? "wait" : "pointer",
              background: localPublic ? "#8ecba0" : "rgba(255,255,255,0.12)",
              position: "relative",
              transition: "background 0.2s ease",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "#fff",
                position: "absolute",
                top: 3,
                left: localPublic ? 23 : 3,
                transition: "left 0.2s ease",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              }}
            />
          </button>
        </div>

        {/* Share link + embed (visible only when public) */}
        {localPublic && shareUrl ? (
          <>
            {/* Share link */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontFamily: "'Geist',sans-serif", fontSize: 11, color: "#5a5752", marginBottom: 6, display: "block" }}>
                Länk
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  background: "#0d1217",
                  border: `1px solid ${bd}`,
                  borderRadius: 8,
                }}
              >
                <span
                  style={{
                    flex: 1,
                    fontFamily: "'Geist Mono',monospace",
                    fontSize: 12,
                    color: "#908c85",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {shareUrl}
                </span>
                <button
                  onClick={copyLink}
                  style={{
                    flexShrink: 0,
                    fontFamily: "'Geist',sans-serif",
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "4px 12px",
                    borderRadius: 6,
                    border: "1px solid rgba(212,165,116,0.3)",
                    background: "rgba(212,165,116,0.08)",
                    color: linkCopied ? "#8ecba0" : "#d4a574",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {linkCopied ? "✓ Kopierad" : "Kopiera"}
                </button>
              </div>
            </div>

            {/* Embed code */}
            <div>
              <label style={{ fontFamily: "'Geist',sans-serif", fontSize: 11, color: "#5a5752", marginBottom: 6, display: "block" }}>
                Bädda in
              </label>
              <div
                style={{
                  padding: "10px 12px",
                  background: "#0d1217",
                  border: `1px solid ${bd}`,
                  borderRadius: 8,
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
                  onClick={copyEmbed}
                  style={{
                    marginTop: 8,
                    width: "100%",
                    fontFamily: "'Geist',sans-serif",
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "5px 0",
                    borderRadius: 6,
                    border: `1px solid ${bd}`,
                    background: "rgba(255,255,255,0.04)",
                    color: embedCopied ? "#8ecba0" : "#908c85",
                    cursor: "pointer",
                  }}
                >
                  {embedCopied ? "✓ Kopierad" : "Kopiera embed-kod"}
                </button>
              </div>
            </div>
          </>
        ) : !localPublic ? (
          <p
            style={{
              fontFamily: "'Geist',sans-serif",
              fontSize: 13,
              color: "#5a5752",
              textAlign: "center",
              padding: "12px 0",
              margin: 0,
            }}
          >
            Gör kartan publik för att dela
          </p>
        ) : null}
      </div>
    </>
  );
}
