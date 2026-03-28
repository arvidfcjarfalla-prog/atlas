"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useMap } from "./use-map";

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string];
}

/**
 * Lightweight place search overlay using Nominatim (free, no API key).
 * Renders a search input that flies the map to the selected result.
 */
export function GeocoderControl() {
  const { map, isReady } = useMap();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`,
        { signal: ctrl.signal, headers: { "User-Agent": "Atlas-MapPlatform/1.0" } },
      );
      if (!res.ok) return;
      const data: NominatimResult[] = await res.json();
      setResults(data);
      setOpen(data.length > 0);
    } catch {
      // aborted or network error
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => search(value), 300);
    },
    [search],
  );

  const handleSelect = useCallback(
    (result: NominatimResult) => {
      if (!map || !isReady) return;
      setQuery(result.display_name.split(",")[0]);
      setOpen(false);
      setResults([]);

      const [south, north, west, east] = result.boundingbox.map(Number);
      const span = Math.max(north - south, east - west);
      if (span > 0.01) {
        map.fitBounds(
          [[west, south], [east, north]],
          { padding: 60, duration: 1200, maxZoom: 16 },
        );
      } else {
        map.flyTo({
          center: [Number(result.lon), Number(result.lat)],
          zoom: 14,
          duration: 1200,
        });
      }
    },
    [map, isReady],
  );

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        zIndex: 5,
        width: 260,
        fontFamily: "'Geist',system-ui,sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "rgba(12,16,24,0.75)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: open ? "6px 6px 0 0" : 6,
          padding: "0 10px",
          height: 34,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(200,210,225,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search places…"
          style={{
            flex: 1,
            background: "none",
            border: "none",
            outline: "none",
            color: "rgba(240,245,250,0.9)",
            fontSize: 12,
            padding: "0 8px",
            fontFamily: "inherit",
          }}
        />
        {loading && (
          <span style={{ fontSize: 10, color: "rgba(200,210,225,0.4)" }}>…</span>
        )}
        {query && (
          <button
            onClick={() => { setQuery(""); setResults([]); setOpen(false); }}
            style={{
              background: "none",
              border: "none",
              color: "rgba(200,210,225,0.4)",
              cursor: "pointer",
              fontSize: 14,
              padding: 0,
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div
          style={{
            background: "rgba(12,16,24,0.92)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderTop: "none",
            borderRadius: "0 0 6px 6px",
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          {results.map((r) => (
            <button
              key={r.place_id}
              onClick={() => handleSelect(r)}
              style={{
                display: "block",
                width: "100%",
                padding: "8px 12px",
                background: "none",
                border: "none",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                color: "rgba(240,245,250,0.85)",
                fontSize: 12,
                textAlign: "left",
                cursor: "pointer",
                fontFamily: "inherit",
                lineHeight: 1.4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.background = "rgba(255,255,255,0.06)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.background = "none";
              }}
            >
              {r.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
