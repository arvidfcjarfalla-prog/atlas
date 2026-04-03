import { describe, expect, it } from "vitest";
import { matchWorldBankCoreKeyword } from "../tools/worldbank-keywords";

describe("matchWorldBankCoreKeyword", () => {
  it("matches common GDP and population prompts", () => {
    expect(matchWorldBankCoreKeyword("GDP per capita in Europe")).toBe("NY.GDP.PCAP.CD");
    expect(matchWorldBankCoreKeyword("Visa befolkning per land")).toBe("SP.POP.TOTL");
  });

  it("prefers the longest keyword match for CO2 prompts", () => {
    expect(matchWorldBankCoreKeyword("co2 emissions per capita by country")).toBe("EN.GHG.CO2.PC.CE.AR5");
    expect(matchWorldBankCoreKeyword("co2 emissions by country")).toBe("EN.GHG.CO2.MT.CE.AR5");
  });

  it("returns null when no core keyword matches", () => {
    expect(matchWorldBankCoreKeyword("show me tuberculosis incidence")).toBeNull();
  });
});

