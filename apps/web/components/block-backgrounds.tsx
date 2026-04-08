import React from "react";
import { EDITORIAL } from "@/lib/editorial-tokens";

// Faint cartographic backgrounds for each map-type block.
// Strokes in #e8e6de (contour token) on #f5f4f0 (paper) — barely visible but
// creates atmosphere during parallax scroll. Tiny sage accents sprinkled for
// emphasis. Each background metaphorically evokes its map type.

type BgProps = {
  className?: string;
  style?: React.CSSProperties;
};

function Frame({ children, style }: BgProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        ...style,
      }}
    >
      {children}
    </svg>
  );
}

const contour = EDITORIAL.contour;
const sage = EDITORIAL.sage;

// ── 1. Choropleth — Swedish coastline with nested inland contours ──
export function ChoroplethBackground(props: BgProps) {
  return (
    <Frame {...props}>
      <g stroke={contour} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Outer coastline */}
        <path d="M 380 120 C 420 80, 500 60, 560 90 C 620 130, 660 180, 700 240 C 740 320, 760 420, 740 500 C 720 580, 680 640, 620 680 C 540 720, 460 700, 400 640 C 340 580, 310 500, 320 420 C 330 340, 350 240, 380 120 Z" strokeWidth="1.1" />
        {/* Inland contours */}
        <path d="M 430 200 C 470 180, 540 170, 590 200 C 640 240, 660 300, 650 360 C 640 440, 600 500, 540 530 C 480 560, 420 540, 390 490 C 360 430, 380 340, 400 280 C 410 240, 420 220, 430 200 Z" strokeWidth="0.9" />
        <path d="M 470 260 C 510 250, 560 260, 590 290 C 620 320, 620 380, 590 420 C 560 460, 500 470, 460 440 C 420 410, 430 350, 450 310 C 460 290, 465 275, 470 260 Z" strokeWidth="0.8" />
        <path d="M 510 330 C 530 330, 550 340, 555 365 C 560 390, 540 410, 515 405 C 490 400, 485 375, 500 350 C 505 340, 510 335, 510 330 Z" strokeWidth="0.7" />
        {/* Islands */}
        <path d="M 820 340 C 850 330, 880 350, 890 380 C 895 410, 880 435, 850 440 C 820 445, 800 420, 805 390 C 810 370, 815 355, 820 340 Z" strokeWidth="0.9" />
        <path d="M 900 520 C 920 515, 945 525, 955 545 C 960 565, 945 585, 920 585 C 895 585, 885 565, 890 545 C 895 535, 898 528, 900 520 Z" strokeWidth="0.8" />
        <path d="M 980 200 C 995 195, 1010 205, 1015 220 C 1018 235, 1008 250, 990 250 C 972 250, 965 235, 972 220 C 975 212, 978 205, 980 200 Z" strokeWidth="0.7" />
        {/* Graticule hints */}
        <line x1="0" y1="300" x2="1200" y2="300" strokeWidth="0.5" strokeDasharray="2 10" />
        <line x1="0" y1="500" x2="1200" y2="500" strokeWidth="0.5" strokeDasharray="2 10" />
      </g>
      {/* Faint sage accent — capital marker */}
      <circle cx="540" cy="380" r="2.5" fill={sage} opacity="0.35" />
    </Frame>
  );
}

// ── 2. Heatmap — Isotherms (temperature lines) ──
export function HeatmapBackground(props: BgProps) {
  return (
    <Frame {...props}>
      <g stroke={contour} fill="none" strokeLinecap="round">
        {/* Flowing isotherms — horizontal waves with bulges around hotspots */}
        <path d="M -20 160 Q 200 100, 400 140 T 800 120 T 1220 150" strokeWidth="0.9" />
        <path d="M -20 220 Q 200 160, 400 210 T 800 180 T 1220 215" strokeWidth="0.9" />
        <path d="M -20 290 Q 180 210, 380 260 T 820 220 T 1220 270" strokeWidth="1.0" />
        <path d="M -20 370 Q 160 280, 360 330 T 820 300 T 1220 350" strokeWidth="1.0" />
        <path d="M -20 450 Q 180 360, 400 410 T 820 390 T 1220 440" strokeWidth="0.9" />
        <path d="M -20 530 Q 220 450, 440 490 T 840 480 T 1220 520" strokeWidth="0.9" />
        <path d="M -20 600 Q 260 540, 480 570 T 860 560 T 1220 590" strokeWidth="0.8" />
        <path d="M -20 660 Q 280 620, 500 640 T 880 630 T 1220 650" strokeWidth="0.8" />
        {/* Concentric rings at 2 hotspots — simulates high-intensity zones */}
        <circle cx="360" cy="330" r="40" strokeWidth="0.7" />
        <circle cx="360" cy="330" r="70" strokeWidth="0.6" />
        <circle cx="360" cy="330" r="100" strokeWidth="0.5" strokeDasharray="3 6" />
        <circle cx="820" cy="300" r="30" strokeWidth="0.7" />
        <circle cx="820" cy="300" r="55" strokeWidth="0.6" />
      </g>
      {/* Hotspot markers */}
      <circle cx="360" cy="330" r="3" fill={sage} opacity="0.4" />
      <circle cx="820" cy="300" r="2.5" fill={sage} opacity="0.35" />
    </Frame>
  );
}

