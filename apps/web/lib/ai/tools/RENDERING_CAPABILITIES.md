# Atlas Rendering Capabilities Research (2026-04-01)

Research on visual features beyond the core MapManifest: image markers, proxy architecture, and production patterns from other map platforms.

---

## Table of Contents

1. [Image Markers in MapLibre](#1-image-markers-in-maplibre)
   - [1.1 MapLibre GL JS Rendering Techniques](#11-maplibre-gl-js-rendering-techniques)
   - [1.2 Image Source APIs — Complete Inventory](#12-image-source-apis--complete-inventory)
   - [1.3 Image Proxy Architecture](#13-image-proxy-architecture)
   - [1.4 Industry Patterns from Production Map Platforms](#14-industry-patterns-from-production-map-platforms)
   - [1.5 Wikidata Image Integration](#15-wikidata-image-integration)
   - [1.6 Recommended Architecture for Atlas](#16-recommended-architecture-for-atlas)

---

## 1. Image Markers in MapLibre

Research on how to implement per-feature custom images (logos, photos, avatars, flags) as map markers in Atlas. Covers MapLibre techniques, image source APIs, proxy architecture, and production patterns from other map platforms.

### 1.1 MapLibre GL JS Rendering Techniques

Six approaches, each with distinct performance/flexibility tradeoffs:

| Technique | How it works | Best for | Max markers |
|---|---|---|---|
| **A. `addImage` + symbol layer** | Pre-load images into GPU texture atlas, reference by ID via `icon-image` | Fixed/known icon sets | 10,000+ |
| **B. `styleimagemissing`** | Lazy-load images on demand when symbol layer references unknown ID | Dynamic per-feature images (logos, avatars) | 1,000-4,000 (atlas limit) |
| **C. HTML Marker** | DOM element per marker, full CSS/HTML | Rich interactive markers (<50) | ~200 before jank |
| **D. Canvas `StyleImageInterface`** | Generate pixel data programmatically, supports animation | Animated pulsing dots, generated initials | Same as symbol layer |
| **E. Sprite sheets** | Single PNG + JSON index, declared in style | Build-time known icon sets (category icons) | 10,000+ |
| **F. `coalesce` + `image()` fallback** | Declarative expression tries multiple image IDs | Graceful degradation | N/A (composition) |

#### Recommended pattern for Atlas: `styleimagemissing` + `coalesce` fallback

```js
// Pre-load category icons at startup (bounded, predictable)
const CATEGORY_ICONS = ['company', 'university', 'restaurant', 'landmark', 'default'];
map.on('load', async () => {
  await Promise.all(CATEGORY_ICONS.map(async c => {
    const img = await map.loadImage(`/icons/cat-${c}.png`);
    map.addImage(`cat-${c}`, img.data, { pixelRatio: 2 });
  }));
});

// Lazy-load brand-specific icons on demand
const pending = new Set();
map.on('styleimagemissing', async (e) => {
  const id = e.id;
  if (map.hasImage(id) || pending.has(id)) return;
  pending.add(id);
  try {
    const img = await map.loadImage(`/api/image-proxy?id=${id}&size=64`);
    if (!map.hasImage(id)) map.addImage(id, img.data, { pixelRatio: 2 });
  } catch {
    // fallback handled by coalesce expression — no action needed
  } finally {
    pending.delete(id);
  }
});

// Symbol layer with tiered fallback
layout: {
  'icon-image': [
    'coalesce',
    ['image', ['get', 'brand_icon']],                    // "logo-spotify"
    ['image', ['concat', 'cat-', ['get', 'category']]],  // "cat-company"
    ['image', 'cat-default']                              // always loaded
  ],
  'icon-size': 1
}
```

#### GPU texture atlas limits

Atlas is a single WebGL texture, max size depends on GPU:
- Minimum guaranteed: 4096x4096
- Typical modern: 8192x8192 or 16384x16384

Practical icon capacity at 64x64 px: ~4,000 icons on 4096 atlas, ~16,000 on 8192.

For 500+ unique images, implement **atlas eviction** on `moveend`:
```js
map.on('moveend', () => {
  const visible = new Set(
    map.queryRenderedFeatures({ layers: ['my-layer'] }).map(f => f.properties.icon)
  );
  for (const id of trackedImages) {
    if (!visible.has(id) && map.hasImage(id)) map.removeImage(id);
  }
});
```

#### Performance thresholds

| Count | Symbol layer | HTML Marker |
|---|---|---|
| <50 | No difference | No difference |
| 50-500 | Smooth | Slight jank on mobile |
| 500-2,000 | Smooth (disable collision) | Laggy |
| 2,000-10,000 | With clustering | Not viable |
| 10,000+ | With server-side clustering | Not viable |

Set `icon-allow-overlap: true` and `icon-ignore-placement: true` to skip O(n^2) collision detection.

#### Critical pitfalls

1. **`styleimagemissing` fires multiple times** for same ID before async resolves — always guard with `hasImage()` + pending Set
2. **SVGs need explicit `width`/`height`** attributes — Firefox fails silently without them
3. **`setStyle()` clears runtime images** (fixed in recent v5, verify your version)
4. **`icon-size` incompatible with `icon-text-fit`** (long-standing issue #989)
5. **`pixelRatio` vs `icon-size`**: `pixelRatio: 2` = "image is 2x, render at half pixels". `icon-size: 0.5` = "scale rendered output by half". They compose multiplicatively.
6. **No built-in timeout** on `loadImage` — implement with `AbortController` (5s recommended)

---

### 1.2 Image Source APIs — Complete Inventory

#### Company/Brand Logos

| Service | URL pattern | Free? | Quality | CORS | Status |
|---|---|---|---|---|---|
| **Logo.dev** | `img.logo.dev/{domain}?token=TOKEN&size=200&format=png` | Yes (attribution req.) | Good | Via img tag | Active — **recommended** |
| **Brandfetch CDN** | `cdn.brandfetch.io/...` (from API response) | 500K req/mo fair-use | Excellent | CDN URLs | Active — best coverage |
| **Brandfetch API** | `api.brandfetch.io/v2/brands/{domain}` | Paid $99/mo | Excellent | Needs proxy | Active |
| **Google Favicon** | `google.com/s2/favicons?domain={d}&sz=64` | Free, unofficial | Low (favicon) | Yes | Active |
| **DuckDuckGo Favicon** | `icons.duckduckgo.com/ip3/{domain}.ico` | Free, unofficial | Low | Yes | Active — returns 404 for missing (useful) |

**Recommendation**: Logo.dev as primary (free, good quality), Google Favicon as fallback (always available).

#### Social/Profile Avatars

| Service | URL pattern | Free? | CORS |
|---|---|---|---|
| **GitHub** | `github.com/{user}.png?size=64` | Free, no auth | Yes |
| **Gravatar** | `gravatar.com/avatar/{sha256(email)}?s=64&d=404` | Free | Yes |
| **unavatar.io** | `unavatar.io/{provider}/{username}` | 50 req/day free, $0.001/miss paid | Yes |
| Twitter/X | API v2 only, $100/mo minimum | No | Yes once URL known |
| LinkedIn | OAuth + partner approval required | No | N/A |

#### Place/POI Photos

| Service | Auth | Cost | Notes |
|---|---|---|---|
| **Google Places Photos** | API key | ~$0.007/req (capped free tier) | 2-step: search -> photo URL. Cache aggressively. |
| Foursquare | API key | $18.75/1K (photos are premium) | Global POI, strong restaurants |
| Yelp | API key | $9.99/1K (Plus plan for photos) | US-centric |

#### Country Flags

| Service | URL pattern | Format | Cost |
|---|---|---|---|
| **flagcdn.com** | `flagcdn.com/32x24/{code}.png` | PNG, WebP, SVG | Free, Cloudflare CDN |
| **flag-icons (npm)** | `cdn.jsdelivr.net/npm/flag-icons@{v}/flags/4x3/{code}.svg` | SVG | Free, MIT |

Both are zero-auth, CORS-safe, and production-ready.

#### Icon Libraries (category fallbacks)

| Library | Count | URL pattern | Best for |
|---|---|---|---|
| **Maki** (Mapbox) | 374 | `cdn.jsdelivr.net/npm/@mapbox/maki/icons/{name}.svg` | Map POI categories (CC0) |
| **Iconify** | 275K+ | `api.iconify.design/{set}/{icon}.svg` | Any category — single API for 200+ icon sets |
| **Geoapify Marker** | N/A | `api.geoapify.com/v1/icon/?type=circle&icon={name}&color={hex}&apiKey=KEY` | Pre-styled pin markers with embedded icons |
| Lucide | 1500+ | `unpkg.com/lucide-static@latest/icons/{name}.svg` | UI icons (ISC) |

**Geoapify Marker API** is uniquely useful — it generates complete styled pin/bubble marker PNGs with embedded icons, ready for map use.

#### Emoji as Markers

Feasible via pre-rendered sprite sheets. **OpenMoji** and **Twemoji** provide consistent cross-platform SVGs:
- Twemoji CDN: `cdn.jsdelivr.net/npm/twemoji@latest/2/svg/{codepoint}.svg`
- OpenMoji: has a MapLibre-specific sprite sheet project (2025)

OS-native emoji rendering varies across platforms — use SVG sets for consistency.

#### AI-Generated Icons

| Approach | Latency | Cost | Viability for markers |
|---|---|---|---|
| Recraft V3 SVG (Replicate) | 5-30s | ~$0.04/img | Offline batch generation only |
| Stable Diffusion | 5-60s | ~$0.035/img | Not suitable for clean icons |
| **Inline SVG generation (code)** | 0ms | Free | Best for initials/colored circles |

Real-time AI generation is too slow. Use code-generated SVGs for dynamic fallbacks:
```js
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <circle cx="32" cy="32" r="32" fill="${hashColor(name)}"/>
  <text x="32" y="32" text-anchor="middle" dominant-baseline="central"
    fill="white" font-size="24" font-weight="bold">${initials}</text>
</svg>`;
```

---

### 1.3 Image Proxy Architecture

**Why a proxy is mandatory:**
- CORS: Most external APIs block `fetch()` from browser. MapLibre `loadImage()` requires CORS.
- Consistency: Resize all images to uniform 64x64 PNG for atlas
- Security: Prevent SSRF on user-supplied URLs
- Caching: Don't hammer upstream APIs on every map render
- Processing: Circular crop, border, SVG->PNG conversion

#### Recommended: Next.js Route Handler + Sharp

```
GET /api/image-proxy?url=<encoded>&size=64&format=png&sig=<HMAC>
```

Pipeline: validate URL -> SSRF check -> fetch with timeout -> Sharp resize/crop -> PNG output -> cache headers

**Processing steps (Sharp):**
1. Fetch source (3-5s timeout, reject >2MB)
2. SVG? -> `sharp(buffer, { density: 192 })` for correct rasterization
3. Resize: `sharp.resize(64, 64, { fit: 'contain', background: transparent })`
4. Circular mask: composite SVG circle with `blend: 'dest-in'`
5. Border ring: composite 1-2px white/dark ring for map visibility
6. Output: `.png({ compressionLevel: 8 })` -> typically 2-6 KB per icon

**SSRF prevention (critical):**
1. Parse URL — reject non-`https:`, reject auth in URL, reject non-443 ports
2. DNS pre-resolve — reject private IPs (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x)
3. Disable redirects (`redirect: 'error'`) — prevents open redirect bypass (CVE-2024-34351)
4. Content-Type validation — reject non-`image/*` responses
5. Size limit — abort after 2MB streaming
6. HMAC URL signing — prevents proxy abuse

**Caching strategy:**

| Layer | TTL | Purpose |
|---|---|---|
| Browser | `Cache-Control: public, max-age=86400` | 1 day local cache |
| Vercel CDN | `s-maxage=604800` | 7 days edge cache |
| Redis/KV | 7 days, key: `SHA256(url+size+format)` | Processed PNG bytes |
| Origin | External API | Rate-limit protected |

Storage estimates at 4KB/icon: 10K images = 40MB, 100K = 400MB, 1M = 4GB.

**Cost on Vercel Pro ($20/mo):**
- 10K unique images: ~$0 (within plan)
- 100K unique images: ~$5-10 overage
- Add Cloudflare free tier in front to absorb 80-90% bandwidth cost

#### Fallback chain (server-side)

```
1. Proxy(sourceUrl) -> success -> processed PNG
2. -> fail -> Google Favicon(domain) -> success -> processed PNG
3.          -> fail -> generate initials avatar (Sharp SVG->PNG)
4.                   -> no name -> category icon from Maki
5.                               -> generic colored dot
```

Detect "broken" images server-side: reject 1x1 pixel tracking GIFs, check Content-Type, reject <8x8 px.

---

### 1.4 Industry Patterns from Production Map Platforms

#### The universal consensus

Every major platform (Google Maps, Mapbox, Felt, deck.gl, CARTO, Airbnb, Zillow) has converged on the same architecture:

> **Images at close zoom, dots/icons at overview zoom. Never show full images at high density.**

No production platform shows photo thumbnails as always-visible markers at scale. Photos/logos appear only in focused/selected states or at close zoom with low density.

#### Platform comparison

| Platform | Approach | Scale limit | Key insight |
|---|---|---|---|
| **Google Maps** (AdvancedMarker) | DOM-based, any HTML | ~500 simultaneous | Full CSS freedom, but DOM-heavy |
| **Mapbox GL JS** | `styleimagemissing` + sprite atlas | 10K+ with sprite | Community-standard lazy loading pattern |
| **Felt** | Workspace icon library, smart zoom transitions | N/A (not developer API) | Icons->dots at far zoom is built-in |
| **deck.gl IconLayer** | Auto-packed texture atlas from URLs | ~50K pre-packed, ~5K auto-packed | Deduplication built in; closest to Atlas use case |
| **CARTO** | Upload PNG/SVG, max 120x120px | Limited | "Marker by property" = categorical icons |
| **Airbnb/Zillow** | Price pills as markers, photos in popup only | 10K+ | Photos are too heavy for always-visible markers |

#### Key UX decisions for Atlas

1. **Circular crop is the standard** — all platforms use circular image markers for brand/person use cases. Reduces visual noise, creates consistency across different logo shapes.

2. **Two-state interaction pattern:**
   - Default: small icon (32-40px), category fallback if no image
   - Hover/selected: scale 1.2x, show border ring, open panel with full detail

3. **Mobile touch targets:** minimum 44x44pt (iOS), 48x48dp (Android). If >5-8 markers overlap within 200x200dp, switch to clustering.

4. **Loading states:** Render colored placeholder immediately -> swap to image on load. No shimmer/skeleton (no platform does this for map markers).

5. **Mixed content (some features have images, some don't):** Use `coalesce` expression — brand icon -> category icon -> initials -> generic dot. Make the fallback a first-class part of the data pipeline.

---

### 1.5 Wikidata Image Integration

Wikidata-specific image marker integration: properties, thumbnail URLs, SPARQL pipeline, and fallback strategies.

#### Wikidata Image Properties

| Property | Label | Use |
|---|---|---|
| P154 | logo image | Company/org logos |
| P18 | image | General photo of the entity |
| P41 | flag image | Country/region flags |
| P94 | coat of arms | Heraldic shields |
| P242 | locator map image | Location context maps |

#### Wikimedia Commons Thumbnail URLs

**CORS-safe direct URL** (requires MD5 hash of filename):
```
https://upload.wikimedia.org/wikipedia/commons/thumb/{h1}/{h2}/{filename}/{width}px-{filename}
```

Where `h1` = first char of MD5, `h2` = first 2 chars of MD5 of the normalized filename.

```typescript
function commonsThumbUrl(filename: string, width: number): string {
  const normalized = filename.replace(/ /g, '_');
  const hash = md5(normalized);
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${hash[0]}/${hash.slice(0,2)}/${encodeURIComponent(normalized)}/${width}px-${encodeURIComponent(normalized)}`;
}
```

**WARNING:** `Special:FilePath` URLs use 302 redirects that LACK CORS headers — they do NOT work in `map.loadImage()`. Must use direct `upload.wikimedia.org` URLs.

**MediaWiki API fallback** (extra round-trip but reliable):
```
GET https://commons.wikimedia.org/w/api.php
  ?action=query&format=json&prop=imageinfo&iiprop=url
  &iiurlwidth=64&titles=File:{filename}&origin=*
```

#### Thumbnail Size Recommendations

| Size | Use case |
|---|---|
| 32px | Dense maps, many markers |
| 48px | Good balance |
| 64px | **Recommended default** — sharp on retina with `pixelRatio: 2` |
| 128px | Selected/highlighted state only |

#### Canvas Fallback (ImageData-based)

Generate colored circle with initials when image fails to load:
```typescript
function makeInitialsBadge(initials: string, bgColor: string, size = 64): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${size * 0.35}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, size/2, size/2);
  return ctx.getImageData(0, 0, size, size);
}
```

This returns `ImageData` directly usable with `map.addImage()`. See section 1.1 for an SVG-based alternative.

#### Integration with Wikidata SPARQL

Add P154/P18 to SPARQL templates:
```sparql
SELECT ?item ?itemLabel ?coord ?logoFile WHERE {
  ?item wdt:P31 wd:Q891723 ;       # instance of: startup company
        wdt:P131 wd:Q1754 ;        # located in: Stockholm
        wdt:P625 ?coord .
  OPTIONAL { ?item wdt:P154 ?logoFile . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,sv" }
}
```

Pipeline: SPARQL result -> extract Commons filename from P154 -> `commonsThumbUrl(filename, 64)` -> set as `logo_url` property -> `styleimagemissing` loads on demand -> rendered as icon marker.

#### Popup-on-Hover Alternative (for 500+ markers)

Show standard circle markers, reveal image only on hover — avoids loading hundreds of images:

```typescript
map.on('mousemove', 'points', (e) => {
  const { name, logo_url } = e.features[0].properties;
  popup.setLngLat(e.lngLat).setHTML(`
    <div style="display:flex;align-items:center;gap:8px">
      <img src="${logo_url}" width="40" height="40" style="border-radius:4px;object-fit:contain" />
      <strong>${name}</strong>
    </div>
  `).addTo(map);
});
```

Images in popup `<img>` tags bypass CORS canvas restrictions — any URL works.

---

### 1.6 Recommended Architecture for Atlas

#### Image source priority chain

```
1. User-provided URL -> validate -> proxy -> 64x64 PNG
2. Company domain -> Logo.dev (free, token) -> proxy
3. Wikidata entity -> P154 (logo) or P18 (image) -> Commons thumbnail -> proxy
4. Country/region -> flagcdn.com (direct, no proxy needed)
5. Category -> Maki SVG or Geoapify styled pin
6. Fallback -> code-generated initials SVG or colored dot
```

#### Zoom-level strategy

```
Zoom 0-8:   Clustering (Supercluster) — show count bubbles
Zoom 8-12:  Category icons (from sprite) — Maki or custom set
Zoom 12-16: Brand/logo icons (lazy-loaded via styleimagemissing)
Zoom 16+:   Full image markers (if HTML marker needed for richness)
```

#### File structure (proposed)

```
apps/web/
├── app/api/image-proxy/route.ts     # Next.js route handler (Sharp, SSRF, caching)
├── lib/map/image-markers.ts         # styleimagemissing handler, fallback logic
├── lib/map/image-sources.ts         # Logo.dev, favicon, Wikidata image resolvers
└── lib/map/initials-generator.ts    # Canvas/SVG initials avatar generation
```

#### Implementation phases

- **Fas 0 (1v):** Image proxy route (`/api/image-proxy`) with Sharp, SSRF validation, CDN caching
- **Fas 1 (1v):** `styleimagemissing` handler + `coalesce` fallback + initials generator
- **Fas 2 (1v):** Logo.dev integration + Google Favicon fallback chain
- **Fas 3 (2v):** Wikidata P154/P18 image resolution (builds on Section 7 Wikidata adapter)
- **Fas 4 (ongoing):** Zoom-level transitions, clustering with image aggregation, atlas eviction
