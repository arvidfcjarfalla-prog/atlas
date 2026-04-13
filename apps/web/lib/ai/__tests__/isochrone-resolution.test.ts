import { describe, expect, it } from "vitest";
import {
  applyResolvedOriginLabel,
  buildIsochroneDataUrl,
  parseIsochronePrompt,
  resolveKnownIsochroneOrigin,
} from "../isochrone-resolution";

describe("isochrone-resolution", () => {
  it("parses English airport isochrone prompts", () => {
    const parsed = parseIsochronePrompt(
      "Show 15 and 30 minute driving isochrones from Gothenburg airport.",
    );

    expect(parsed).toEqual({
      locationQuery: "Gothenburg airport",
      mode: "driving",
      breaks: [15, 30],
      unit: "minutes",
    });
  });

  it("parses Swedish station isochrone prompts", () => {
    const parsed = parseIsochronePrompt(
      "Hur långt når man från Malmö centralstation på 10, 20 och 30 minuter med cykel?",
    );

    expect(parsed).toEqual({
      locationQuery: "Malmö centralstation",
      mode: "cycling",
      breaks: [10, 20, 30],
      unit: "minutes",
    });
  });

  it("parses duration-plus-mode area phrasing", () => {
    const parsed = parseIsochronePrompt(
      "Show 15 minute driving areas from Gothenburg airport.",
    );

    expect(parsed).toEqual({
      locationQuery: "Gothenburg airport",
      mode: "driving",
      breaks: [15],
      unit: "minutes",
    });
  });

  it("parses short natural driving phrasing", () => {
    const parsed = parseIsochronePrompt(
      "15 min driving from Gothenburg airport",
    );

    expect(parsed).toEqual({
      locationQuery: "Gothenburg airport",
      mode: "driving",
      breaks: [15],
      unit: "minutes",
    });
  });

  it("parses reachable-area wording", () => {
    const parsed = parseIsochronePrompt(
      "Areas reachable within 15 minutes from Gothenburg airport.",
    );

    expect(parsed).toEqual({
      locationQuery: "Gothenburg airport",
      mode: "driving",
      breaks: [15],
      unit: "minutes",
    });
  });

  it("does not swallow POI-within-travel-time prompts as raw isochrones", () => {
    const parsed = parseIsochronePrompt(
      "Show all restaurants within 15 minutes driving from Gothenburg airport.",
    );

    expect(parsed).toBeNull();
  });

  it("ignores terminal numbers inside the origin when extracting breaks", () => {
    const parsed = parseIsochronePrompt(
      "Show 15 and 30 minute driving isochrones from Gothenburg airport terminal 2.",
    );

    expect(parsed).toEqual({
      locationQuery: "Gothenburg airport terminal 2",
      mode: "driving",
      breaks: [15, 30],
      unit: "minutes",
    });
  });

  it("ignores platform numbers inside the origin when extracting breaks", () => {
    const parsed = parseIsochronePrompt(
      "Hur långt når man från Platform 9 på 10 minuter till fots?",
    );

    expect(parsed).toEqual({
      locationQuery: "Platform 9",
      mode: "walking",
      breaks: [10],
      unit: "minutes",
    });
  });

  it("resolves known airport origins", () => {
    expect(resolveKnownIsochroneOrigin("Gothenburg airport")).toEqual({
      lat: 57.6628,
      lng: 12.2798,
      label: "Gothenburg Landvetter Airport (GOT), Sweden",
    });
  });

  it("builds a normalized isochrone URL", () => {
    const parsed = parseIsochronePrompt(
      "Show 15 and 30 minute driving isochrones from Gothenburg airport.",
    );

    expect(parsed).not.toBeNull();
    const origin = resolveKnownIsochroneOrigin(parsed!.locationQuery);

    expect(
      buildIsochroneDataUrl({
        ...parsed!,
        origin: origin!,
      }),
    ).toBe("/api/isochrone?origin=57.6628%2C12.2798&mode=driving&breaks=15%2C30");
  });

  it("upgrades the prompt with a resolved origin label", () => {
    expect(
      applyResolvedOriginLabel(
        "Show 15 and 30 minute driving isochrones from Gothenburg airport.",
        "Gothenburg airport",
        "Gothenburg Landvetter Airport (GOT), Sweden",
      ),
    ).toBe(
      "Show 15 and 30 minute driving isochrones from Gothenburg Landvetter Airport (GOT), Sweden.",
    );
  });
});