// ── 3. Point — Coordinate grid ──
export function PointBackground(props: BgProps) {
  // Regular lat/long grid with plus marks at intersections
  const majorX = [100, 300, 500, 700, 900, 1100];
  const majorY = [100, 260, 420, 580, 740];
  return (
    <Frame {...props}>
      <g stroke={contour} fill="none" strokeLinecap="round">
        {/* Major vertical lines */}
        {majorX.map((x) => (
          <line key={`mx${x}`} x1={x} y1="0" x2={x} y2="800" strokeWidth="0.7" />
        ))}
        {/* Major horizontal lines */}
        {majorY.map((y) => (
          <line key={`my${y}`} x1="0" y1={y} x2="1200" y2={y} strokeWidth="0.7" />
        ))}
        {/* Minor grid */}
        {Array.from({ length: 11 }, (_, i) => 200 + i * 80).map((x) => (
          <line key={`nx${x}`} x1={x} y1="0" x2={x} y2="800" strokeWidth="0.3" strokeDasharray="1 6" />
        ))}
      </g>
      {/* Intersection plus marks */}
      <g stroke={contour} strokeWidth="1" strokeLinecap="round">
        {majorX.flatMap((x) =>
          majorY.map((y) => (
            <g key={`i${x}${y}`}>
              <line x1={x - 5} y1={y} x2={x + 5} y2={y} />
              <line x1={x} y1={y - 5} x2={x} y2={y + 5} />
            </g>
          )),
        )}
      </g>
      {/* Scattered sage accent points */}
      <g fill={sage}>
        <circle cx="300" cy="260" r="2" opacity="0.4" />
        <circle cx="700" cy="420" r="2" opacity="0.35" />
        <circle cx="500" cy="580" r="2" opacity="0.3" />
      </g>
    </Frame>
  );
}

// ── 4. Proportional-symbol — Concentric circle compositions ──
export function ProportionalBackground(props: BgProps) {
  return (
    <Frame {...props}>
      <g stroke={contour} fill="none" strokeLinecap="round">
        {/* Large ripple from center-left */}
        <circle cx="280" cy="320" r="60" strokeWidth="1.0" />
        <circle cx="280" cy="320" r="110" strokeWidth="0.8" />
        <circle cx="280" cy="320" r="160" strokeWidth="0.7" />
        <circle cx="280" cy="320" r="220" strokeWidth="0.5" strokeDasharray="3 6" />
        <circle cx="280" cy="320" r="290" strokeWidth="0.4" strokeDasharray="2 8" />
        {/* Medium ripple right */}
        <circle cx="820" cy="480" r="45" strokeWidth="0.9" />
        <circle cx="820" cy="480" r="85" strokeWidth="0.7" />
        <circle cx="820" cy="480" r="130" strokeWidth="0.5" />
        <circle cx="820" cy="480" r="180" strokeWidth="0.4" strokeDasharray="3 6" />
        {/* Small ripple top-right */}
        <circle cx="1000" cy="180" r="25" strokeWidth="0.8" />
        <circle cx="1000" cy="180" r="50" strokeWidth="0.6" />
        <circle cx="1000" cy="180" r="80" strokeWidth="0.5" strokeDasharray="3 6" />
      </g>
      {/* Origin markers */}
      <g fill={sage}>
        <circle cx="280" cy="320" r="3" opacity="0.4" />
        <circle cx="820" cy="480" r="2.5" opacity="0.35" />
        <circle cx="1000" cy="180" r="2" opacity="0.3" />
      </g>
    </Frame>
  );
}

