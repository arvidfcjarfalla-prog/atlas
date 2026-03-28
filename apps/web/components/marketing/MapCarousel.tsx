"use client";

import { useState, useEffect } from "react";

/**
 * Hero background: crossfading real map screenshots with subtle Ken Burns zoom.
 *
 * Drop images into public/marketing/:
 *   hero-1.webp, hero-2.webp, hero-3.webp
 */
const HERO_IMAGES = [
  "/marketing/hero-1.jpg",
  "/marketing/hero-2.jpg",
  "/marketing/hero-3.jpg",
];

export function MapCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActive((a) => (a + 1) % HERO_IMAGES.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
      {HERO_IMAGES.map((src, i) => (
        <div
          key={src}
          style={{
            position: "absolute",
            inset: 0,
            transition: "opacity 2s ease",
            opacity: active === i ? 1 : 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: active === i ? "scale(1.06)" : "scale(1)",
              transition: "transform 10s ease, opacity 2s ease",
            }}
          />
        </div>
      ))}
    </div>
  );
}
