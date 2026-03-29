"use client";

import { useEffect, useRef } from "react";

const SAGE = "#8ecba0";
const LINE_OPACITY = 0.12;
const ROTATION_SPEED = 0.0003; // radians per frame — very slow drift
const GRID_STEP = 15; // degrees between graticule lines
const POINT_STEP = 2; // degrees between vertices along each line
const DEG = Math.PI / 180;

/** Orthographic projection: [lon, lat, rotation] → [x, y] or null if back-face */
function ortho(
  lon: number,
  lat: number,
  rot: number,
  cx: number,
  cy: number,
  r: number,
): [number, number] | null {
  const lambda = lon * DEG;
  const phi = lat * DEG;
  const cosC = Math.sin(phi) * Math.sin(0) + Math.cos(phi) * Math.cos(0) * Math.cos(lambda - rot);
  if (cosC < 0.01) return null; // back-face cull — hides antimeridian wraps
  const x = cx + r * Math.cos(phi) * Math.sin(lambda - rot);
  const y = cy - r * (Math.cos(0) * Math.sin(phi) - Math.sin(0) * Math.cos(phi) * Math.cos(lambda - rot));
  return [x, y];
}

export function GraticuleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;
    let rotation = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const w = canvas.getBoundingClientRect().width;
      const h = canvas.getBoundingClientRect().height;
      const r = Math.min(w, h) * 0.38;
      const cx = w * 0.55;
      const cy = h * 0.48;

      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = SAGE;
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = LINE_OPACITY;

      // Draw meridians (vertical lines of constant longitude)
      for (let lon = -180; lon < 180; lon += GRID_STEP) {
        ctx.beginPath();
        let moved = false;
        for (let lat = -90; lat <= 90; lat += POINT_STEP) {
          const p = ortho(lon, lat, rotation, cx, cy, r);
          if (p) {
            if (!moved) {
              ctx.moveTo(p[0], p[1]);
              moved = true;
            } else {
              ctx.lineTo(p[0], p[1]);
            }
          } else {
            moved = false;
          }
        }
        ctx.stroke();
      }

      // Draw parallels (horizontal lines of constant latitude)
      for (let lat = -75; lat <= 75; lat += GRID_STEP) {
        ctx.beginPath();
        let moved = false;
        for (let lon = -180; lon <= 180; lon += POINT_STEP) {
          const p = ortho(lon, lat, rotation, cx, cy, r);
          if (p) {
            if (!moved) {
              ctx.moveTo(p[0], p[1]);
              moved = true;
            } else {
              ctx.lineTo(p[0], p[1]);
            }
          } else {
            moved = false;
          }
        }
        ctx.stroke();
      }

      // Outer circle (globe edge)
      ctx.globalAlpha = LINE_OPACITY * 0.6;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 1;
      rotation += ROTATION_SPEED;
      raf = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 1,
        pointerEvents: "none",
      }}
    />
  );
}