// ── 5. Flow — Dendritic river network ──
export function FlowBackground(props: BgProps) {
  return (
    <Frame {...props}>
      <g stroke={contour} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Main trunk flowing left-to-right */}
        <path d="M 20 680 C 180 640, 280 600, 400 520 C 520 440, 620 380, 760 340 C 880 300, 1000 260, 1200 220" strokeWidth="1.2" />
        {/* Primary tributaries */}
        <path d="M 140 760 C 180 720, 220 700, 280 660 C 320 630, 360 600, 400 520" strokeWidth="0.9" />
        <path d="M 80 500 C 160 520, 240 550, 320 580 C 360 595, 380 600, 400 520" strokeWidth="0.9" />
        <path d="M 560 720 C 580 660, 600 610, 620 560 C 640 520, 660 480, 680 440 C 700 410, 720 395, 760 340" strokeWidth="0.9" />
        <path d="M 520 160 C 560 220, 600 280, 640 320 C 680 350, 720 345, 760 340" strokeWidth="0.9" />
        <path d="M 900 540 C 920 500, 940 460, 960 420 C 980 400, 1000 390, 1020 380 C 1050 365, 1080 345, 1100 310 C 1115 285, 1130 260, 1200 220" strokeWidth="0.8" />
        <path d="M 920 100 C 940 160, 960 210, 980 250 C 1000 280, 1020 295, 1060 310 C 1090 320, 1120 310, 1200 220" strokeWidth="0.8" />
        {/* Secondary branches */}
        <path d="M 220 780 C 240 760, 260 740, 280 720 C 290 705, 300 690, 300 660" strokeWidth="0.6" />
        <path d="M 40 420 C 80 440, 120 460, 160 475 C 200 490, 240 500, 280 500" strokeWidth="0.6" />
        <path d="M 480 780 C 500 760, 520 740, 540 720 C 555 700, 560 680, 560 660" strokeWidth="0.6" />
        <path d="M 820 770 C 840 720, 860 670, 880 620 C 895 580, 905 560, 900 540" strokeWidth="0.6" />
      </g>
      {/* Origin/destination nodes */}
      <g fill={sage}>
        <circle cx="20" cy="680" r="2.5" opacity="0.4" />
        <circle cx="1200" cy="220" r="2.5" opacity="0.4" />
      </g>
    </Frame>
  );
}

// ── 6. Extrusion — Closed elevation contours (mountain topology) ──
export function ExtrusionBackground(props: BgProps) {
  return (
    <Frame {...props}>
      <g stroke={contour} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Mountain 1 — nested irregular closed loops */}
        <path d="M 200 200 C 300 170, 420 180, 500 230 C 580 280, 600 360, 560 430 C 520 500, 420 530, 320 510 C 220 490, 150 420, 140 340 C 135 280, 160 230, 200 200 Z" strokeWidth="1.0" />
        <path d="M 230 240 C 310 220, 400 225, 460 265 C 520 305, 530 370, 500 420 C 470 470, 400 490, 330 475 C 260 460, 210 410, 205 355 C 202 310, 215 270, 230 240 Z" strokeWidth="0.9" />
        <path d="M 260 280 C 320 265, 380 270, 425 295 C 470 320, 480 365, 460 400 C 440 435, 390 450, 340 440 C 290 430, 255 395, 255 355 C 253 325, 258 300, 260 280 Z" strokeWidth="0.8" />
        <path d="M 290 315 C 335 305, 370 310, 395 325 C 420 340, 425 365, 410 385 C 395 405, 365 415, 330 408 C 295 400, 275 380, 280 360 C 283 345, 288 328, 290 315 Z" strokeWidth="0.7" />
        <path d="M 320 345 C 350 340, 370 345, 380 355 C 390 365, 388 380, 375 388 C 360 395, 340 395, 325 385 C 312 375, 313 360, 320 345 Z" strokeWidth="0.6" />
        {/* Mountain 2 — smaller, right side */}
        <path d="M 760 440 C 830 420, 900 430, 950 470 C 1000 510, 1010 570, 980 620 C 950 670, 880 690, 810 670 C 740 650, 700 600, 705 540 C 708 500, 725 465, 760 440 Z" strokeWidth="1.0" />
        <path d="M 790 475 C 840 460, 890 468, 925 495 C 960 520, 970 560, 950 595 C 930 630, 880 645, 830 630 C 780 615, 755 580, 760 540 C 763 515, 775 490, 790 475 Z" strokeWidth="0.9" />
        <path d="M 820 510 C 855 500, 880 505, 900 520 C 920 535, 925 560, 912 580 C 900 600, 870 608, 840 598 C 810 590, 795 570, 800 550 C 803 535, 812 520, 820 510 Z" strokeWidth="0.8" />
        <path d="M 845 535 C 865 530, 880 535, 888 545 C 895 555, 890 570, 878 575 C 865 580, 850 578, 845 568 C 840 558, 843 545, 845 535 Z" strokeWidth="0.7" />
      </g>
      {/* Peaks */}
      <g fill={sage}>
        <circle cx="350" cy="370" r="2.5" opacity="0.4" />
        <circle cx="865" cy="555" r="2.5" opacity="0.4" />
      </g>
    </Frame>
  );
}

