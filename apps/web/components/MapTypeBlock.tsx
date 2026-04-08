"use client";

import React, { useState, useEffect, useRef } from "react";
import { FAMILY_META, FALLBACK_META, FAMILY_INFO } from "@/components/family-meta";
import { BLOCK_BACKGROUNDS } from "@/components/block-backgrounds";
import { EDITORIAL } from "@/lib/editorial-tokens";
import type { MapTemplate } from "@/lib/templates";

// Easing curve tuned for editorial reveals — quick start, slow settle
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

function useInViewReveal() {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setAnimate(false);
      setVisible(true);
      return;
    }
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setAnimate(false);
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.18, rootMargin: "0px 0px -80px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible, animate };
}

interface MapTypeBlockProps {
  family: string;
  chapterNumber: number;
  totalChapters: number;
  align: "left" | "right";
  examples: MapTemplate[];
  onExampleClick: (template: MapTemplate) => void;
}

export function MapTypeBlock({
  family,
  chapterNumber,
  totalChapters,
  align,
  examples,
  onExampleClick,
}: MapTypeBlockProps) {
  const meta = FAMILY_META[family] ?? FALLBACK_META;
  const info = FAMILY_INFO[family];
  const Background = BLOCK_BACKGROUNDS[family];
  const { ref, visible, animate } = useInViewReveal();

  if (!info) return null;

  const chapter = String(chapterNumber).padStart(2, "0");
  const total = String(totalChapters).padStart(2, "0");
  const reversed = align === "right";

  const visual = (
    <div
      className="mtb-visual"
      style={{
        minWidth: 0,
        justifySelf: reversed ? "end" : "start",
        width: "100%",
        maxWidth: 580,
        order: reversed ? 2 : 1,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(28px) scale(0.985)",
        transition: animate
          ? `opacity 900ms ${EASE_OUT} 120ms, transform 1000ms ${EASE_OUT} 120ms`
          : "none",
      }}
    >
      <PreviewContainer family={family} />
    </div>
  );

  const text = (
    <div
      className="mtb-text"
      style={{
        minWidth: 0,
        maxWidth: 520,
        justifySelf: reversed ? "end" : "start",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        order: reversed ? 1 : 2,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(18px)",
        transition: animate
          ? `opacity 800ms ${EASE_OUT} 260ms, transform 900ms ${EASE_OUT} 260ms`
          : "none",
      }}
    >
      {/* Chapter marker — inline, understated */}
      <div style={{
        fontFamily: "'Geist Mono', monospace",
        fontSize: 11,
        letterSpacing: "0.22em",
        color: EDITORIAL.inkMuted,
        textTransform: "uppercase" as const,
        fontWeight: 500,
      }}>
        {chapter} / {total}
      </div>

      {/* Title — Georgia italic at editorial scale */}
      <h2 style={{
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontStyle: "italic",
        fontSize: "clamp(52px, 6.2vw, 82px)",
        fontWeight: 400,
        lineHeight: 0.96,
        letterSpacing: "-0.022em",
        color: EDITORIAL.ink,
        margin: 0,
        textWrap: "balance" as const,
        fontKerning: "normal",
        fontFeatureSettings: "'kern' 1, 'liga' 1",
      }}>
        {info.typeName}
      </h2>

      {/* Rule + English subtitle */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: -6 }}>
        <div style={{
          width: 36,
          height: 1,
          background: EDITORIAL.gold,
          opacity: 0.55,
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: "'Geist Mono', monospace",
          fontSize: 11.5,
          letterSpacing: "0.26em",
          color: EDITORIAL.gold,
          textTransform: "uppercase" as const,
          fontWeight: 500,
        }}>
          {info.typeNameEn}
        </span>
      </div>

      {/* Description */}
      <p style={{
        fontFamily: "'Geist', sans-serif",
        fontSize: 16,
        lineHeight: 1.6,
        color: EDITORIAL.ink,
        margin: 0,
        maxWidth: "54ch",
        textWrap: "pretty" as const,
      }}>
        {info.description}
      </p>

      {/* Examples — the actionable layer */}
      {examples.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            letterSpacing: "0.10em",
            color: EDITORIAL.inkMuted,
            textTransform: "uppercase" as const,
            fontWeight: 500,
            marginBottom: 14,
          }}>
            Börja med ett exempel
          </div>
          <div style={{
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
          }}>
            {examples.slice(0, 3).map((t) => (
              <ExampleThumb
                key={t.id}
                template={t}
                onClick={() => onExampleClick(t)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <section
      ref={ref as React.RefObject<HTMLElement>}
      style={{
        position: "relative",
        width: "100%",
        padding: "clamp(64px, 9vw, 112px) clamp(24px, 4vw, 48px)",
        overflow: "hidden",
      }}
    >
      {/* Decorative topographic background — full-bleed */}
      {Background && (
        <div style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.9,
        }}>
          <Background />
        </div>
      )}


      {/* Content grid — collapses to single column on narrow viewports */}
      <div style={{
        position: "relative",
        maxWidth: 1180,
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: "clamp(40px, 5vw, 72px)",
        alignItems: "center",
      }}>
        {visual}
        {text}
      </div>
    </section>
  );
}

