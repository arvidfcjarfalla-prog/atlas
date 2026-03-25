"use client";

import { useEffect, useRef } from "react";

const CITY_LIGHTS: { x: number; y: number; size: number; brightness: number }[] = [
  // North America
  { x: 0.16, y: 0.32, size: 2.2, brightness: 1.0 },
  { x: 0.12, y: 0.34, size: 1.6, brightness: 0.7 },
  { x: 0.08, y: 0.36, size: 1.8, brightness: 0.8 },
  { x: 0.14, y: 0.28, size: 1.2, brightness: 0.5 },
  { x: 0.10, y: 0.38, size: 1.0, brightness: 0.4 },
  { x: 0.18, y: 0.50, size: 0.9, brightness: 0.35 },
  { x: 0.20, y: 0.30, size: 1.0, brightness: 0.45 },
  { x: 0.06, y: 0.32, size: 1.1, brightness: 0.5 },
  { x: 0.13, y: 0.36, size: 0.8, brightness: 0.35 },
  // South America
  { x: 0.24, y: 0.60, size: 1.5, brightness: 0.7 },
  { x: 0.22, y: 0.56, size: 1.0, brightness: 0.5 },
  { x: 0.25, y: 0.68, size: 1.2, brightness: 0.5 },
  { x: 0.23, y: 0.52, size: 0.8, brightness: 0.35 },
  { x: 0.26, y: 0.64, size: 0.9, brightness: 0.4 },
  { x: 0.21, y: 0.58, size: 0.7, brightness: 0.3 },
  // Europe
  { x: 0.44, y: 0.26, size: 2.0, brightness: 0.9 },
  { x: 0.46, y: 0.28, size: 1.8, brightness: 0.85 },
  { x: 0.48, y: 0.26, size: 1.5, brightness: 0.7 },
  { x: 0.45, y: 0.22, size: 1.3, brightness: 0.65 },
  { x: 0.50, y: 0.30, size: 1.2, brightness: 0.6 },
  { x: 0.52, y: 0.28, size: 1.0, brightness: 0.5 },
  { x: 0.43, y: 0.30, size: 1.1, brightness: 0.55 },
  { x: 0.47, y: 0.24, size: 0.9, brightness: 0.45 },
  { x: 0.49, y: 0.32, size: 0.8, brightness: 0.4 },
  { x: 0.42, y: 0.28, size: 0.7, brightness: 0.35 },
  { x: 0.51, y: 0.26, size: 0.9, brightness: 0.4 },
  // Africa
  { x: 0.47, y: 0.42, size: 1.0, brightness: 0.4 },
  { x: 0.50, y: 0.55, size: 0.8, brightness: 0.3 },
  { x: 0.54, y: 0.65, size: 0.9, brightness: 0.35 },
  { x: 0.44, y: 0.48, size: 0.7, brightness: 0.25 },
  { x: 0.46, y: 0.52, size: 0.6, brightness: 0.2 },
  { x: 0.48, y: 0.46, size: 0.7, brightness: 0.25 },
  { x: 0.52, y: 0.58, size: 0.6, brightness: 0.2 },
  // Middle East
  { x: 0.56, y: 0.36, size: 1.0, brightness: 0.5 },
  { x: 0.54, y: 0.38, size: 0.8, brightness: 0.35 },
  { x: 0.58, y: 0.34, size: 0.7, brightness: 0.3 },
  // Asia
  { x: 0.58, y: 0.30, size: 1.4, brightness: 0.7 },
  { x: 0.65, y: 0.38, size: 1.2, brightness: 0.6 },
  { x: 0.68, y: 0.36, size: 1.0, brightness: 0.5 },
  { x: 0.78, y: 0.32, size: 2.0, brightness: 0.95 },
  { x: 0.80, y: 0.30, size: 2.2, brightness: 1.0 },
  { x: 0.76, y: 0.34, size: 1.4, brightness: 0.6 },
  { x: 0.72, y: 0.42, size: 1.1, brightness: 0.5 },
  { x: 0.75, y: 0.45, size: 1.0, brightness: 0.45 },
  { x: 0.70, y: 0.38, size: 0.9, brightness: 0.4 },
  { x: 0.82, y: 0.34, size: 1.1, brightness: 0.5 },
  { x: 0.74, y: 0.30, size: 0.8, brightness: 0.35 },
  { x: 0.66, y: 0.34, size: 0.7, brightness: 0.3 },
  { x: 0.77, y: 0.38, size: 0.9, brightness: 0.4 },
  { x: 0.62, y: 0.32, size: 0.8, brightness: 0.35 },
  // Oceania
  { x: 0.86, y: 0.68, size: 1.3, brightness: 0.6 },
  { x: 0.84, y: 0.70, size: 0.9, brightness: 0.4 },
  { x: 0.88, y: 0.72, size: 0.7, brightness: 0.3 },
  // Central America
  { x: 0.14, y: 0.44, size: 0.8, brightness: 0.35 },
  { x: 0.16, y: 0.46, size: 0.7, brightness: 0.3 },
  // Caribbean / Atlantic
  { x: 0.20, y: 0.48, size: 0.6, brightness: 0.25 },
  // Indonesia / SE Asia fill
  { x: 0.74, y: 0.48, size: 0.8, brightness: 0.35 },
  { x: 0.78, y: 0.50, size: 0.7, brightness: 0.3 },
  { x: 0.80, y: 0.48, size: 0.6, brightness: 0.25 },
  { x: 0.70, y: 0.44, size: 0.7, brightness: 0.3 },
];

