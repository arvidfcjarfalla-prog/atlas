/**
 * Shared World Bank keyword mapping used by both:
 * - data-search.ts (public data fast path)
 * - worldbank-client.ts (StatsApiAdapter path)
 *
 * Keep this as the single source of truth for common keyword -> indicator
 * resolution to reduce drift between the two active World Bank code paths.
 */
export const WORLD_BANK_CORE_KEYWORDS: Record<string, string> = {
  // GDP
  "gdp per capita": "NY.GDP.PCAP.CD",
  "bnp per capita": "NY.GDP.PCAP.CD",
  gdp: "NY.GDP.MKTP.CD",
  bnp: "NY.GDP.MKTP.CD",
  // Population
  population: "SP.POP.TOTL",
  befolkning: "SP.POP.TOTL",
  "population growth": "SP.POP.GROW",
  // Life expectancy
  "life expectancy": "SP.DYN.LE00.IN",
  livslängd: "SP.DYN.LE00.IN",
  medellivslängd: "SP.DYN.LE00.IN",
  // Unemployment
  unemployment: "SL.UEM.TOTL.ZS",
  arbetslöshet: "SL.UEM.TOTL.ZS",
  // Inflation
  inflation: "FP.CPI.TOTL.ZG",
  // Poverty
  poverty: "SI.POV.DDAY",
  fattigdom: "SI.POV.DDAY",
  // CO2 (AR5 indicators)
  "co2 emissions per capita": "EN.GHG.CO2.PC.CE.AR5",
  "co2 per capita": "EN.GHG.CO2.PC.CE.AR5",
  "co2 emissions": "EN.GHG.CO2.MT.CE.AR5",
  co2: "EN.GHG.CO2.MT.CE.AR5",
  koldioxid: "EN.GHG.CO2.MT.CE.AR5",
  // Fertility
  "fertility rate": "SP.DYN.TFRT.IN",
  fertilitet: "SP.DYN.TFRT.IN",
  // Mortality
  "infant mortality": "SP.DYN.IMRT.IN",
  spädbarnsdödlighet: "SP.DYN.IMRT.IN",
  // Education
  "literacy rate": "SE.ADT.LITR.ZS",
  literacy: "SE.ADT.LITR.ZS",
  // Health
  "healthcare spending": "SH.XPD.CHEX.GD.ZS",
  "health expenditure": "SH.XPD.CHEX.GD.ZS",
  // Trade
  exports: "NE.EXP.GNFS.ZS",
  imports: "NE.IMP.GNFS.ZS",
  // Energy
  "renewable energy": "EG.FEC.RNEW.ZS",
  "förnybar energi": "EG.FEC.RNEW.ZS",
  // Internet
  "internet users": "IT.NET.USER.ZS",
  "internet usage": "IT.NET.USER.ZS",
  // Gini
  gini: "SI.POV.GINI",
  ojämlikhet: "SI.POV.GINI",
  inequality: "SI.POV.GINI",
  // Foreign aid
  "foreign aid": "DT.ODA.ODAT.GN.ZS",
  bistånd: "DT.ODA.ODAT.GN.ZS",
  // Military
  "military spending": "MS.MIL.XPND.GD.ZS",
  militärutgifter: "MS.MIL.XPND.GD.ZS",
};

const WORLD_BANK_CORE_KEYWORD_ENTRIES = Object.entries(WORLD_BANK_CORE_KEYWORDS)
  .sort((a, b) => b[0].length - a[0].length);

/** Returns the best matching World Bank indicator code for a query, if any. */
export function matchWorldBankCoreKeyword(query: string): string | null {
  const lower = query.toLowerCase();
  for (const [keyword, code] of WORLD_BANK_CORE_KEYWORD_ENTRIES) {
    if (lower.includes(keyword)) return code;
  }
  return null;
}

