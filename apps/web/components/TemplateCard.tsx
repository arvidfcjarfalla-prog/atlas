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
        borderRadius: 10, overflow: "visible", background: "#111820",
        border: "1px solid rgba(255,255,255,0.05)",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.20)" : "0 1px 3px rgba(0,0,0,0.10)",
        transition: "box-shadow 220ms ease, transform 220ms ease",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        cursor: "pointer", position: "relative",
        animationDelay: `${index * 40}ms`,
        animation: "fadeUp 280ms ease both",
      }}
    >
      {/* Thumbnail */}
      <div style={{ borderRadius: "10px 10px 0 0", overflow: "hidden" }}>
        <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden", background: "#111820" }}>
          <div style={{ position: "absolute", inset: 0, background: meta.bg, transition: "opacity 350ms ease", opacity: hovered ? 1 : 0.7 }} />
          <div style={{ position: "absolute", inset: 0 }}>{meta.thumbnail}</div>
        </div>
      </div>

      {/* Mall badge */}
      <div style={{
        position: "absolute", top: 10, left: 10, zIndex: 2,
        background: "rgba(212,165,116,0.88)", backdropFilter: "blur(6px)",
        borderRadius: 6, padding: "3px 8px",
        fontFamily: "'Geist Mono', monospace", fontSize: 9, fontWeight: 500, color: "white",
        letterSpacing: "0.06em", textTransform: "uppercase",
      }}>
        Mall
      </div>

      {/* Info */}
      <div style={{ padding: "10px 12px 12px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <h3 style={{
          fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 600, color: "#e4e0d8",
          margin: "0 0 3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          letterSpacing: "-0.02em",
        }}>
          {template.title}
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <FamilyPill family={template.family} />
        </div>
      </div>
    </div>
  );
}
