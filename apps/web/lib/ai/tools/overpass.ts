/**
 * Overpass API helper for querying OpenStreetMap data.
 *
 * Builds Overpass QL queries for common patterns (amenities, boundaries,
 * natural features) and returns GeoJSON FeatureCollections.
 *
 * Rate limits: Overpass public API allows ~10k requests/day.
 * We cache results for 1 hour to be conservative.
 */

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const TIMEOUT = 15; // seconds
const MAX_FEATURES = 500;

// ─── Cache ──────────────────────────────────────────────────

interface CacheEntry {
  data: GeoJSON.FeatureCollection;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCached(key: string): GeoJSON.FeatureCollection | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

// ─── Query builder ──────────────────────────────────────────

export interface OverpassQuery {
  /** OSM tag key (e.g. "amenity", "natural", "tourism"). */
  key: string;
  /** OSM tag value (e.g. "restaurant", "peak", "hotel"). */
  value: string;
  /** Bounding box [south, west, north, east]. */
  bbox: [number, number, number, number];
}

function buildQL(query: OverpassQuery): string {
  const { key, value, bbox } = query;
  const [s, w, n, e] = bbox;
  return `[out:json][timeout:${TIMEOUT}];
node["${key}"="${value}"](${s},${w},${n},${e});
out center ${MAX_FEATURES};`;
}

// ─── Query execution ────────────────────────────────────────

/**
 * Query Overpass API and return GeoJSON.
 * Returns null if the query fails or returns no results.
 */
export async function queryOverpass(
  query: OverpassQuery,
): Promise<GeoJSON.FeatureCollection | null> {
  const ql = buildQL(query);
  const cacheKey = ql;

  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(ql)}`,
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const elements = data.elements as Array<{
      type: string;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }>;

    if (!elements || elements.length === 0) return null;

    const features: GeoJSON.Feature[] = elements
      .filter((el) => {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        return lat != null && lon != null;
      })
      .map((el, i) => {
        const lat = el.lat ?? el.center?.lat ?? 0;
        const lon = el.lon ?? el.center?.lon ?? 0;
        const tags = el.tags ?? {};
        return {
          type: "Feature" as const,
          id: i,
          geometry: {
            type: "Point" as const,
            coordinates: [lon, lat],
          },
          properties: {
            name: tags.name ?? "",
            type: tags[query.key] ?? query.value,
            ...tags,
          },
        };
      });

    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features,
    };

    cache.set(cacheKey, { data: fc, timestamp: Date.now() });

    return fc;
  } catch {
    return null;
  }
}

// ─── Common amenity mappings ────────────────────────────────

/**
 * Map common user terms to Overpass tag queries.
 * Returns null if no mapping is found.
 */
export function resolveAmenityQuery(
  term: string,
  bbox: [number, number, number, number],
): OverpassQuery | null {
  const lower = term.toLowerCase();

  const MAPPINGS: Record<string, { key: string; value: string }> = {
    // ── Food & Drink ──
    restaurant: { key: "amenity", value: "restaurant" },
    restaurang: { key: "amenity", value: "restaurant" },
    restaurants: { key: "amenity", value: "restaurant" },
    café: { key: "amenity", value: "cafe" },
    cafe: { key: "amenity", value: "cafe" },
    kafé: { key: "amenity", value: "cafe" },
    "coffee shop": { key: "amenity", value: "cafe" },
    coffee: { key: "amenity", value: "cafe" },
    bar: { key: "amenity", value: "bar" },
    pub: { key: "amenity", value: "pub" },
    krog: { key: "amenity", value: "pub" },
    "beer garden": { key: "amenity", value: "biergarten" },
    biergarten: { key: "amenity", value: "biergarten" },
    "fast food": { key: "amenity", value: "fast_food" },
    snabbmat: { key: "amenity", value: "fast_food" },
    "food court": { key: "amenity", value: "food_court" },
    "ice cream": { key: "amenity", value: "ice_cream" },
    glass: { key: "amenity", value: "ice_cream" },
    gelato: { key: "amenity", value: "ice_cream" },
    nightclub: { key: "amenity", value: "nightclub" },
    nattklubb: { key: "amenity", value: "nightclub" },
    casino: { key: "amenity", value: "casino" },
    // ── Shopping ──
    supermarket: { key: "shop", value: "supermarket" },
    livsmedel: { key: "shop", value: "supermarket" },
    grocery: { key: "shop", value: "supermarket" },
    convenience: { key: "shop", value: "convenience" },
    kiosk: { key: "shop", value: "kiosk" },
    mall: { key: "shop", value: "mall" },
    köpcentrum: { key: "shop", value: "mall" },
    "shopping center": { key: "shop", value: "mall" },
    bakery: { key: "shop", value: "bakery" },
    bageri: { key: "shop", value: "bakery" },
    butcher: { key: "shop", value: "butcher" },
    slaktare: { key: "shop", value: "butcher" },
    bookstore: { key: "shop", value: "books" },
    bokhandel: { key: "shop", value: "books" },
    clothes: { key: "shop", value: "clothes" },
    kläder: { key: "shop", value: "clothes" },
    clothing: { key: "shop", value: "clothes" },
    shoes: { key: "shop", value: "shoes" },
    skor: { key: "shop", value: "shoes" },
    electronics: { key: "shop", value: "electronics" },
    elektronik: { key: "shop", value: "electronics" },
    "mobile phone": { key: "shop", value: "mobile_phone" },
    jewelry: { key: "shop", value: "jewelry" },
    smycken: { key: "shop", value: "jewelry" },
    florist: { key: "shop", value: "florist" },
    blomsterhandel: { key: "shop", value: "florist" },
    hairdresser: { key: "shop", value: "hairdresser" },
    frisör: { key: "shop", value: "hairdresser" },
    optician: { key: "shop", value: "optician" },
    optiker: { key: "shop", value: "optician" },
    hardware: { key: "shop", value: "hardware" },
    järnhandel: { key: "shop", value: "hardware" },
    furniture: { key: "shop", value: "furniture" },
    möbler: { key: "shop", value: "furniture" },
    "department store": { key: "shop", value: "department_store" },
    varuhus: { key: "shop", value: "department_store" },
    cosmetics: { key: "shop", value: "cosmetics" },
    // ── Health ──
    hospital: { key: "amenity", value: "hospital" },
    sjukhus: { key: "amenity", value: "hospital" },
    clinic: { key: "amenity", value: "clinic" },
    klinik: { key: "amenity", value: "clinic" },
    doctor: { key: "amenity", value: "doctors" },
    läkare: { key: "amenity", value: "doctors" },
    dentist: { key: "amenity", value: "dentist" },
    tandläkare: { key: "amenity", value: "dentist" },
    veterinary: { key: "amenity", value: "veterinary" },
    veterinär: { key: "amenity", value: "veterinary" },
    vet: { key: "amenity", value: "veterinary" },
    pharmacy: { key: "amenity", value: "pharmacy" },
    apotek: { key: "amenity", value: "pharmacy" },
    "nursing home": { key: "amenity", value: "nursing_home" },
    äldreboende: { key: "amenity", value: "nursing_home" },
    // ── Education ──
    school: { key: "amenity", value: "school" },
    skola: { key: "amenity", value: "school" },
    university: { key: "amenity", value: "university" },
    universitet: { key: "amenity", value: "university" },
    college: { key: "amenity", value: "college" },
    högskola: { key: "amenity", value: "college" },
    kindergarten: { key: "amenity", value: "kindergarten" },
    förskola: { key: "amenity", value: "kindergarten" },
    library: { key: "amenity", value: "library" },
    bibliotek: { key: "amenity", value: "library" },
    "driving school": { key: "amenity", value: "driving_school" },
    körskola: { key: "amenity", value: "driving_school" },
    "music school": { key: "amenity", value: "music_school" },
    musikskola: { key: "amenity", value: "music_school" },
    "language school": { key: "amenity", value: "language_school" },
    språkskola: { key: "amenity", value: "language_school" },
    // ── Transport ──
    "train station": { key: "railway", value: "station" },
    station: { key: "railway", value: "station" },
    tågstation: { key: "railway", value: "station" },
    järnvägsstation: { key: "railway", value: "station" },
    "subway station": { key: "railway", value: "subway_entrance" },
    "metro station": { key: "railway", value: "subway_entrance" },
    subway: { key: "railway", value: "subway_entrance" },
    metro: { key: "railway", value: "subway_entrance" },
    tunnelbana: { key: "railway", value: "subway_entrance" },
    "tram stop": { key: "railway", value: "tram_stop" },
    tram: { key: "railway", value: "tram_stop" },
    spårvagn: { key: "railway", value: "tram_stop" },
    "bus station": { key: "amenity", value: "bus_station" },
    busstation: { key: "amenity", value: "bus_station" },
    "ferry terminal": { key: "amenity", value: "ferry_terminal" },
    färjeterminal: { key: "amenity", value: "ferry_terminal" },
    airport: { key: "aeroway", value: "aerodrome" },
    flygplats: { key: "aeroway", value: "aerodrome" },
    heliport: { key: "aeroway", value: "heliport" },
    taxi: { key: "amenity", value: "taxi" },
    parking: { key: "amenity", value: "parking" },
    parkering: { key: "amenity", value: "parking" },
    "bicycle parking": { key: "amenity", value: "bicycle_parking" },
    cykelparkering: { key: "amenity", value: "bicycle_parking" },
    "bicycle rental": { key: "amenity", value: "bicycle_rental" },
    cykelhyra: { key: "amenity", value: "bicycle_rental" },
    "car rental": { key: "amenity", value: "car_rental" },
    biluthyrning: { key: "amenity", value: "car_rental" },
    "charging station": { key: "amenity", value: "charging_station" },
    charging: { key: "amenity", value: "charging_station" },
    laddstation: { key: "amenity", value: "charging_station" },
    "ev charging": { key: "amenity", value: "charging_station" },
    "gas station": { key: "amenity", value: "fuel" },
    bensinstation: { key: "amenity", value: "fuel" },
    fuel: { key: "amenity", value: "fuel" },
    "petrol station": { key: "amenity", value: "fuel" },
    // ── Paths ──
    bicycle: { key: "highway", value: "cycleway" },
    cykelväg: { key: "highway", value: "cycleway" },
    "bike path": { key: "highway", value: "cycleway" },
    cycleway: { key: "highway", value: "cycleway" },
    "pedestrian street": { key: "highway", value: "pedestrian" },
    "pedestrian zone": { key: "highway", value: "pedestrian" },
    pedestrian: { key: "highway", value: "pedestrian" },
    gågata: { key: "highway", value: "pedestrian" },
    // ── Tourism & Accommodation ──
    hotel: { key: "tourism", value: "hotel" },
    hotell: { key: "tourism", value: "hotel" },
    motel: { key: "tourism", value: "motel" },
    hostel: { key: "tourism", value: "hostel" },
    vandrarhem: { key: "tourism", value: "hostel" },
    "guest house": { key: "tourism", value: "guest_house" },
    pensionat: { key: "tourism", value: "guest_house" },
    camping: { key: "tourism", value: "camp_site" },
    campsite: { key: "tourism", value: "camp_site" },
    campingplats: { key: "tourism", value: "camp_site" },
    "caravan site": { key: "tourism", value: "caravan_site" },
    museum: { key: "tourism", value: "museum" },
    gallery: { key: "tourism", value: "gallery" },
    galleri: { key: "tourism", value: "gallery" },
    "art gallery": { key: "tourism", value: "gallery" },
    konstgalleri: { key: "tourism", value: "gallery" },
    zoo: { key: "tourism", value: "zoo" },
    djurpark: { key: "tourism", value: "zoo" },
    aquarium: { key: "tourism", value: "aquarium" },
    akvarium: { key: "tourism", value: "aquarium" },
    "theme park": { key: "tourism", value: "theme_park" },
    nöjespark: { key: "tourism", value: "theme_park" },
    viewpoint: { key: "tourism", value: "viewpoint" },
    utsiktspunkt: { key: "tourism", value: "viewpoint" },
    attraction: { key: "tourism", value: "attraction" },
    "tourist information": { key: "tourism", value: "information" },
    turistinformation: { key: "tourism", value: "information" },
    "picnic site": { key: "tourism", value: "picnic_site" },
    picknickplats: { key: "tourism", value: "picnic_site" },
    // ── Leisure & Recreation ──
    park: { key: "leisure", value: "park" },
    playground: { key: "leisure", value: "playground" },
    lekplats: { key: "leisure", value: "playground" },
    "swimming pool": { key: "leisure", value: "swimming_pool" },
    simhall: { key: "leisure", value: "swimming_pool" },
    gym: { key: "leisure", value: "fitness_centre" },
    fitness: { key: "leisure", value: "fitness_centre" },
    träningscenter: { key: "leisure", value: "fitness_centre" },
    "sports centre": { key: "leisure", value: "sports_centre" },
    sportcenter: { key: "leisure", value: "sports_centre" },
    stadium: { key: "leisure", value: "stadium" },
    stadion: { key: "leisure", value: "stadium" },
    "golf course": { key: "leisure", value: "golf_course" },
    golfbana: { key: "leisure", value: "golf_course" },
    "miniature golf": { key: "leisure", value: "miniature_golf" },
    minigolf: { key: "leisure", value: "miniature_golf" },
    "ice rink": { key: "leisure", value: "ice_rink" },
    ishall: { key: "leisure", value: "ice_rink" },
    marina: { key: "leisure", value: "marina" },
    båthamn: { key: "leisure", value: "marina" },
    "dog park": { key: "leisure", value: "dog_park" },
    hundpark: { key: "leisure", value: "dog_park" },
    "water park": { key: "leisure", value: "water_park" },
    vattenland: { key: "leisure", value: "water_park" },
    garden: { key: "leisure", value: "garden" },
    trädgård: { key: "leisure", value: "garden" },
    "nature reserve": { key: "leisure", value: "nature_reserve" },
    naturreservat: { key: "leisure", value: "nature_reserve" },
    sauna: { key: "leisure", value: "sauna" },
    bastu: { key: "leisure", value: "sauna" },
    // ── Culture & Entertainment ──
    theater: { key: "amenity", value: "theatre" },
    theatre: { key: "amenity", value: "theatre" },
    teater: { key: "amenity", value: "theatre" },
    cinema: { key: "amenity", value: "cinema" },
    bio: { key: "amenity", value: "cinema" },
    "movie theater": { key: "amenity", value: "cinema" },
    "arts centre": { key: "amenity", value: "arts_centre" },
    kulturhus: { key: "amenity", value: "arts_centre" },
    "concert hall": { key: "amenity", value: "music_venue" },
    konserthus: { key: "amenity", value: "music_venue" },
    "music venue": { key: "amenity", value: "music_venue" },
    "community centre": { key: "amenity", value: "community_centre" },
    planetarium: { key: "amenity", value: "planetarium" },
    // ── Services ──
    bank: { key: "amenity", value: "bank" },
    atm: { key: "amenity", value: "atm" },
    bankomat: { key: "amenity", value: "atm" },
    "post office": { key: "amenity", value: "post_office" },
    postkontor: { key: "amenity", value: "post_office" },
    police: { key: "amenity", value: "police" },
    polis: { key: "amenity", value: "police" },
    "fire station": { key: "amenity", value: "fire_station" },
    brandstation: { key: "amenity", value: "fire_station" },
    courthouse: { key: "amenity", value: "courthouse" },
    domstol: { key: "amenity", value: "courthouse" },
    "town hall": { key: "amenity", value: "townhall" },
    stadshus: { key: "amenity", value: "townhall" },
    embassy: { key: "office", value: "diplomatic" },
    ambassad: { key: "office", value: "diplomatic" },
    toilets: { key: "amenity", value: "toilets" },
    toalett: { key: "amenity", value: "toilets" },
    wc: { key: "amenity", value: "toilets" },
    "drinking water": { key: "amenity", value: "drinking_water" },
    dricksvatten: { key: "amenity", value: "drinking_water" },
    recycling: { key: "amenity", value: "recycling" },
    återvinning: { key: "amenity", value: "recycling" },
    // ── Religion ──
    church: { key: "amenity", value: "place_of_worship" },
    kyrka: { key: "amenity", value: "place_of_worship" },
    mosque: { key: "amenity", value: "place_of_worship" },
    moské: { key: "amenity", value: "place_of_worship" },
    synagogue: { key: "amenity", value: "place_of_worship" },
    synagoga: { key: "amenity", value: "place_of_worship" },
    temple: { key: "amenity", value: "place_of_worship" },
    tempel: { key: "amenity", value: "place_of_worship" },
    cathedral: { key: "amenity", value: "place_of_worship" },
    katedral: { key: "amenity", value: "place_of_worship" },
    // ── Nature ──
    beach: { key: "natural", value: "beach" },
    strand: { key: "natural", value: "beach" },
    waterfall: { key: "natural", value: "waterfall" },
    vattenfall: { key: "natural", value: "waterfall" },
    peak: { key: "natural", value: "peak" },
    bergstopp: { key: "natural", value: "peak" },
    mountain: { key: "natural", value: "peak" },
    berg: { key: "natural", value: "peak" },
    cave: { key: "natural", value: "cave_entrance" },
    grotta: { key: "natural", value: "cave_entrance" },
    "hot spring": { key: "natural", value: "hot_spring" },
    volcano: { key: "natural", value: "volcano" },
    vulkan: { key: "natural", value: "volcano" },
    glacier: { key: "natural", value: "glacier" },
    glaciär: { key: "natural", value: "glacier" },
    cliff: { key: "natural", value: "cliff" },
    klippa: { key: "natural", value: "cliff" },
    // ── Historic ──
    castle: { key: "historic", value: "castle" },
    slott: { key: "historic", value: "castle" },
    ruins: { key: "historic", value: "ruins" },
    ruiner: { key: "historic", value: "ruins" },
    monument: { key: "historic", value: "monument" },
    minnesmärke: { key: "historic", value: "monument" },
    memorial: { key: "historic", value: "memorial" },
    "archaeological site": { key: "historic", value: "archaeological_site" },
    fort: { key: "historic", value: "fort" },
    fästning: { key: "historic", value: "fort" },
    battlefield: { key: "historic", value: "battlefield" },
    slagfält: { key: "historic", value: "battlefield" },
    // ── Craft & Industry ──
    brewery: { key: "craft", value: "brewery" },
    bryggeri: { key: "craft", value: "brewery" },
    winery: { key: "craft", value: "winery" },
    vingård: { key: "craft", value: "winery" },
    distillery: { key: "craft", value: "distillery" },
    destilleri: { key: "craft", value: "distillery" },
    blacksmith: { key: "craft", value: "blacksmith" },
    smed: { key: "craft", value: "blacksmith" },
    pottery: { key: "craft", value: "pottery" },
    krukmakeri: { key: "craft", value: "pottery" },
    sawmill: { key: "craft", value: "sawmill" },
    sågverk: { key: "craft", value: "sawmill" },
    // ── Agriculture ──
    vineyard: { key: "landuse", value: "vineyard" },
    vinyard: { key: "landuse", value: "vineyard" },
    orchard: { key: "landuse", value: "orchard" },
    fruktodling: { key: "landuse", value: "orchard" },
    farm: { key: "landuse", value: "farmyard" },
    gård: { key: "landuse", value: "farmyard" },
    greenhouse: { key: "landuse", value: "greenhouse_horticulture" },
    växthus: { key: "landuse", value: "greenhouse_horticulture" },
    cemetery: { key: "landuse", value: "cemetery" },
    kyrkogård: { key: "landuse", value: "cemetery" },
    // ── Infrastructure ──
    "wind turbine": { key: "generator:source", value: "wind" },
    vindkraftverk: { key: "generator:source", value: "wind" },
    "solar panel": { key: "generator:source", value: "solar" },
    solcell: { key: "generator:source", value: "solar" },
    tower: { key: "man_made", value: "tower" },
    torn: { key: "man_made", value: "tower" },
    lighthouse: { key: "man_made", value: "lighthouse" },
    fyr: { key: "man_made", value: "lighthouse" },
    windmill: { key: "man_made", value: "windmill" },
    väderkvarn: { key: "man_made", value: "windmill" },
    "water tower": { key: "man_made", value: "water_tower" },
    vattentorn: { key: "man_made", value: "water_tower" },
    pier: { key: "man_made", value: "pier" },
    brygga: { key: "man_made", value: "pier" },
    // ── Sports ──
    "soccer field": { key: "sport", value: "soccer" },
    fotbollsplan: { key: "sport", value: "soccer" },
    "tennis court": { key: "sport", value: "tennis" },
    tennisbana: { key: "sport", value: "tennis" },
    "basketball court": { key: "sport", value: "basketball" },
    skateboard: { key: "sport", value: "skateboard" },
    skatepark: { key: "sport", value: "skateboard" },
    climbing: { key: "sport", value: "climbing" },
    klättring: { key: "sport", value: "climbing" },
  };

  // Sort longer keywords first so "library" is checked before "bar",
  // "parking" before "park", etc. Prevents short keywords from shadowing
  // longer, more specific ones.
  const sorted = Object.entries(MAPPINGS).sort(
    (a, b) => b[0].length - a[0].length,
  );

  for (const [keyword, tags] of sorted) {
    // Short keywords (≤4 chars) like "bar", "pub", "park" need strict
    // word-boundary matching to prevent "bar" → "Barcelona", "pub" → "public".
    // Longer keywords use a leading \b only. Keywords ending in "y" also
    // match their -ies plural (library→libraries, pharmacy→pharmacies).
    let re: RegExp;
    if (keyword.length <= 4) {
      re = new RegExp(`\\b${keyword}s?\\b`);
    } else if (keyword.endsWith("y")) {
      // Match "library" OR "libraries"
      const stem = keyword.slice(0, -1);
      re = new RegExp(`\\b(${keyword}|${stem}ies)\\b`);
    } else {
      re = new RegExp(`\\b${keyword}`);
    }
    if (re.test(lower)) {
      return { ...tags, bbox };
    }
  }

  return null;
}
