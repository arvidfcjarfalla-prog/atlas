"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/use-auth";

const sage = "#8ecba0";
const gold = "#d4a574";
const c1 = "#0d1217";
const tx = "#e4e0d8";
const tx2 = "#908c85";
const tx3 = "#5a5752";
const bd2 = "rgba(255,255,255,0.08)";

const NAV_LINKS = [
  { href: "/use-cases", label: "Use Cases" },
  { href: "/pricing", label: "Pricing" },
  { href: "/enterprise", label: "Enterprise" },
];

export function MarketingNav() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className="s0 sticky top-0 z-30"
      style={{
        background: scrolled ? "rgba(13,18,23,0.92)" : "transparent",
        backdropFilter: scrolled ? "blur(14px)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(14px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "1px solid transparent",
        transition: "background 0.3s ease, backdrop-filter 0.3s ease, border-color 0.3s ease",
      }}
    >
      <div className="flex items-center justify-between" style={{ padding: "16px 36px" }}>
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
            style={{ fontSize: 16, fontFamily: "Georgia, 'Times New Roman', serif", color: tx }}
          >
            Atlas
          </span>
        </Link>

        {/* Center: nav links */}
        <div className="flex gap-[22px]" style={{ fontFamily: "'Courier New', monospace", fontSize: 11 }}>
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors duration-150"
                style={{ color: isActive ? tx : tx3, textDecoration: "none" }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = tx2; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = tx3; }}
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
                  border: `1px solid ${bd2}`,
                  color: tx2,
                  padding: "7px 18px",
                  fontFamily: "'Courier New', monospace",
                  fontSize: 10,
                  borderRadius: 6,
                  textDecoration: "none",
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
                    border: `1px solid ${bd2}`,
                    color: tx2,
                    padding: "7px 18px",
                    fontFamily: "'Courier New', monospace",
                    fontSize: 10,
                    borderRadius: 6,
                    textDecoration: "none",
                  }}
                >
                  Sign in
                </Link>
                <Link
                  href="/app"
                  style={{
                    background: gold,
                    color: c1,
                    border: "none",
                    padding: "7px 20px",
                    fontFamily: "'Courier New', monospace",
                    fontSize: 10,
                    fontWeight: 700,
                    borderRadius: 6,
                    boxShadow: `0 0 16px ${gold}33`,
                    textDecoration: "none",
                  }}
                >
                  Get Started
                </Link>
              </>
            )
          )}
        </div>
      </div>
    </nav>
  );
}
