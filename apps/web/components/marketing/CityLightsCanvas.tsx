"use client";

import { useEffect, useRef } from "react";

// 25 dots from prototype — [relX, relY, scale]
const RAW: [number, number, number][] = [
  [.52, .28, 1], [.50, .30, .8], [.53, .32, .6], [.48, .34, .7], [.51, .35, .5],
  [.55, .30, .4], [.47, .37, .6], [.20, .32, .9], [.22, .35, .7], [.18, .34, .6],
  [.25, .38, .5], [.15, .30, .7], [.72, .30, .9], [.75, .28, .7], [.78, .32, .8],
  [.68, .34, .6], [.80, .35, .5], [.30, .60, .7], [.32, .55, .5], [.52, .48, .5],
  [.50, .55, .4], [.60, .34, .5], [.68, .38, .8], [.70, .40, .6], [.83, .62, .4],
];

export function CityLightsCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;

    interface Dot {
      x: number; y: number;
      s: number; phase: number; speed: number; baseR: number;
    }

    const dots: Dot[] = RAW.map(([, , s]) => ({
      x: 0, y: 0, s,
      phase: Math.random() * Math.PI * 2,
      speed: 0.2 + Math.random() * 0.35,
      baseR: 3 + s * 6,
    }));

    function resize() {
      w = canvas!.parentElement?.offsetWidth ?? window.innerWidth;
      h = canvas!.parentElement?.offsetHeight ?? window.innerHeight;
      canvas!.width = w;
      canvas!.height = h;
      dots.forEach((d, i) => {
        d.x = RAW[i][0] * w;
        d.y = RAW[i][1] * h;
      });
    }

    resize();
    window.addEventListener("resize", resize);

    let t = 0;
    let drift = 0;
    let raf = 0;

    function draw() {
      t += 0.008;
      drift += 0.15;
      ctx!.clearRect(0, 0, w, h);

      // 3 sage ellipse background glows
      ctx!.globalAlpha = 0.05;
      ctx!.fillStyle = "#8ecba0";
      ctx!.beginPath();
      ctx!.ellipse(w * 0.52, h * 0.32, w * 0.06, h * 0.08, -0.1, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.beginPath();
      ctx!.ellipse(w * 0.20, h * 0.34, w * 0.08, h * 0.07, 0.1, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.beginPath();
      ctx!.ellipse(w * 0.74, h * 0.33, w * 0.1, h * 0.08, 0, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.globalAlpha = 1;

      for (const d of dots) {
        const pulse = 0.5 + 0.5 * Math.sin(t * d.speed + d.phase);
        const r = d.baseR * (0.6 + pulse * 0.4);
        const ox = Math.sin(drift * 0.003 + d.phase) * 0.8;
        const x = d.x + ox;

        // Outer amber glow gradient
        const grad = ctx!.createRadialGradient(x, d.y, 0, x, d.y, r * 6);
        grad.addColorStop(0, `rgba(255,190,90,${0.45 * pulse * d.s})`);
        grad.addColorStop(0.3, `rgba(240,150,60,${0.2 * pulse * d.s})`);
        grad.addColorStop(1, "rgba(210,120,60,0)");
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(x, d.y, r * 6, 0, Math.PI * 2);
        ctx!.fill();

        // Dot core — warm amber
        ctx!.fillStyle = `rgba(255,${200 + Math.round(pulse * 30)},${120 + Math.round(pulse * 40)},${(0.6 + pulse * 0.4) * d.s})`;
        ctx!.beginPath();
        ctx!.arc(x, d.y, r, 0, Math.PI * 2);
        ctx!.fill();

        // Bright center
        ctx!.fillStyle = `rgba(255,245,230,${0.6 * pulse * d.s})`;
        ctx!.beginPath();
        ctx!.arc(x, d.y, r * 0.4, 0, Math.PI * 2);
        ctx!.fill();
      }

      raf = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}
