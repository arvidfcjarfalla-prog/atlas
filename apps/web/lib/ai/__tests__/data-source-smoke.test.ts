import { describe, it, expect } from "vitest";
import { resolveAmenityQuery } from "../tools/overpass";

/**
 * Smoke tests for data source integration.
 *
 * Tests that require external APIs (Eurostat, Data Commons, World Bank)
 * are in separate describe blocks and will be tested manually via curl.
 * Only pure-function tests (no network calls) run here.
 */

describe("Overpass amenity resolution", () => {
  const bbox: [number, number, number, number] = [59.2, 17.8, 59.45, 18.3];

  it("resolves 'restaurant' to amenity", () => {
    const q = resolveAmenityQuery("restaurant", bbox);
    expect(q).not.toBeNull();
    expect(q!.key).toBe("amenity");
    expect(q!.value).toBe("restaurant");
  });

  it("resolves Swedish 'restaurang'", () => {
    const q = resolveAmenityQuery("restaurang", bbox);
    expect(q).not.toBeNull();
    expect(q!.value).toBe("restaurant");
  });

  it("resolves 'hotel' to tourism", () => {
    const q = resolveAmenityQuery("hotel", bbox);
    expect(q).not.toBeNull();
    expect(q!.key).toBe("tourism");
    expect(q!.value).toBe("hotel");
  });

  it("resolves Swedish 'hotell' to tourism", () => {
    const q = resolveAmenityQuery("hotell", bbox);
    expect(q).not.toBeNull();
    expect(q!.value).toBe("hotel");
  });

  it("resolves 'museum' to tourism", () => {
    const q = resolveAmenityQuery("museum", bbox);
    expect(q).not.toBeNull();
    expect(q!.key).toBe("tourism");
    expect(q!.value).toBe("museum");
  });

  it("resolves 'pharmacy' to amenity", () => {
    const q = resolveAmenityQuery("pharmacy", bbox);
    expect(q).not.toBeNull();
    expect(q!.key).toBe("amenity");
    expect(q!.value).toBe("pharmacy");
  });

  it("resolves Swedish 'apotek'", () => {
    const q = resolveAmenityQuery("apotek", bbox);
    expect(q).not.toBeNull();
    expect(q!.value).toBe("pharmacy");
  });

  it("resolves 'airport' to aeroway", () => {
    const q = resolveAmenityQuery("airport", bbox);
    expect(q).not.toBeNull();
    expect(q!.key).toBe("aeroway");
    expect(q!.value).toBe("aerodrome");
  });

  it("returns null for unknown amenity", () => {
    const q = resolveAmenityQuery("spaceship", bbox);
    expect(q).toBeNull();
  });

  it("resolves multi-word prompts containing amenity", () => {
    const q = resolveAmenityQuery("Show me all restaurants nearby", bbox);
    expect(q).not.toBeNull();
    expect(q!.value).toBe("restaurant");
  });
});
