"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import type { MapRow } from "../../lib/supabase/types";
import type { User } from "@supabase/supabase-js";

// ─── Map card ────────────────────────────────────────────────

function MapCard({
  map,
  onRename,
  onDelete,
  onShare,
}: {
  map: MapRow;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onShare: (map: MapRow) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(map.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const family = (map.manifest as Record<string, unknown>)?.layers
    ? ((map.manifest as Record<string, unknown[]>).layers as Record<string, unknown>[])?.[0]
        ?.style
      ? (((map.manifest as Record<string, unknown[]>).layers as Record<string, Record<string, string>>[])?.[0]?.style?.mapFamily ?? "map")
      : "map"
    : "map";

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 10);
  }

  function commitTitle() {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(map.title);
      setEditing(false);
      return;
    }
    setEditing(false);
    if (trimmed !== map.title) onRename(map.id, trimmed);
  }

  const familyColors: Record<string, string> = {
    choropleth: "#4F8EF7",
    heatmap: "#f97316",
    point: "#a855f7",
    cluster: "#a855f7",
    flow: "#38bdf8",
    isochrone: "#34d399",
    "proportional-symbol": "#fbbf24",
  };
  const color = familyColors[family as string] ?? "#4F8EF7";

  const dateStr = new Date(map.updated_at).toLocaleDateString("sv-SE", {
    year: "numeric", month: "short", day: "numeric",
  });

  return (
    <div
      onClick={() => router.push(`/maps/${map.id}`)}
      style={{ cursor: "pointer", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden", transition: "border-color 150ms ease, background 150ms ease" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.16)"; (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.05)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)"; }}
    >
      {/* Thumbnail */}
      <div style={{ height: 120, background: `linear-gradient(135deg, #0d1220 0%, rgba(${color === "#4F8EF7" ? "79,142,247" : color === "#f97316" ? "249,115,22" : "168,85,247"},0.15) 100%)`, display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: `rgba(${color === "#4F8EF7" ? "79,142,247" : color === "#f97316" ? "249,115,22" : "168,85,247"},0.20)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
            <line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />
          </svg>
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: "14px 16px" }}>
        {/* Title — inline editable */}
        {editing ? (
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") { setTitle(map.title); setEditing(false); } }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.20)", borderRadius: 6, padding: "3px 6px", fontFamily: "'Geist',sans-serif", fontSize: 14, fontWeight: 500, color: "#F8F9FB", outline: "none", marginBottom: 6 }}
            autoFocus
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <h3 style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, fontWeight: 500, color: "rgba(248,249,251,0.90)", margin: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {map.title}
            </h3>
            <button
              onClick={startEdit}
              title="Byt namn"
              style={{ padding: 3, background: "none", border: "none", cursor: "pointer", color: "rgba(248,249,251,0.25)", borderRadius: 4, flexShrink: 0, transition: "color 120ms ease" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,249,251,0.60)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,249,251,0.25)"; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>
        )}

        <p style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: "rgba(248,249,251,0.30)", margin: "0 0 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {map.prompt}
        </p>

        {/* Meta row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, color: "rgba(248,249,251,0.25)" }}>{dateStr}</span>
            {map.is_public && (
              <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 10, color: "#34d399", background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 4, padding: "1px 5px" }}>Delad</span>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onShare(map)}
              title={map.is_public ? "Länk kopierad" : "Dela karta"}
              style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, cursor: "pointer", color: "rgba(248,249,251,0.35)", transition: "all 120ms ease" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.09)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,249,251,0.70)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,249,251,0.35)"; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(map.id); }}
              title="Radera"
              style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, cursor: "pointer", color: "rgba(248,249,251,0.35)", transition: "all 120ms ease" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(201,79,79,0.12)"; (e.currentTarget as HTMLButtonElement).style.color = "#C94F4F"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(201,79,79,0.25)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,249,251,0.35)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)"; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<User | null>(null);

  const [maps, setMaps] = useState<MapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  // Load user + maps
  useEffect(() => {
    async function load() {
      if (!supabase) { router.replace("/login"); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setUser(user);

      const res = await fetch("/api/maps");
      if (res.ok) {
        const json = await res.json();
        setMaps(json.maps ?? []);
      }
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRename = useCallback(async (id: string, title: string) => {
    setMaps((prev) => prev.map((m) => m.id === id ? { ...m, title } : m));
    await fetch(`/api/maps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm("Radera kartan permanent?")) return;
    setMaps((prev) => prev.filter((m) => m.id !== id));
    await fetch(`/api/maps/${id}`, { method: "DELETE" });
    showToast("Karta raderad");
  }, []);

  const handleShare = useCallback(async (map: MapRow) => {
    // Make public if not already
    if (!map.is_public) {
      const res = await fetch(`/api/maps/${map.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: true }),
      });
      if (res.ok) {
        setMaps((prev) => prev.map((m) => m.id === map.id ? { ...m, is_public: true } : m));
      }
    }
    const url = `${window.location.origin}/maps/${map.id}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    showToast("Länk kopierad!");
  }, []);

  async function handleSignOut() {
    if (supabase) await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0d14", color: "#F8F9FB" }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "rgba(10,13,20,0.95)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 18px", fontFamily: "'Geist',sans-serif", fontSize: 13, color: "rgba(248,249,251,0.80)", zIndex: 100, backdropFilter: "blur(12px)", boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 60, background: "rgba(10,13,20,0.92)", borderBottom: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}>
        <a href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 18, fontWeight: 500, color: "#F8F9FB", letterSpacing: "-0.01em" }}>atlas</span>
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {user && (
            <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 13, color: "rgba(248,249,251,0.40)" }}>
              {user.email}
            </span>
          )}
          <button
            onClick={handleSignOut}
            style={{ fontFamily: "'Geist',sans-serif", fontSize: 13, color: "rgba(248,249,251,0.45)", background: "none", border: "none", cursor: "pointer", padding: "6px 12px", borderRadius: 8, transition: "color 120ms ease, background 120ms ease" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,249,251,0.80)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(248,249,251,0.45)"; (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
          >
            Logga ut
          </button>
        </div>
      </header>

      {/* Main */}
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px" }}>
        {/* Page header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 36 }}>
          <div>
            <h1 style={{ fontFamily: "'Geist',sans-serif", fontSize: 28, fontWeight: 500, color: "#F8F9FB", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
              Dina kartor
            </h1>
            <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, color: "rgba(248,249,251,0.40)", margin: 0 }}>
              {maps.length === 0 && !loading ? "Inga sparade kartor än" : `${maps.length} karta${maps.length !== 1 ? "r" : ""}`}
            </p>
          </div>
          <a href="/"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "'Geist',sans-serif", fontSize: 14, fontWeight: 500, color: "#fff", background: "#1D4ED8", border: "none", borderRadius: 10, padding: "9px 18px", textDecoration: "none", boxShadow: "0 4px 16px rgba(29,78,216,0.30)", transition: "background 150ms ease" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "#2563EB"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "#1D4ED8"; }}>
            + Ny karta
          </a>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, height: 210, animation: "pulse 1.5s ease-in-out infinite" }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && maps.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>🗺</div>
            <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 16, color: "rgba(248,249,251,0.45)", marginBottom: 24 }}>
              Du har inte sparat några kartor än
            </p>
            <a href="/"
              style={{ display: "inline-flex", fontFamily: "'Geist',sans-serif", fontSize: 14, fontWeight: 500, color: "#fff", background: "#1D4ED8", borderRadius: 10, padding: "10px 22px", textDecoration: "none" }}>
              Skapa din första karta
            </a>
          </div>
        )}

        {/* Map grid */}
        {!loading && maps.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {maps.map((map) => (
              <MapCard
                key={map.id}
                map={map}
                onRename={handleRename}
                onDelete={handleDelete}
                onShare={handleShare}
              />
            ))}
          </div>
        )}
      </main>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:.5} 50%{opacity:.8} }
      `}</style>
    </div>
  );
}
