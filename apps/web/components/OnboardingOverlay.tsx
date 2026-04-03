"use client";

import { useState, useEffect } from "react";
import { FAMILY_META } from "@/components/family-meta";

const STORAGE_KEY = "atlas_onboarded";

interface OnboardingExample {
  family: string;
  label: string;
  prompt: string;
}

const EXAMPLES: OnboardingExample[] = [
  { family: "choropleth", label: "Filled regions", prompt: "Population density in Europe" },
  { family: "point", label: "Points on a map", prompt: "UNESCO heritage sites worldwide" },
  { family: "heatmap", label: "Heat intensity", prompt: "Earthquakes last week" },
  { family: "flow", label: "Connections & flows", prompt: "Trade flows between European countries" },
  { family: "extrusion", label: "3D columns", prompt: "World population in 3D" },
  { family: "cluster", label: "Clustered markers", prompt: "Active volcanoes worldwide" },
];

export function OnboardingOverlay({ onSelectPrompt }: { onSelectPrompt: (prompt: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  function dismiss() {
    setVisible(false);
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
  }

  function handlePick(prompt: string) {
    dismiss();
    onSelectPrompt(prompt);
  }

  if (!visible) return null;

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 50,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(13,18,23,0.92)",
      backdropFilter: "blur(12px)",
      animation: "fadeUp 320ms ease both",
    }}>
      <div style={{ maxWidth: 680, width: "100%", padding: "0 24px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{
            fontFamily: "Georgia,'Times New Roman',serif",
            fontSize: 26, fontWeight: 600, color: "#e4e0d8",
            margin: "0 0 10px", letterSpacing: "-0.02em",
          }}>
            Type a sentence, get a map
          </h1>
          <p style={{
            fontFamily: "'Geist',sans-serif",
            fontSize: 14, color: "#908c85", margin: 0, lineHeight: 1.6,
          }}>
            Atlas turns natural language into publication-ready maps with real data.
            <br />Pick a style to try, or write your own prompt.
          </p>
        </div>

        {/* Example grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 28,
        }}>
          {EXAMPLES.map((ex) => {
            const meta = FAMILY_META[ex.family];
            if (!meta) return null;
            return (
              <button
                key={ex.family}
                onClick={() => handlePick(ex.prompt)}
                style={{
                  background: "#111820",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 10,
                  padding: 0,
                  cursor: "pointer",
                  textAlign: "left",
                  overflow: "hidden",
                  transition: "border-color 180ms ease, transform 180ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {/* Thumbnail */}
                <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: 0, background: meta.bg, opacity: 0.8 }} />
                  <div style={{ position: "absolute", inset: 0 }}>{meta.thumbnail}</div>
                </div>
                {/* Label */}
                <div style={{ padding: "8px 10px 10px" }}>
                  <div style={{
                    fontFamily: "'Geist',sans-serif", fontSize: 12, fontWeight: 600,
                    color: "#e4e0d8", marginBottom: 2,
                  }}>
                    {ex.label}
                  </div>
                  <div style={{
                    fontFamily: "'Geist Mono',monospace", fontSize: 10,
                    color: "#5a5752", lineHeight: 1.4,
                  }}>
                    &ldquo;{ex.prompt}&rdquo;
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Dismiss */}
        <div style={{ textAlign: "center" }}>
          <button
            onClick={dismiss}
            style={{
              fontFamily: "'Geist',sans-serif", fontSize: 13,
              color: "#5a5752", background: "none", border: "none",
              cursor: "pointer", padding: "6px 16px",
              transition: "color 150ms ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#908c85"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#5a5752"; }}
          >
            Skip — I&apos;ll write my own prompt
          </button>
        </div>
      </div>
    </div>
  );
}
