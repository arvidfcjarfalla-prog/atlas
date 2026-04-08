"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/use-auth";

const sage = "#8ecba0";
const gold = "#c4915a";
const ink = "#1a1f1c";
const inkMuted = "#6f6e77";

const NAV_LINKS = [
  { href: "/use-cases", label: "Use Cases" },
  { href: "/pricing", label: "Pricing" },
  { href: "/enterprise", label: "Enterprise" },
];

type Mode = "dark" | "paper";

export function MarketingNav() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [mode, setMode] = useState<Mode>("dark");

  useEffect(() => {
    // The hero is ~calc(100vh - 56px) tall. Switch when ~85% of the hero has scrolled past.
    const onScroll = () => {
      const threshold = window.innerHeight * 0.82;
      setMode(window.scrollY < threshold ? "dark" : "paper");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isDark = mode === "dark";

  // Adaptive palette
  const bg = isDark ? "rgba(13,18,23,0.28)" : "rgba(245,244,240,0.78)";
  const border = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(26,31,28,0.08)";
  const logoText = isDark ? "#f5f4f0" : ink;
  const linkActive = isDark ? "#f5f4f0" : ink;
  const linkIdle = isDark ? "rgba(245,244,240,0.55)" : inkMuted;
  const linkHover = isDark ? "rgba(245,244,240,0.85)" : ink;
  const btnBorder = isDark ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(26,31,28,0.15)";
  const btnText = isDark ? "rgba(245,244,240,0.75)" : ink;

  return (
    <nav
      className="s0 sticky top-0 z-30"
      style={{
        background: bg,
        backdropFilter: "blur(18px) saturate(140%)",
        WebkitBackdropFilter: "blur(18px) saturate(140%)",
        borderBottom: border,
        transition: "background 320ms ease, border-color 320ms ease",
      }}
    >
      <div className="flex items-center justify-between" style={{ padding: "14px 36px" }}>
        {/* Left: logo */}
        <Link href="/" className="flex items-center gap-2 cursor-pointer">
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: sage,
              boxShadow: `0 0 10px ${sage}44`,
            }}
          />
          <span
            style={{
              fontSize: 16,
              fontFamily: "Georgia, 'Times New Roman', serif",
              color: logoText,
              transition: "color 320ms ease",
            }}
          >
            Atlas
          </span>
        </Link>

        {/* Center: nav links */}
        <div className="flex gap-[22px]" style={{ fontFamily: "'Geist Mono', 'Courier New', monospace", fontSize: 11 }}>
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-sm outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current"
                style={{
                  color: isActive ? linkActive : linkIdle,
                  textDecoration: "none",
                  transition: "color 180ms ease",
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = linkHover; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = linkIdle; }}
                onFocus={(e) => { if (!isActive) e.currentTarget.style.color = linkHover; }}
                onBlur={(e) => { if (!isActive) e.currentTarget.style.color = linkIdle; }}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Right: auth buttons */}
        <div className="flex gap-2">
          {!loading && (
            user ? (
              <Link
                href="/app"
                style={{
                  background: "transparent",
                  border: btnBorder,
                  color: btnText,
                  padding: "7px 18px",
                  fontFamily: "'Geist Mono', 'Courier New', monospace",
                  fontSize: 10,
                  borderRadius: 6,
                  textDecoration: "none",
                  transition: "color 320ms ease, border-color 320ms ease",
                }}
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  style={{
                    background: "transparent",
                    border: btnBorder,
                    color: btnText,
                    padding: "7px 18px",
                    fontFamily: "'Geist Mono', 'Courier New', monospace",
                    fontSize: 10,
                    borderRadius: 6,
                    textDecoration: "none",
                    transition: "color 320ms ease, border-color 320ms ease",
                  }}
                >
                  Sign in
                </Link>
                <Link
                  href="/app"
                  style={{
                    background: gold,
                    color: "#ffffff",
                    border: "none",
                    padding: "7px 20px",
                    fontFamily: "'Geist Mono', 'Courier New', monospace",
                    fontSize: 10,
                    fontWeight: 600,
                    borderRadius: 6,
                    boxShadow: isDark
                      ? `0 0 16px ${gold}33`
                      : "0 1px 2px rgba(154,111,63,0.2), 0 8px 24px rgba(154,111,63,0.15)",
                    textDecoration: "none",
                    transition: "box-shadow 320ms ease",
                  }}
                >
                  Try Atlas free
                </Link>
              </>
            )
          )}
        </div>
      </div>
    </nav>
  );
}
