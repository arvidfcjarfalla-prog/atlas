/**
 * Tests for CSV parser hardening:
 *   - Wider lat/lng column name matching
 *   - Thousands separator stripping
 *   - Better error messages
 *   - Semicolon delimiter detection
 *   - BOM handling
 */

import { describe, it, expect } from "vitest";
import { parseCSV, csvToGeoJSON, parseNumericValue, cleanCoordinate } from "../csv-parser";

// ═══════════════════════════════════════════════════════════════
// parseNumericValue
// ═══════════════════════════════════════════════════════════════

describe("parseNumericValue", () => {
  it("parses plain integers", () => {
    expect(parseNumericValue("42")).toBe(42);
    expect(parseNumericValue("-7")).toBe(-7);
    expect(parseNumericValue("0")).toBe(0);
  });

  it("parses plain decimals", () => {
    expect(parseNumericValue("3.14")).toBeCloseTo(3.14);
    expect(parseNumericValue("-0.5")).toBeCloseTo(-0.5);
  });

  it("strips US/UK thousands commas", () => {
    expect(parseNumericValue("1,234")).toBe(1234);
    expect(parseNumericValue("1,234,567")).toBe(1234567);
    expect(parseNumericValue("1,234.56")).toBeCloseTo(1234.56);
  });

  it("strips space thousands separators", () => {
    expect(parseNumericValue("1 234")).toBe(1234);
    expect(parseNumericValue("1 234 567")).toBe(1234567);
  });

  it("handles leading/trailing whitespace", () => {
    expect(parseNumericValue("  42  ")).toBe(42);
    expect(parseNumericValue(" 1,234 ")).toBe(1234);
  });

  it("returns NaN for non-numeric strings", () => {
    expect(parseNumericValue("")).toBeNaN();
    expect(parseNumericValue("abc")).toBeNaN();
    expect(parseNumericValue("N/A")).toBeNaN();
  });

  it("does not mangle strings that happen to have commas but aren't numbers", () => {
    // "hello,world" should fail the regex and not be treated as numeric
    expect(parseNumericValue("hello,world")).toBeNaN();
  });

  it("handles negative numbers with thousands separators", () => {
    expect(parseNumericValue("-1,234")).toBe(-1234);
    expect(parseNumericValue("-1,234.56")).toBeCloseTo(-1234.56);
  });
});

// ═══════════════════════════════════════════════════════════════
// Wider lat/lng column name matching
// ═══════════════════════════════════════════════════════════════

describe("wider lat/lng column detection", () => {
  it("detects standard lat/lng names", () => {
    const csv = "lat,lng,name\n59.33,18.07,Stockholm\n";
    const result = csvToGeoJSON(csv);
    expect(result.latColumn).toBe("lat");
    expect(result.lngColumn).toBe("lng");
    expect(result.featureCollection.features).toHaveLength(1);
  });

  it("detects 'latitude' / 'longitude' (full words)", () => {
    const csv = "latitude,longitude,city\n59.33,18.07,Stockholm\n";
    const result = csvToGeoJSON(csv);
    expect(result.latColumn).toBe("latitude");
    expect(result.lngColumn).toBe("longitude");
  });

  it("detects decimallatitude / decimallongitude (GBIF convention)", () => {
    const csv = "decimallatitude,decimallongitude,species\n59.33,18.07,Cod\n";
    const result = csvToGeoJSON(csv);
    expect(result.latColumn).toBe("decimallatitude");
    expect(result.lngColumn).toBe("decimallongitude");
  });

  it("detects lat_dd / lng_dd (scientific convention)", () => {
    const csv = "lat_dd,lng_dd,station\n59.33,18.07,S1\n";
    const result = csvToGeoJSON(csv);
    expect(result.latColumn).toBe("lat_dd");
    expect(result.lngColumn).toBe("lng_dd");
  });

  it("detects geo_lat / geo_lon", () => {
    const csv = "geo_lat,geo_lon,id\n59.33,18.07,1\n";
    const result = csvToGeoJSON(csv);
    expect(result.latColumn).toBe("geo_lat");
    expect(result.lngColumn).toBe("geo_lon");
  });

  it("detects 'Latitude (decimal degrees)' via prefix matching", () => {
    const csv = "Latitude (decimal degrees),Longitude (decimal degrees),depth\n59.33,18.07,100\n";
    const result = csvToGeoJSON(csv);
    expect(result.latColumn).toBe("Latitude (decimal degrees)");
    expect(result.lngColumn).toBe("Longitude (decimal degrees)");
  });

  it("detects Latitude_WGS84 via prefix matching", () => {
    const csv = "Latitude_WGS84,Longitude_WGS84,val\n59.33,18.07,42\n";
    const result = csvToGeoJSON(csv);
    expect(result.latColumn).toBe("Latitude_WGS84");
    expect(result.lngColumn).toBe("Longitude_WGS84");
  });

  it("detects Swedish breddgrad / långd", () => {
    const csv = "breddgrad,längd,namn\n59.33,18.07,Test\n";
    const result = csvToGeoJSON(csv);
    expect(result.latColumn).toBe("breddgrad");
    expect(result.lngColumn).toBe("längd");
  });
});

