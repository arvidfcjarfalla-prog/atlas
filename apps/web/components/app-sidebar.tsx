"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/use-auth";
import type { MapRow } from "@/lib/supabase/types";

// ─── Icons (inline SVGs to avoid dependencies) ──────────────────────────────

function IconHome({ active }: { active?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconGrid({ active }: { active?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

function IconX() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── Nav item ────────────────────────────────────────────────────────────────

function NavItem({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
      style={{
        color: active ? "#8ecba0" : "#908c85",
        backgroundColor: active ? "rgba(142,203,160,0.08)" : "transparent",
      }}
    >
      {icon}
      <span style={{ fontWeight: active ? 500 : 400 }}>{label}</span>
    </Link>
  );
}

// ─── Recent map item ─────────────────────────────────────────────────────────

function RecentItem({ map }: { map: MapRow }) {
  return (
    <Link
      href={`/app/map/${map.id}`}
      className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-white/[0.04]"
      style={{ color: "#e4e0d8" }}
    >
      <div
        className="h-8 w-8 flex-shrink-0 rounded"
        style={{
          backgroundColor: "#182028",
          backgroundImage: map.thumbnail_url
            ? `url(${map.thumbnail_url})`
            : undefined,
          backgroundSize: "cover",
        }}
      />
      <span className="truncate">{map.title || "Namnlös karta"}</span>
    </Link>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface AppSidebarProps {
  mobileOpen: boolean;
  onMobileToggle: () => void;
}

export function AppSidebar({ mobileOpen, onMobileToggle }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, signOut } = useAuth();

  // Fetch recent maps (only when logged in)
  const { data: recentMaps, isLoading: recentsLoading } = useQuery<MapRow[]>({
    queryKey: ["recent-maps"],
    queryFn: async () => {
      const res = await fetch("/api/maps?limit=5");
      if (!res.ok) return [];
      const data = await res.json();
      return data.maps ?? data ?? [];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const isHome = pathname === "/app";
  const isGallery = pathname === "/app/gallery";

  const sidebarContent = (
    <div className="flex h-full flex-col" style={{ color: "#e4e0d8" }}>
      {/* Logo */}
      <div className="flex h-14 items-center justify-between px-4">
        <Link
          href="/app"
          className="flex items-center gap-2 text-base tracking-tight"
          style={{ fontFamily: "Georgia, serif", color: "#e4e0d8" }}
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: "#8ecba0" }}
          />
          atlas
        </Link>
        {/* Mobile close button */}
        <button
          onClick={onMobileToggle}
          className="md:hidden rounded p-1 transition-colors hover:bg-white/[0.06]"
          style={{ color: "#908c85" }}
          aria-label="Stäng meny"
        >
          <IconX />
        </button>
      </div>

      {/* Navigation */}
      <nav className="mt-2 space-y-0.5 px-2">
        <NavItem
          href="/app"
          icon={<IconHome active={isHome} />}
          label="Hem"
          active={isHome}
        />
        <NavItem
          href="/app/gallery"
          icon={<IconGrid active={isGallery} />}
          label="Galleri"
          active={isGallery}
        />
      </nav>

      {/* Recents */}
      {user && (
        <div className="mt-6 px-2">
          <div
            className="mb-2 px-3 text-xs uppercase tracking-widest"
            style={{ color: "#5a5752" }}
          >
            Senaste
          </div>
          {recentsLoading ? (
            <div className="space-y-1 px-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <div
                    className="h-8 w-8 flex-shrink-0 rounded animate-pulse"
                    style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                  />
                  <div
                    className="h-3 rounded animate-pulse"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.04)",
                      width: `${50 + i * 15}%`,
                    }}
                  />
                </div>
              ))}
            </div>
          ) : recentMaps && recentMaps.length > 0 ? (
            <div className="space-y-0.5">
              {recentMaps.map((m) => (
                <RecentItem key={m.id} map={m} />
              ))}
            </div>
          ) : (
            <p
              className="px-3 text-xs"
              style={{ color: "#5a5752" }}
            >
              Inga kartor ännu
            </p>
          )}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* New map CTA */}
      <div className="px-3 pb-3">
        <Link
          href="/app/map/new"
          className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all hover:brightness-110"
          style={{
            backgroundColor: "#d4a574",
            color: "#0d1217",
          }}
        >
          <IconPlus />
          Ny karta
        </Link>
      </div>

      {/* User menu */}
      {user ? (
        <div
          className="border-t px-4 py-3"
          style={{ borderColor: "rgba(255,255,255,0.05)" }}
        >
          <div className="flex items-center justify-between">
            <Link
              href="/app/profile"
              className="min-w-0 rounded-md px-1 -mx-1 transition-colors hover:bg-white/[0.04]"
            >
              <div className="truncate text-sm" style={{ color: "#e4e0d8" }}>
                {profile?.display_name || user.email?.split("@")[0]}
              </div>
              <div className="truncate text-xs" style={{ color: "#5a5752" }}>
                {profile?.plan === "pro" ? "Pro" : "Free"}
              </div>
            </Link>
            <button
              onClick={handleSignOut}
              className="rounded px-2 py-1 text-xs transition-colors hover:bg-white/[0.06]"
              style={{ color: "#908c85" }}
            >
              Logga ut
            </button>
          </div>
        </div>
      ) : (
        <div
          className="border-t px-4 py-3"
          style={{ borderColor: "rgba(255,255,255,0.05)" }}
        >
          <Link
            href="/auth/login"
            className="block text-center text-sm transition-colors hover:brightness-125"
            style={{ color: "#8ecba0" }}
          >
            Logga in
          </Link>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile hamburger (shown outside sidebar, in the layout) */}
      <button
        onClick={onMobileToggle}
        className="fixed left-4 top-4 z-50 rounded-lg p-2 md:hidden"
        style={{
          backgroundColor: "rgba(16,22,30,0.72)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          color: "#e4e0d8",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
        aria-label="Öppna meny"
      >
        <IconMenu />
      </button>

      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex h-full w-64 flex-shrink-0 flex-col"
        style={{
          backgroundColor: "rgba(16,22,30,0.72)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderRight: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={onMobileToggle}
          />
          <aside
            className="fixed inset-y-0 left-0 z-50 w-64 md:hidden"
            style={{
              backgroundColor: "rgba(16,22,30,0.95)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderRight: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