// ── 7. Cluster — Constellation / star chart ──
export function ClusterBackground(props: BgProps) {
  // 4 dense clusters + scattered stars with connecting lines
  const clusters = [
    { cx: 280, cy: 200, points: [[250, 180], [290, 160], [310, 200], [270, 220], [240, 210], [300, 235]] },
    { cx: 820, cy: 320, points: [[790, 300], [830, 280], [850, 310], [810, 340], [780, 325], [860, 345], [840, 360]] },
    { cx: 480, cy: 560, points: [[450, 540], [490, 520], [520, 560], [470, 590], [440, 570]] },
    { cx: 1000, cy: 620, points: [[970, 600], [1020, 590], [1040, 630], [990, 650], [960, 625]] },
  ];
  const scatter = [[140, 120], [380, 80], [600, 140], [180, 380], [600, 400], [720, 520], [920, 180], [140, 620], [340, 700], [640, 720], [1080, 400], [1120, 260]];
  return (
    <Frame {...props}>
      {/* Connecting lines within clusters */}
      <g stroke={contour} strokeWidth="0.5" strokeLinecap="round">
        {clusters.map((cl, ci) =>
          cl.points.slice(0, -1).map((p, i) => (
            <line key={`cl${ci}${i}`} x1={p[0]} y1={p[1]} x2={cl.points[i + 1][0]} y2={cl.points[i + 1][1]} />
          )),
        )}
        {/* Inter-cluster faint links */}
        <line x1="280" y1="200" x2="820" y2="320" strokeDasharray="2 8" strokeWidth="0.3" />
        <line x1="480" y1="560" x2="820" y2="320" strokeDasharray="2 8" strokeWidth="0.3" />
        <line x1="480" y1="560" x2="1000" y2="620" strokeDasharray="2 8" strokeWidth="0.3" />
      </g>
      {/* Cluster halos */}
      <g stroke={contour} strokeWidth="0.5" fill="none" strokeDasharray="2 4">
        {clusters.map((cl, ci) => (
          <circle key={`h${ci}`} cx={cl.cx} cy={cl.cy} r="60" opacity="0.6" />
        ))}
      </g>
      {/* Stars — cluster points */}
      <g fill={contour}>
        {clusters.flatMap((cl, ci) =>
          cl.points.map((p, i) => (
            <circle key={`s${ci}${i}`} cx={p[0]} cy={p[1]} r={i === 0 ? 2 : 1.5} />
          )),
        )}
        {/* Scattered loners */}
        {scatter.map((p, i) => (
          <circle key={`l${i}`} cx={p[0]} cy={p[1]} r="1.2" />
        ))}
      </g>
      {/* Sage accents — brightest stars */}
      <g fill={sage}>
        <circle cx="280" cy="200" r="2.5" opacity="0.4" />
        <circle cx="820" cy="320" r="2.5" opacity="0.4" />
      </g>
    </Frame>
  );
}

// ── Router: family key → background component ────────────────────
export const BLOCK_BACKGROUNDS: Record<string, React.FC<BgProps>> = {
  choropleth: ChoroplethBackground,
  heatmap: HeatmapBackground,
  point: PointBackground,
  "proportional-symbol": ProportionalBackground,
  flow: FlowBackground,
  extrusion: ExtrusionBackground,
  cluster: ClusterBackground,
};