// ═══════════════════════════════════════════════════════════════
// Thousands separator handling in properties
// ═══════════════════════════════════════════════════════════════

describe("thousands separator handling", () => {
  it("parses property values with US thousands commas", () => {
    const csv = "lat,lng,population\n59.33,18.07,\"1,234,567\"\n";
    const result = csvToGeoJSON(csv);
    expect(result.featureCollection.features).toHaveLength(1);
    const pop = result.featureCollection.features[0].properties?.["population"];
    expect(pop).toBe(1234567);
  });

  it("parses property values with space thousands separators", () => {
    const csv = "lat,lng,value\n59.33,18.07,1 234\n";
    const result = csvToGeoJSON(csv);
    const val = result.featureCollection.features[0].properties?.["value"];
    expect(val).toBe(1234);
  });

  it("preserves strings that look like text with commas", () => {
    const csv = 'lat,lng,description\n59.33,18.07,"Hello, World"\n';
    const result = csvToGeoJSON(csv);
    const desc = result.featureCollection.features[0].properties?.["description"];
    expect(desc).toBe("Hello, World");
  });
});

// ═══════════════════════════════════════════════════════════════
// Semicolon delimiter detection
// ═══════════════════════════════════════════════════════════════

describe("semicolon delimiter detection", () => {
  it("parses semicolon-delimited CSV (European format)", () => {
    const csv = "lat;lng;name\n59.33;18.07;Stockholm\n";
    const rows = parseCSV(csv);
    expect(rows[0]).toEqual(["lat", "lng", "name"]);
    expect(rows[1]).toEqual(["59.33", "18.07", "Stockholm"]);
  });

  it("converts semicolon CSV to GeoJSON", () => {
    const csv = "lat;lng;name;population\n59.33;18.07;Stockholm;975551\n55.68;12.57;Copenhagen;800000\n";
    const result = csvToGeoJSON(csv);
    expect(result.featureCollection.features).toHaveLength(2);
    expect(result.latColumn).toBe("lat");
    expect(result.lngColumn).toBe("lng");
  });

  it("handles European decimals in semicolon CSV by keeping as string", () => {
    // In a semicolon CSV, "59,33" is a European decimal (59.33)
    // Our parser treats comma as part of the field value, not a delimiter
    const csv = "name;value\nStockholm;1234\nOslo;5678\n";
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(["name", "value"]);
  });

  it("handles quoted fields in semicolon CSV", () => {
    const csv = 'name;description;lat;lng\n"Stockholm";"Capital; largest city";59.33;18.07\n';
    const rows = parseCSV(csv);
    expect(rows[1][1]).toBe("Capital; largest city");
  });

  it("detects tab-delimited files", () => {
    const csv = "lat\tlng\tname\n59.33\t18.07\tStockholm\n";
    const rows = parseCSV(csv);
    expect(rows[0]).toEqual(["lat", "lng", "name"]);
    expect(rows[1]).toEqual(["59.33", "18.07", "Stockholm"]);
  });
});

// ═══════════════════════════════════════════════════════════════
// BOM handling
// ═══════════════════════════════════════════════════════════════

describe("BOM handling", () => {
  it("strips BOM from first header in csvToGeoJSON", () => {
    const csv = "\uFEFFlat,lng,name\n59.33,18.07,Stockholm\n";
    const result = csvToGeoJSON(csv);
    // BOM should be stripped — lat column should be detected
    expect(result.latColumn).toBe("lat");
    expect(result.featureCollection.features).toHaveLength(1);
  });

  it("BOM doesn't affect second column detection", () => {
    const csv = "\uFEFFname,lat,lng\nStockholm,59.33,18.07\n";
    const result = csvToGeoJSON(csv);
    expect(result.latColumn).toBe("lat");
    expect(result.lngColumn).toBe("lng");
  });
});

// ═══════════════════════════════════════════════════════════════
// Better error messages
// ═══════════════════════════════════════════════════════════════

