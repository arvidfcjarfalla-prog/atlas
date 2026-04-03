import React from "react";

export const FAMILY_META: Record<string, { label: string; color: string; bg: string; thumbnail: React.ReactNode }> = {
  choropleth: {
    label: "Choropleth", color: "#2563EB",
    bg: "radial-gradient(ellipse at 30% 40%, rgba(37,99,235,0.10) 0%, transparent 65%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        <path d="M24 48 L72 24 L120 42 L168 18 L222 36 L216 96 L168 114 L120 90 L72 108 L24 84Z" fill="rgba(37,99,235,0.09)" stroke="rgba(37,99,235,0.22)" strokeWidth="1"/>
        <path d="M24 84 L72 108 L120 90 L168 114 L216 96 L210 123 L162 130 L114 116 L66 126 L22 112Z" fill="rgba(37,99,235,0.17)" stroke="rgba(37,99,235,0.26)" strokeWidth="1"/>
        <path d="M72 24 L120 42 L120 90 L72 108 L24 84 L24 48Z" fill="rgba(37,99,235,0.06)" stroke="rgba(37,99,235,0.16)" strokeWidth="0.8"/>
        <path d="M120 42 L168 18 L216 36 L216 96 L168 114 L120 90Z" fill="rgba(37,99,235,0.22)" stroke="rgba(37,99,235,0.30)" strokeWidth="0.8"/>
      </svg>
    ),
  },
  heatmap: {
    label: "Heatmap", color: "#DC2626",
    bg: "radial-gradient(ellipse at 40% 50%, rgba(220,38,38,0.12) 0%, transparent 60%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        <ellipse cx="96" cy="72" rx="66" ry="50" fill="rgba(220,38,38,0.05)"/>
        <ellipse cx="96" cy="72" rx="46" ry="34" fill="rgba(220,38,38,0.10)"/>
        <ellipse cx="96" cy="72" rx="26" ry="19" fill="rgba(220,38,38,0.19)"/>
        <ellipse cx="96" cy="72" rx="12" ry="9" fill="rgba(220,38,38,0.38)"/>
        <ellipse cx="174" cy="50" rx="36" ry="26" fill="rgba(234,88,12,0.06)"/>
        <ellipse cx="174" cy="50" rx="19" ry="14" fill="rgba(234,88,12,0.14)"/>
        <ellipse cx="174" cy="50" rx="7" ry="6" fill="rgba(234,88,12,0.30)"/>
      </svg>
    ),
  },
  point: {
    label: "Punkter", color: "#7C3AED",
    bg: "radial-gradient(ellipse at 50% 50%, rgba(124,58,237,0.09) 0%, transparent 65%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        {[[48,60],[84,38],[114,66],[144,44],[180,60],[198,32],[66,98],[108,112],[156,92],[192,105],[54,82],[132,76]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={i % 3 === 0 ? 4.5 : i % 3 === 1 ? 3.5 : 3} fill="rgba(124,58,237,0.65)" opacity={0.45 + (i % 4) * 0.14}/>
        ))}
      </svg>
    ),
  },
  cluster: {
    label: "Kluster", color: "#7C3AED",
    bg: "radial-gradient(ellipse at 50% 50%, rgba(124,58,237,0.09) 0%, transparent 65%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        <circle cx="84" cy="66" r="26" fill="rgba(124,58,237,0.10)" stroke="rgba(124,58,237,0.24)" strokeWidth="1"/>
        <circle cx="84" cy="66" r="10" fill="rgba(124,58,237,0.55)"/>
        <text x="84" y="70" textAnchor="middle" fill="white" fontSize="8" fontFamily="monospace">12</text>
        <circle cx="168" cy="54" r="19" fill="rgba(124,58,237,0.08)" stroke="rgba(124,58,237,0.20)" strokeWidth="1"/>
        <circle cx="168" cy="54" r="7" fill="rgba(124,58,237,0.48)"/>
        <text x="168" y="58" textAnchor="middle" fill="white" fontSize="7" fontFamily="monospace">7</text>
        <circle cx="132" cy="106" r="14" fill="rgba(124,58,237,0.07)" stroke="rgba(124,58,237,0.18)" strokeWidth="1"/>
        <circle cx="132" cy="106" r="5" fill="rgba(124,58,237,0.42)"/>
        <text x="132" y="109" textAnchor="middle" fill="white" fontSize="6" fontFamily="monospace">4</text>
      </svg>
    ),
  },
  flow: {
    label: "Flöde", color: "#0891B2",
    bg: "radial-gradient(ellipse at 20% 50%, rgba(8,145,178,0.10) 0%, transparent 55%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        <path d="M36 68 C84 28, 156 108, 204 68" stroke="rgba(8,145,178,0.50)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        <path d="M36 68 C78 50, 150 92, 204 68" stroke="rgba(8,145,178,0.24)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        <circle cx="36" cy="68" r="5.5" fill="rgba(8,145,178,0.72)"/>
        <circle cx="204" cy="68" r="5.5" fill="rgba(8,145,178,0.72)"/>
      </svg>
    ),
  },
  isochrone: {
    label: "Isokon", color: "#059669",
    bg: "radial-gradient(ellipse at 50% 55%, rgba(5,150,105,0.10) 0%, transparent 65%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        <ellipse cx="120" cy="68" rx="84" ry="55" fill="rgba(5,150,105,0.04)" stroke="rgba(5,150,105,0.16)" strokeWidth="1" strokeDasharray="4 3"/>
        <ellipse cx="120" cy="68" rx="58" ry="38" fill="rgba(5,150,105,0.07)" stroke="rgba(5,150,105,0.22)" strokeWidth="1" strokeDasharray="4 3"/>
        <ellipse cx="120" cy="68" rx="34" ry="22" fill="rgba(5,150,105,0.13)" stroke="rgba(5,150,105,0.34)" strokeWidth="1"/>
        <circle cx="120" cy="68" r="6" fill="rgba(5,150,105,0.80)"/>
      </svg>
    ),
  },
  "proportional-symbol": {
    label: "Proportionell", color: "#D97706",
    bg: "radial-gradient(ellipse at 45% 50%, rgba(217,119,6,0.09) 0%, transparent 60%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        <circle cx="108" cy="68" r="36" fill="rgba(217,119,6,0.09)" stroke="rgba(217,119,6,0.26)" strokeWidth="1"/>
        <circle cx="174" cy="54" r="22" fill="rgba(217,119,6,0.12)" stroke="rgba(217,119,6,0.30)" strokeWidth="1"/>
        <circle cx="66" cy="94" r="14" fill="rgba(217,119,6,0.16)" stroke="rgba(217,119,6,0.34)" strokeWidth="1"/>
      </svg>
    ),
  },
  extrusion: {
    label: "3D", color: "#6366F1",
    bg: "radial-gradient(ellipse at 45% 55%, rgba(99,102,241,0.10) 0%, transparent 60%)",
    thumbnail: (
      <svg width="100%" height="100%" viewBox="0 0 240 135" fill="none" style={{ position: "absolute", inset: 0 }}>
        <rect x="40" y="60" width="28" height="55" rx="2" fill="rgba(99,102,241,0.35)" stroke="rgba(99,102,241,0.40)" strokeWidth="0.8"/>
        <rect x="78" y="30" width="28" height="85" rx="2" fill="rgba(99,102,241,0.50)" stroke="rgba(99,102,241,0.45)" strokeWidth="0.8"/>
        <rect x="116" y="48" width="28" height="67" rx="2" fill="rgba(99,102,241,0.40)" stroke="rgba(99,102,241,0.42)" strokeWidth="0.8"/>
        <rect x="154" y="72" width="28" height="43" rx="2" fill="rgba(99,102,241,0.25)" stroke="rgba(99,102,241,0.35)" strokeWidth="0.8"/>
        <line x1="30" y1="115" x2="210" y2="115" stroke="rgba(99,102,241,0.15)" strokeWidth="0.5"/>
      </svg>
    ),
  },
};

export const FALLBACK_META = FAMILY_META.choropleth;

export function FamilyPill({ family }: { family: string }) {
  const meta = FAMILY_META[family] ?? FALLBACK_META;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
      background: `${meta.color}14`, border: `1px solid ${meta.color}30`,
      borderRadius: 6, padding: "2px 7px 2px 6px",
      fontFamily: "'Geist Mono', monospace", fontSize: 10,
      color: meta.color, letterSpacing: "0.06em", fontWeight: 500, textTransform: "uppercase",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta.color, display: "inline-block", flexShrink: 0 }} />
      {meta.label}
    </span>
  );
}
