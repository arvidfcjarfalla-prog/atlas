import { describe, it, expect } from "vitest";
import {
  parseCSV,
  detectLatLngColumns,
  detectCountryColumn,
  csvToPointFeatures,
} from "../tools/web-dataset-search";

describe("parseCSV", () => {
  it("parses comma-separated CSV", () => {
    const text = "name,value\nAlice,10\nBob,20";
    const rows = parseCSV(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "Alice", value: "10" });
    expect(rows[1]).toEqual({ name: "Bob", value: "20" });
  });

  it("parses semicolon-separated CSV", () => {
    const text = "name;value\nAlice;10\nBob;20";
    const rows = parseCSV(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "Alice", value: "10" });
  });

  it("parses tab-separated CSV", () => {
    const text = "name\tvalue\nAlice\t10\nBob\t20";
    const rows = parseCSV(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "Alice", value: "10" });
  });

  it("handles quoted fields with commas", () => {
    const text = 'name,value\n"Smith, John",10\nBob,20';
    const rows = parseCSV(text);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("Smith, John");
  });

  it("handles escaped quotes", () => {
    const text = 'name,value\n"She said ""hello""",10';
    const rows = parseCSV(text);
    expect(rows[0].name).toBe('She said "hello"');
  });

  it("handles empty input", () => {
    expect(parseCSV("")).toHaveLength(0);
    expect(parseCSV("header_only")).toHaveLength(0);
  });

  it("skips blank lines", () => {
    const text = "name,value\n\nAlice,10\n\nBob,20\n";
    const rows = parseCSV(text);
    expect(rows).toHaveLength(2);
  });
});

describe("detectLatLngColumns", () => {
  it("detects lat/lng", () => {
    const result = detectLatLngColumns(["name", "lat", "lng"]);
    expect(result).toEqual({ lat: "lat", lng: "lng" });
  });

  it("detects latitude/longitude", () => {
    const result = detectLatLngColumns(["id", "latitude", "longitude"]);
    expect(result).toEqual({ lat: "latitude", lng: "longitude" });
  });

  it("detects x/y (case insensitive via lowercase headers)", () => {
    const result = detectLatLngColumns(["id", "Y", "X"]);
    // Y and X are uppercase, but detection works on lowercase
    expect(result).toEqual({ lat: "Y", lng: "X" });
  });

  it("returns null when no lat column", () => {
    const result = detectLatLngColumns(["name", "value", "lng"]);
    expect(result).toBeNull();
  });

  it("returns null when no lng column", () => {
    const result = detectLatLngColumns(["name", "lat", "value"]);
    expect(result).toBeNull();
  });

  it("returns null for empty headers", () => {
    expect(detectLatLngColumns([])).toBeNull();
  });
});

describe("detectCountryColumn", () => {
  it("detects iso3 column", () => {
    const result = detectCountryColumn(["name", "iso3", "value"]);
    expect(result).toEqual({ column: "iso3", type: "iso3" });
  });

  it("detects iso_a3 column", () => {
    const result = detectCountryColumn(["name", "iso_a3", "value"]);
    expect(result).toEqual({ column: "iso_a3", type: "iso3" });
  });

  it("detects iso2 column", () => {
    const result = detectCountryColumn(["name", "iso2", "value"]);
    expect(result).toEqual({ column: "iso2", type: "iso2" });
  });

  it("detects country_name column", () => {
    const result = detectCountryColumn(["country_name", "value"]);
    expect(result).toEqual({ column: "country_name", type: "name" });
  });

  it("prefers iso3 over iso2 over name", () => {
    const result = detectCountryColumn(["country", "iso2", "iso3", "value"]);
    expect(result?.type).toBe("iso3");
  });

  it("returns null for non-country headers", () => {
    expect(detectCountryColumn(["name", "value", "date"])).toBeNull();
  });
});

describe("csvToPointFeatures", () => {
  it("converts rows to point features", () => {
    const rows = [
      { name: "Stockholm", lat: "59.33", lng: "18.07", pop: "1000000" },
      { name: "Oslo", lat: "59.91", lng: "10.75", pop: "700000" },
    ];
    const fc = csvToPointFeatures(rows, "lat", "lng");
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].geometry).toEqual({
      type: "Point",
      coordinates: [18.07, 59.33],
    });
    expect(fc.features[0].properties).toEqual({
      name: "Stockholm",
      pop: 1000000, // Converted to number
    });
  });

  it("skips rows with invalid coordinates", () => {
    const rows = [
      { name: "Valid", lat: "59.33", lng: "18.07" },
      { name: "NaN", lat: "abc", lng: "18.07" },
      { name: "OutOfRange", lat: "200", lng: "18.07" },
    ];
    const fc = csvToPointFeatures(rows, "lat", "lng");
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties!.name).toBe("Valid");
  });

  it("excludes lat/lng from properties", () => {
    const rows = [
      { name: "Test", lat: "10", lng: "20" },
    ];
    const fc = csvToPointFeatures(rows, "lat", "lng");
    expect(fc.features[0].properties).not.toHaveProperty("lat");
    expect(fc.features[0].properties).not.toHaveProperty("lng");
  });

  it("handles empty rows", () => {
    const fc = csvToPointFeatures([], "lat", "lng");
    expect(fc.features).toHaveLength(0);
  });

  it("keeps string values as strings", () => {
    const rows = [
      { name: "Test", lat: "10", lng: "20", status: "active" },
    ];
    const fc = csvToPointFeatures(rows, "lat", "lng");
    expect(fc.features[0].properties!.status).toBe("active");
  });
});
