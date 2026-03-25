"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/use-auth";

interface MarketingNavProps {
  variant: "transparent" | "solid";
}

export function MarketingNav({ variant }: MarketingNavProps) {
  const { user, loading } = useAuth();

  return (
    <nav
      className={
        variant === "transparent"
          ? "absolute inset-x-0 top-0 z-10"
          : "sticky top-0 z-10"
      }
      style={
        variant === "solid"
          ? {
              background: "rgba(10,13,20,0.85)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between h-14 px-4 sm:px-8">
        <Link
          href="/"
          className="font-geist text-[17px] font-medium tracking-[-0.01em]"
          style={{ color: "var(--text-primary, rgba(248,249,251,0.90))" }}
        >
          atlas
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/explore"
            className="font-geist-mono text-[11px] font-normal uppercase tracking-[0.05em] transition-colors duration-150"
            style={{ color: "rgba(248,249,251,0.25)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "rgba(248,249,251,0.50)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "rgba(248,249,251,0.25)";
            }}
          >
            Explore
          </Link>
          {!loading &&
            (user ? (
              <Link
                href="/app"
                className="font-geist-mono text-[11px] font-normal uppercase tracking-[0.05em] transition-colors duration-150"
                style={{ color: "rgba(248,249,251,0.25)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "rgba(248,249,251,0.50)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "rgba(248,249,251,0.25)";
                }}
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/login"
                className="font-geist-mono text-[11px] font-normal uppercase tracking-[0.05em] transition-colors duration-150"
                style={{ color: "rgba(248,249,251,0.25)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "rgba(248,249,251,0.50)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "rgba(248,249,251,0.25)";
                }}
              >
                Log in
              </Link>
            ))}
        </div>
      </div>
    </nav>
  );
}