interface Particle {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  radius: number;
  brightness: number;
  phase: number;
  speed: number;
}

export function CityLightsCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const particles: Particle[] = [];

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas!.parentElement?.clientWidth ?? window.innerWidth;
      h = canvas!.parentElement?.clientHeight ?? window.innerHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = w + "px";
      canvas!.style.height = h + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      for (let i = 0; i < particles.length; i++) {
        const light = CITY_LIGHTS[i];
        particles[i].baseX = light.x * w;
        particles[i].baseY = light.y * h;
        particles[i].x = particles[i].baseX;
        particles[i].y = particles[i].baseY;
      }
    }

    for (const light of CITY_LIGHTS) {
      particles.push({
        x: 0,
        y: 0,
        baseX: 0,
        baseY: 0,
        radius: light.size,
        brightness: light.brightness,
        phase: Math.random() * Math.PI * 2,
        speed: 0.2 + Math.random() * 0.35, // 0.2–0.55 Hz
      });
    }

    resize();
    window.addEventListener("resize", resize);

    let t = 0;

    function draw() {
      t += 0.016; // ~60fps
      ctx!.clearRect(0, 0, w, h);

      for (const p of particles) {
        // Subtle drift: sin(time) × 0.8px
        p.x = p.baseX + Math.sin(t * 0.5 + p.phase) * 0.8;
        p.y = p.baseY + Math.cos(t * 0.4 + p.phase * 1.3) * 0.8;

        const pulse = Math.sin(t * p.speed * Math.PI * 2 + p.phase) * 0.3 + 0.7;
        const r = p.radius * (0.9 + pulse * 0.2);
        const alpha = p.brightness * pulse;

        // Outer glow — amber, 6× radius
        const glowGrad = ctx!.createRadialGradient(
          p.x, p.y, 0,
          p.x, p.y, r * 6,
        );
        glowGrad.addColorStop(0, `rgba(212,165,116,${alpha * 0.15})`);
        glowGrad.addColorStop(0.5, `rgba(212,165,116,${alpha * 0.04})`);
        glowGrad.addColorStop(1, "rgba(212,165,116,0)");
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, r * 6, 0, Math.PI * 2);
        ctx!.fillStyle = glowGrad;
        ctx!.fill();

        // Inner glow
        const innerGrad = ctx!.createRadialGradient(
          p.x, p.y, 0,
          p.x, p.y, r * 2.5,
        );
        innerGrad.addColorStop(0, `rgba(212,165,116,${alpha * 0.3})`);
        innerGrad.addColorStop(1, "rgba(212,165,116,0)");
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, r * 2.5, 0, Math.PI * 2);
        ctx!.fillStyle = innerGrad;
        ctx!.fill();

        // Core dot
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, r * 0.5, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(248,230,200,${alpha * 0.7})`;
        ctx!.fill();
      }

      raf = requestAnimationFrame(draw);
    }

    if (prefersReduced) {
      draw();
      cancelAnimationFrame(raf);
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
