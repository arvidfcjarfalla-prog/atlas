import { describe, it, expect, beforeEach } from "vitest";
import { extractIntent, buildSearchQuery } from "../tools/dataset-registry";

describe("extractIntent", () => {
  it("extracts topic from simple prompt", () => {
    const intent = extractIntent("shipping routes");
    expect(intent.topic).toContain("shipping");
    expect(intent.metric).toBe("routes");
  });

  it("extracts geography keyword", () => {
    const intent = extractIntent("Show global shipping routes");
    expect(intent.geography).toBe("global");
  });

  it("extracts Europe geography", () => {
    const intent = extractIntent("poverty rate in Europe");
    expect(intent.geography).toBe("europe");
    expect(intent.metric).toBe("poverty");
  });

  it("extracts US geography", () => {
    const intent = extractIntent("US state unemployment rates");
    expect(intent.geography).toBe("US");
    expect(intent.metric).toBe("unemployment");
  });

  it("extracts timeframe from year", () => {
    const intent = extractIntent("CO2 emissions 2023");
    expect(intent.timeframe).toBe("2023");
  });

  it("handles prompt with no geography", () => {
    const intent = extractIntent("deforestation");
    expect(intent.topic).toContain("deforestation");
    expect(intent.geography).toBeUndefined();
  });

  it("filters stop words from topic", () => {
    const intent = extractIntent("Show me a map of earthquakes");
    expect(intent.topic).not.toContain("show");
    expect(intent.topic).not.toContain("me");
    expect(intent.topic).not.toContain("map");
    expect(intent.topic).toContain("earthquakes");
  });
});

describe("buildSearchQuery", () => {
  it("combines intent fields into search string", () => {
    const query = buildSearchQuery({
      topic: "shipping routes",
      geography: "global",
    });
    expect(query).toContain("global");
    expect(query).toContain("shipping routes");
    expect(query).toContain("dataset");
  });

  it("includes metric when present", () => {
    const query = buildSearchQuery({
      topic: "poverty",
      metric: "rate",
      geography: "US",
    });
    expect(query).toContain("US");
    expect(query).toContain("poverty");
    expect(query).toContain("rate");
  });

  it("works with topic only", () => {
    const query = buildSearchQuery({ topic: "earthquakes" });
    expect(query).toContain("earthquakes");
    expect(query).toContain("dataset");
  });
});
