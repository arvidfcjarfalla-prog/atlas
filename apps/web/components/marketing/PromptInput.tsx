"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const gold = "#d4a574";
const c1 = "#0d1217";
const tx = "#e4e0d8";
const bd2 = "rgba(255,255,255,0.08)";

const PROMPTS = [
  "Where do people move when cities get too expensive?",
  "Earthquake risk across the Pacific Rim",
  "Coffee shops in Tokyo by foot traffic",
  "European wind energy by region",
];

export function PromptInput() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [placeholder, setPlaceholder] = useState("");
  const [promptIndex, setPromptIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Typewriter cycling placeholder
  useEffect(() => {
    const text = PROMPTS[promptIndex];
    let i = 0;
    setPlaceholder("");

    intervalRef.current = setInterval(() => {
      if (i < text.length) {
        i++;
        setPlaceholder(text.slice(0, i));
      } else {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setTimeout(() => setPromptIndex((p) => (p + 1) % PROMPTS.length), 2800);
      }
    }, 36);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [promptIndex]);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    router.push(`/app/map/new?prompt=${encodeURIComponent(trimmed)}`);
  }, [value, router]);

  return (
    <div style={{ maxWidth: 420 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          border: `1px solid ${bd2}`,
          borderRadius: 8,
          padding: "4px 4px 4px 14px",
          background: "rgba(255,255,255,0.04)",
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          aria-label="Describe a map"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 14,
            color: tx,
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontStyle: "italic",
            padding: "10px 0",
          }}
        />
        <button
          type="button"
          onClick={submit}
          style={{
            background: gold,
            color: c1,
            border: "none",
            padding: "10px 20px",
            fontFamily: "'Courier New', monospace",
            fontSize: 10,
            fontWeight: 700,
            borderRadius: 6,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          Generate Map
        </button>
      </div>
    </div>
  );
}