// ── Preview: dark inset container showing the map family illustration ──
function PreviewContainer({ family }: { family: string }) {
  const meta = FAMILY_META[family] ?? FALLBACK_META;
  return (
    <div style={{
      position: "relative",
      aspectRatio: "4 / 3",
      width: "100%",
      maxWidth: 560,
      background: "#111820",
      borderRadius: 6,
      overflow: "hidden",
      boxShadow:
        "0 1px 0 rgba(255,255,255,0.04) inset, " +
        "0 24px 60px rgba(26, 31, 28, 0.18), " +
        "0 4px 14px rgba(26, 31, 28, 0.08)",
    }}>
      {/* Family color radial glow */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: meta.bg,
        opacity: 1,
      }} />
      {/* Illustration */}
      <div style={{ position: "absolute", inset: 0 }}>{meta.thumbnail}</div>
      {/* Subtle vignette */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.25) 100%)",
        pointerEvents: "none",
      }} />
    </div>
  );
}

// ── Example thumbnail: text-forward clickable card → creates the real map ──
function ExampleThumb({
  template,
  onClick,
}: {
  template: MapTemplate;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const meta = FAMILY_META[template.family] ?? FALLBACK_META;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        width: 220,
        height: 148,
        padding: 0,
        border: `1.5px solid ${hovered ? EDITORIAL.gold : "rgba(26,31,28,0.10)"}`,
        background: "#111820",
        borderRadius: 6,
        overflow: "hidden",
        cursor: "pointer",
        textAlign: "left" as const,
        fontFamily: "inherit",
        transition: "transform 240ms ease, box-shadow 240ms ease, border-color 240ms ease",
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hovered
          ? "0 14px 32px rgba(26,31,28,0.26), 0 2px 8px rgba(196,145,90,0.18)"
          : "0 1px 3px rgba(26,31,28,0.10)",
      }}
    >
      {/* Subtle family-color radial tint in upper-left corner */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: `radial-gradient(ellipse 80% 60% at 0% 0%, ${meta.color}18 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      {/* Thin accent bar on left edge */}
      <div style={{
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: 3,
        background: hovered ? EDITORIAL.gold : meta.color,
        opacity: hovered ? 1 : 0.55,
        transition: "background 220ms ease, opacity 220ms ease",
      }} />

      {/* Family label — small caps top-left */}
      <div style={{
        position: "absolute",
        top: 16,
        left: 20,
        fontFamily: "'Geist Mono', monospace",
        fontSize: 9,
        letterSpacing: "0.16em",
        color: meta.color,
        textTransform: "uppercase" as const,
        fontWeight: 500,
        opacity: 0.75,
      }}>
        {meta.label}
      </div>

      {/* Title — Georgia italic, prominent */}
      <div style={{
        position: "absolute",
        left: 20,
        right: 48,
        top: 38,
      }}>
        <div style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontStyle: "italic",
          fontSize: 17,
          color: "#e4e0d8",
          lineHeight: 1.2,
          letterSpacing: "-0.015em",
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
        }}>
          {template.title}
        </div>
      </div>

      {/* CTA microcopy — bottom, fades in on hover */}
      <div style={{
        position: "absolute",
        left: 20,
        right: 20,
        bottom: 14,
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "'Geist Mono', monospace",
        fontSize: 9,
        letterSpacing: "0.14em",
        color: EDITORIAL.gold,
        textTransform: "uppercase" as const,
        fontWeight: 500,
        opacity: hovered ? 1 : 0,
        transform: hovered ? "translateY(0)" : "translateY(3px)",
        transition: "opacity 220ms ease, transform 220ms ease",
      }}>
        Skapa karta
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </div>

      {/* Arrow affordance top-right */}
      <div style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 26,
        height: 26,
        borderRadius: "50%",
        background: hovered ? EDITORIAL.gold : "rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 220ms ease, transform 220ms ease",
        transform: hovered ? "scale(1.08)" : "scale(1)",
      }}>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke={hovered ? "#111820" : "rgba(255,255,255,0.55)"}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transition: "stroke 220ms ease" }}
        >
          <line x1="7" y1="17" x2="17" y2="7" />
          <polyline points="8 7 17 7 17 16" />
        </svg>
      </div>
    </button>
  );
}
