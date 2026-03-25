"use client";

import { useEffect, useRef } from "react";

// City-light positions: normalized [0-1, 0-1] on a Mercator-ish canvas
// Clustered on continents to evoke a night-time satellite view
const CITY_LIGHTS: { x: number; y: number; size: number; brightness: number }[] = [
  // North America
  { x: 0.16, y: 0.32, size: 2.2, brightness: 1.0 },  // New York
  { x: 0.12, y: 0.34, size: 1.6, brightness: 0.7 },  // Chicago
  { x: 0.08, y: 0.36, size: 1.8, brightness: 0.8 },  // LA
  { x: 0.14, y: 0.28, size: 1.2, brightness: 0.5 },  // Montreal
  { x: 0.10, y: 0.38, size: 1.0, brightness: 0.4 },  // Houston
  { x: 0.18, y: 0.50, size: 0.9, brightness: 0.35 },  // Caribbean
  // South America
  { x: 0.24, y: 0.60, size: 1.5, brightness: 0.7 },  // São Paulo
  { x: 0.22, y: 0.56, size: 1.0, brightness: 0.5 },  // Bogotá
  { x: 0.25, y: 0.68, size: 1.2, brightness: 0.5 },  // Buenos Aires
  // Europe
  { x: 0.44, y: 0.26, size: 2.0, brightness: 0.9 },  // London
  { x: 0.46, y: 0.28, size: 1.8, brightness: 0.85 },  // Paris
  { x: 0.48, y: 0.26, size: 1.5, brightness: 0.7 },  // Berlin
  { x: 0.45, y: 0.22, size: 1.3, brightness: 0.65 },  // Stockholm
  { x: 0.50, y: 0.30, size: 1.2, brightness: 0.6 },  // Rome
  { x: 0.52, y: 0.28, size: 1.0, brightness: 0.5 },  // Istanbul
  // Africa
  { x: 0.47, y: 0.42, size: 1.0, brightness: 0.4 },  // Cairo
  { x: 0.50, y: 0.55, size: 0.8, brightness: 0.3 },  // Nairobi
  { x: 0.54, y: 0.65, size: 0.9, brightness: 0.35 },  // Johannesburg
  { x: 0.44, y: 0.48, size: 0.7, brightness: 0.25 },  // Lagos
  // Asia
  { x: 0.58, y: 0.30, size: 1.4, brightness: 0.7 },  // Moscow
  { x: 0.65, y: 0.38, size: 1.2, brightness: 0.6 },  // Mumbai
  { x: 0.68, y: 0.36, size: 1.0, brightness: 0.5 },  // Delhi
  { x: 0.78, y: 0.32, size: 2.0, brightness: 0.95 },  // Shanghai
  { x: 0.80, y: 0.30, size: 2.2, brightness: 1.0 },  // Tokyo
  { x: 0.76, y: 0.34, size: 1.4, brightness: 0.6 },  // Hong Kong
  { x: 0.72, y: 0.42, size: 1.1, brightness: 0.5 },  // Bangkok
  { x: 0.75, y: 0.45, size: 1.0, brightness: 0.45 },  // Singapore
  // Oceania
  { x: 0.86, y: 0.68, size: 1.3, brightness: 0.6 },  // Sydney
  { x: 0.84, y: 0.70, size: 0.9, brightness: 0.4 },  // Melbourne
];

interface Particle {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  radius: number;
  brightness: number;
  phase: number;
  driftAngle: number;
  driftSpeed: number;
}