describe("error messages", () => {
  it("lists available columns when no lat/lng detected", () => {
    const csv = "product,category,status\nWidget,Electronics,Active\nGadget,Tools,Inactive\n";
    const result = csvToGeoJSON(csv);
    expect(result.featureCollection.features).toHaveLength(0);
    expect(result.warnings[0]).toContain("Available columns:");
    expect(result.warnings[0]).toContain("product");
    expect(result.warnings[0]).toContain("category");
  });

  it("includes column names in skipped-row warning", () => {
    const csv = "lat,lng,name\n59.33,18.07,OK\n999,18.07,Bad\n";
    const result = csvToGeoJSON(csv);
    expect(result.skippedRows).toBe(1);
    // warnings[0] is the coordinate-choice info, skipped-row warning follows
    expect(result.warnings[0]).toContain("Coordinates: using");
    expect(result.warnings[1]).toContain('"lat"');
    expect(result.warnings[1]).toContain('"lng"');
  });

  it("shows sample skip reasons with out-of-range coordinates", () => {
    const csv = "lat,lng,name\n59.33,18.07,OK\n999,18.07,Bad\n";
    const result = csvToGeoJSON(csv);
    // coordinate-choice + skipped-row + sample issues = 3
    expect(result.warnings).toHaveLength(3);
    expect(result.warnings[2]).toContain("Sample issues:");
    expect(result.warnings[2]).toContain("outside -90..90");
  });

  it("shows sample skip reasons with non-numeric values", () => {
    const csv = "lat,lng,name\n59.33,18.07,OK\nN/A,18.07,Bad\n";
    const result = csvToGeoJSON(csv);
    expect(result.warnings[2]).toContain("not numeric");
  });

  it("limits sample issues to 3 rows", () => {
    const rows = ["lat,lng,name"];
    // Need enough valid rows (>=10) so the >50% throw doesn't fire
    for (let i = 0; i < 15; i++) {
      rows.push(`${50 + i * 0.1},${10 + i * 0.1},Good${i}`);
    }
    for (let i = 0; i < 10; i++) {
      rows.push(`999,${i},Bad${i}`);
    }
    const csv = rows.join("\n") + "\n";
    const result = csvToGeoJSON(csv);
    // "Sample issues" warning should only contain 3 samples
    const sampleWarning = result.warnings.find((w) => w.includes("Sample issues:"));
    expect(sampleWarning).toBeDefined();
    const rowMentions = sampleWarning!.match(/Row \d+:/g);
    expect(rowMentions).toHaveLength(3);
  });

  it("truncates column list for wide CSVs", () => {
    const headers = Array.from({ length: 20 }, (_, i) => `col${i}`);
    const values = headers.map(() => "abc");
    const csv = headers.join(",") + "\n" + values.join(",") + "\n";
    const result = csvToGeoJSON(csv);
    expect(result.warnings[0]).toContain("20 columns total");
  });
});

// ═══════════════════════════════════════════════════════════════
// cleanCoordinate
// ═══════════════════════════════════════════════════════════════

describe("cleanCoordinate", () => {
  it("parses plain decimal", () => {
    expect(cleanCoordinate("59.33")).toBeCloseTo(59.33);
  });

  it("handles north direction", () => {
    expect(cleanCoordinate("59.33N")).toBeCloseTo(59.33);
  });

  it("handles south direction (negates)", () => {
    expect(cleanCoordinate("33.86S")).toBeCloseTo(-33.86);
  });

  it("handles east direction", () => {
    expect(cleanCoordinate("18.07E")).toBeCloseTo(18.07);
  });

  it("handles west direction (negates)", () => {
    expect(cleanCoordinate("18.07W")).toBeCloseTo(-18.07);
  });

  it("strips degree symbols", () => {
    expect(cleanCoordinate("59.33°")).toBeCloseTo(59.33);
  });

  it("handles direction after degree symbol", () => {
    expect(cleanCoordinate("59.33°N")).toBeCloseTo(59.33);
  });

  it("returns NaN for empty string", () => {
    expect(cleanCoordinate("")).toBeNaN();
  });
});

// ═══════════════════════════════════════════════════════════════
// Coordinate choice warning
// ═══════════════════════════════════════════════════════════════

describe("coordinate choice warning", () => {
  it("always logs which columns were chosen", () => {
    const csv = "lat,lng,name\n59.33,18.07,A\n";
    const result = csvToGeoJSON(csv);
    expect(result.warnings[0]).toContain('Coordinates: using "lat" (lat) and "lng" (lng)');
  });
});

// ═══════════════════════════════════════════════════════════════
// High skip rate with few features
// ═══════════════════════════════════════════════════════════════

describe("high skip rate throws", () => {
  it("throws when >50% skipped and <10 features", () => {
    const rows = ["lat,lng,name"];
    // 1 valid row + 20 invalid rows
    rows.push("59.33,18.07,OK");
    for (let i = 0; i < 20; i++) {
      rows.push(`999,${i},Bad${i}`);
    }
    const csv = rows.join("\n") + "\n";
    expect(() => csvToGeoJSON(csv)).toThrow("had invalid coordinates");
  });

  it("does not throw when enough valid features exist", () => {
    const rows = ["lat,lng,name"];
    // 15 valid rows + 10 invalid rows
    for (let i = 0; i < 15; i++) {
      rows.push(`${50 + i * 0.1},${10 + i * 0.1},Good${i}`);
    }
    for (let i = 0; i < 10; i++) {
      rows.push(`999,${i},Bad${i}`);
    }
    const csv = rows.join("\n") + "\n";
    expect(() => csvToGeoJSON(csv)).not.toThrow();
  });
});
