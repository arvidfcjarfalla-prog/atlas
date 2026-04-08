"use client";

import { useState } from "react";
import { FAMILY_META, FALLBACK_META, FamilyPill } from "@/components/family-meta";
import type { MapTemplate } from "@/lib/templates";

export function TemplateCard({ template, index, onClick }: {
  template: MapTemplate;
  index: number;
  onClick: (template: MapTemplate) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const meta = FAMILY_META[template.family] ?? FALLBACK_META;

  return (
    <div
      onClick={() => onClick(template)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 10, overflow: "hidden", background: "#111820",
        border: hovered
          ? `1px solid ${meta.color}30`
          : "1px solid rgba(255,255,255,0.05)",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.25)" : "0 1px 3px rgba(0,0,0,0.10)",
        transition: "all 220ms ease",
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        cursor: "pointer",
        animationDelay: `${index * 40}ms`,
        animation: "fadeUp 280ms ease both",
      }}
    >
      {/* Thumbnail */}
      <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden", background: "#111820" }}>
        <div style={{ position: "absolute", inset: 0, background: meta.bg, transition: "opacity 350ms ease", opacity: hovered ? 1 : 0.85 }} />
        <div style={{ position: "absolute", inset: 0 }}>{meta.thumbnail}</div>
        {/* Bottom gradient for text legibility */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 28, background: "linear-gradient(transparent, rgba(17,24,32,0.5))" }} />

        {/* Hover overlay — "Utforska →" */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(17,24,32,0.65)",
          backdropFilter: "blur(1px)",
          opacity: hovered ? 1 : 0,
          transition: "opacity 200ms ease",
          pointerEvents: "none",
        }}>
          <span style={{
            display: "flex", alignItems: "center", gap: 5,
            color: "#c4915a", fontSize: 12, fontWeight: 500,
            letterSpacing: "0.03em",
            fontFamily: "'Geist Mono', monospace",
          }}>
            Utforska
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </span>
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: "10px 14px 12px" }}>
        <h3 style={{
          fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 14, fontWeight: 400, color: "#e4e0d8",
          margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          letterSpacing: "-0.02em",
        }}>
          {template.title}
        </h3>
        <p style={{
          fontFamily: "'Geist', sans-serif", fontSize: 11, color: "#5a5752",
          margin: "0 0 6px", lineHeight: 1.4,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {template.description}
        </p>
        <FamilyPill family={template.family} />
      </div>
    </div>
  );
}