export function AuthBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Respect reduced-motion preference
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const particles: Particle[] = [];

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = w + "px";
      canvas!.style.height = h + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Reposition particles
      for (let i = 0; i < particles.length; i++) {
        const light = CITY_LIGHTS[i];
        particles[i].baseX = light.x * w;
        particles[i].baseY = light.y * h;
        particles[i].x = particles[i].baseX;
        particles[i].y = particles[i].baseY;
      }
    }

    // Initialize particles from city positions
    for (const light of CITY_LIGHTS) {
      particles.push({
        x: 0,
        y: 0,
        baseX: 0,
        baseY: 0,
        radius: light.size,
        brightness: light.brightness,
        phase: Math.random() * Math.PI * 2,
        driftAngle: Math.random() * Math.PI * 2,
        driftSpeed: 0.06 + Math.random() * 0.12,
      });
    }

    resize();
    window.addEventListener("resize", resize);

    let t = 0;

    function draw() {
      t += 0.006;
      ctx!.clearRect(0, 0, w, h);

      // ── Faint Mercator grid ──
      ctx!.strokeStyle = "rgba(142,203,160,0.03)";
      ctx!.lineWidth = 0.5;
      // Latitude lines
      for (let lat = 0.15; lat <= 0.85; lat += 0.1) {
        ctx!.beginPath();
        ctx!.moveTo(0, lat * h);
        ctx!.lineTo(w, lat * h);
        ctx!.stroke();
      }
      // Longitude lines
      for (let lng = 0.05; lng <= 0.95; lng += 0.1) {
        ctx!.beginPath();
        ctx!.moveTo(lng * w, 0);
        ctx!.lineTo(lng * w, h);
        ctx!.stroke();
      }

      // ── Center vignette glow ──
      const grad = ctx!.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.5);
      grad.addColorStop(0, "rgba(142,203,160,0.04)");
      grad.addColorStop(0.5, "rgba(142,203,160,0.015)");
      grad.addColorStop(1, "rgba(142,203,160,0)");
      ctx!.fillStyle = grad;
      ctx!.fillRect(0, 0, w, h);

      // ── Update particle positions ──
      for (const p of particles) {
        p.driftAngle += p.driftSpeed * 0.002;
        const drift = 12 + Math.sin(t * 0.7 + p.phase) * 6;
        p.x = p.baseX + Math.cos(p.driftAngle) * drift;
        p.y = p.baseY + Math.sin(p.driftAngle) * drift;
      }

      // ── Connection lines (routes between nearby cities) ──
      const connDist = Math.min(w, h) * 0.18;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connDist) {
            const alpha = (1 - dist / connDist) * 0.06 *
              Math.min(particles[i].brightness, particles[j].brightness);
            ctx!.beginPath();
            ctx!.moveTo(particles[i].x, particles[i].y);
            ctx!.lineTo(particles[j].x, particles[j].y);
            ctx!.strokeStyle = `rgba(142,203,160,${alpha})`;
            ctx!.lineWidth = 0.5;
            ctx!.stroke();
          }
        }
      }

      // ── Draw city light particles ──
      for (const p of particles) {
        const pulse = Math.sin(t * 1.2 + p.phase) * 0.3 + 0.7;
        const r = p.radius * (0.9 + pulse * 0.2);
        const alpha = p.brightness * pulse;

        // Outer glow (large, faint)
        const glowGrad = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 8);
        glowGrad.addColorStop(0, `rgba(212,165,116,${alpha * 0.12})`);  // warm amber core
        glowGrad.addColorStop(0.4, `rgba(142,203,160,${alpha * 0.05})`);  // sage mid
        glowGrad.addColorStop(1, "rgba(142,203,160,0)");
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, r * 8, 0, Math.PI * 2);
        ctx!.fillStyle = glowGrad;
        ctx!.fill();

        // Inner glow
        const innerGrad = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
        innerGrad.addColorStop(0, `rgba(212,165,116,${alpha * 0.3})`);
        innerGrad.addColorStop(1, "rgba(212,165,116,0)");
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
        ctx!.fillStyle = innerGrad;
        ctx!.fill();

        // Core dot
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, r * 0.6, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(248,230,200,${alpha * 0.7})`;
        ctx!.fill();
      }

      raf = requestAnimationFrame(draw);
    }

    if (prefersReduced) {
      // Draw a single static frame
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
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}

// Glassmorphism card wrapper for auth forms
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        zIndex: 1,
        width: "100%",
        maxWidth: 380,
        padding: "36px 28px",
        background: "rgba(16,22,30,0.72)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16,
        boxShadow: "0 24px 80px rgba(0,0,0,0.40), 0 0 0 1px rgba(255,255,255,0.03) inset",
      }}
    >
      {children}
    </div>
  );
}
