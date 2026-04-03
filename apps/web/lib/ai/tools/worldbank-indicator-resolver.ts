import { generateText } from "ai";
import { MODELS } from "../ai-client";
import { matchWorldBankCoreKeyword } from "./worldbank-keywords";

export interface WorldBankIndicator {
  code: string;
  label: string;
  unit: string;
}

/** Curated World Bank indicators used by both active World Bank code paths. */
export const WORLD_BANK_INDICATORS: Record<string, WorldBankIndicator> = {
  // Population & demographics
  population: { code: "SP.POP.TOTL", label: "Total Population", unit: "people" },
  befolkning: { code: "SP.POP.TOTL", label: "Total Population", unit: "people" },
  "population growth": { code: "SP.POP.GROW", label: "Population Growth Rate", unit: "% annual" },
  befolkningstillväxt: { code: "SP.POP.GROW", label: "Population Growth Rate", unit: "% annual" },
  "population density": { code: "EN.POP.DNST", label: "Population Density", unit: "people per sq. km" },
  befolkningstäthet: { code: "EN.POP.DNST", label: "Population Density", unit: "people per sq. km" },
  "urban population": { code: "SP.URB.TOTL.IN.ZS", label: "Urban Population", unit: "% of total" },
  "birth rate": { code: "SP.DYN.CBRT.IN", label: "Birth Rate", unit: "per 1,000 people" },
  födelsetal: { code: "SP.DYN.CBRT.IN", label: "Birth Rate", unit: "per 1,000 people" },
  "death rate": { code: "SP.DYN.CDRT.IN", label: "Crude Death Rate", unit: "per 1,000 people" },
  dödstal: { code: "SP.DYN.CDRT.IN", label: "Crude Death Rate", unit: "per 1,000 people" },
  fertility: { code: "SP.DYN.TFRT.IN", label: "Fertility Rate", unit: "births per woman" },
  fertilitet: { code: "SP.DYN.TFRT.IN", label: "Fertility Rate", unit: "births per woman" },
  refugee: { code: "SM.POP.REFG", label: "Refugee Population", unit: "people" },
  flyktingar: { code: "SM.POP.REFG", label: "Refugee Population", unit: "people" },
  migration: { code: "SM.POP.NETM", label: "Net Migration", unit: "people" },

  // Economy
  gdp: { code: "NY.GDP.MKTP.CD", label: "GDP (current US$)", unit: "USD" },
  bnp: { code: "NY.GDP.MKTP.CD", label: "GDP (current US$)", unit: "USD" },
  "gdp per capita": { code: "NY.GDP.PCAP.CD", label: "GDP per capita (current US$)", unit: "USD" },
  "bnp per capita": { code: "NY.GDP.PCAP.CD", label: "GDP per capita (current US$)", unit: "USD" },
  unemployment: { code: "SL.UEM.TOTL.ZS", label: "Unemployment Rate", unit: "%" },
  arbetslöshet: { code: "SL.UEM.TOTL.ZS", label: "Unemployment Rate", unit: "%" },
  inflation: { code: "FP.CPI.TOTL.ZG", label: "Inflation (Consumer Prices)", unit: "% annual" },
  poverty: { code: "SI.POV.DDAY", label: "Poverty Headcount ($2.15/day)", unit: "% of population" },
  fattigdom: { code: "SI.POV.DDAY", label: "Poverty Headcount ($2.15/day)", unit: "% of population" },
  gini: { code: "SI.POV.GINI", label: "Gini Index", unit: "index" },
  inequality: { code: "SI.POV.GINI", label: "Gini Index", unit: "index" },
  ojämlikhet: { code: "SI.POV.GINI", label: "Gini Index", unit: "index" },
  trade: { code: "NE.TRD.GNFS.ZS", label: "Trade (% of GDP)", unit: "% of GDP" },
  handel: { code: "NE.TRD.GNFS.ZS", label: "Trade (% of GDP)", unit: "% of GDP" },

  // Health
  "life expectancy": { code: "SP.DYN.LE00.IN", label: "Life Expectancy at Birth", unit: "years" },
  livslängd: { code: "SP.DYN.LE00.IN", label: "Life Expectancy at Birth", unit: "years" },
  medellivslängd: { code: "SP.DYN.LE00.IN", label: "Life Expectancy at Birth", unit: "years" },
  "infant mortality": { code: "SP.DYN.IMRT.IN", label: "Infant Mortality Rate", unit: "per 1,000 live births" },
  spädbarnsdödlighet: { code: "SP.DYN.IMRT.IN", label: "Infant Mortality Rate", unit: "per 1,000 live births" },
  "child mortality": { code: "SH.DYN.MORT", label: "Under-5 Mortality Rate", unit: "per 1,000 live births" },
  barnmortalitet: { code: "SH.DYN.MORT", label: "Under-5 Mortality Rate", unit: "per 1,000 live births" },
  "maternal mortality": { code: "SH.STA.MMRT", label: "Maternal Mortality Ratio", unit: "per 100,000 live births" },
  mödradödlighet: { code: "SH.STA.MMRT", label: "Maternal Mortality Ratio", unit: "per 100,000 live births" },
  "healthcare spending": { code: "SH.XPD.CHEX.GD.ZS", label: "Healthcare Expenditure (% of GDP)", unit: "% of GDP" },
  sjukvårdskostnad: { code: "SH.XPD.CHEX.GD.ZS", label: "Healthcare Expenditure (% of GDP)", unit: "% of GDP" },

  // Education
  literacy: { code: "SE.ADT.LITR.ZS", label: "Literacy Rate", unit: "%" },
  "education spending": { code: "SE.XPD.TOTL.GD.ZS", label: "Education Expenditure (% of GDP)", unit: "% of GDP" },
  utbildningskostnad: { code: "SE.XPD.TOTL.GD.ZS", label: "Education Expenditure (% of GDP)", unit: "% of GDP" },
  "school enrollment": { code: "SE.PRM.ENRR", label: "Primary School Enrollment", unit: "% gross" },

  // Military
  "military spending": { code: "MS.MIL.XPND.GD.ZS", label: "Military Expenditure (% of GDP)", unit: "% of GDP" },
  militärutgifter: { code: "MS.MIL.XPND.GD.ZS", label: "Military Expenditure (% of GDP)", unit: "% of GDP" },
  "military expenditure": { code: "MS.MIL.XPND.GD.ZS", label: "Military Expenditure (% of GDP)", unit: "% of GDP" },

  // Environment
  co2: { code: "EN.GHG.CO2.MT.CE.AR5", label: "CO2 Emissions (Mt CO2e, excl. LULUCF)", unit: "Mt CO2e" },
  "co2 emissions": { code: "EN.GHG.CO2.MT.CE.AR5", label: "CO2 Emissions (Mt CO2e, excl. LULUCF)", unit: "Mt CO2e" },
  "co2 per capita": { code: "EN.GHG.CO2.PC.CE.AR5", label: "CO2 Emissions Per Capita", unit: "metric tons CO2e" },
  "renewable energy": { code: "EG.FEC.RNEW.ZS", label: "Renewable Energy Consumption", unit: "% of total" },
  "förnybar energi": { code: "EG.FEC.RNEW.ZS", label: "Renewable Energy Consumption", unit: "% of total" },
  "forest area": { code: "AG.LND.FRST.ZS", label: "Forest Area", unit: "% of land area" },
  skogsareal: { code: "AG.LND.FRST.ZS", label: "Forest Area", unit: "% of land area" },
  skogsyta: { code: "AG.LND.FRST.ZS", label: "Forest Area", unit: "% of land area" },
  "access to electricity": { code: "EG.ELC.ACCS.ZS", label: "Access to Electricity", unit: "% of population" },
  "clean water": { code: "SH.H2O.SMDW.ZS", label: "Access to Clean Water", unit: "% of population" },
  "drinking water": { code: "SH.H2O.SMDW.ZS", label: "Access to Clean Water", unit: "% of population" },
  sanitation: { code: "SH.STA.SMSS.ZS", label: "Access to Sanitation", unit: "% of population" },
  "air pollution": { code: "EN.ATM.PM25.MC.M3", label: "PM2.5 Air Pollution", unit: "µg/m³" },
  luftföroreningar: { code: "EN.ATM.PM25.MC.M3", label: "PM2.5 Air Pollution", unit: "µg/m³" },

  // Technology
  "internet users": { code: "IT.NET.USER.ZS", label: "Internet Users", unit: "% of population" },
  internet: { code: "IT.NET.USER.ZS", label: "Internet Users", unit: "% of population" },
  "mobile phone": { code: "IT.CEL.SETS.P2", label: "Mobile Phone Subscriptions", unit: "per 100 people" },
  mobiltelefon: { code: "IT.CEL.SETS.P2", label: "Mobile Phone Subscriptions", unit: "per 100 people" },

  // Composite indexes
  hdi: { code: "HD.HCI.OVRL", label: "Human Capital Index", unit: "index" },

  // Water & sanitation
  "water stress": { code: "ER.H2O.FWST.ZS", label: "Water Stress", unit: "% of renewable resources" },
  vattenstress: { code: "ER.H2O.FWST.ZS", label: "Water Stress", unit: "% of renewable resources" },
  "water withdrawal": { code: "ER.H2O.FWTL.ZS", label: "Annual Freshwater Withdrawals", unit: "% of internal resources" },

  // Energy
  "energy use": { code: "EG.USE.PCAP.KG.OE", label: "Energy Use Per Capita", unit: "kg of oil equivalent" },
  energianvändning: { code: "EG.USE.PCAP.KG.OE", label: "Energy Use Per Capita", unit: "kg of oil equivalent" },
  "electric power": { code: "EG.USE.ELEC.KH.PC", label: "Electric Power Consumption Per Capita", unit: "kWh" },
  "electricity consumption": { code: "EG.USE.ELEC.KH.PC", label: "Electric Power Consumption Per Capita", unit: "kWh" },
  elanvändning: { code: "EG.USE.ELEC.KH.PC", label: "Electric Power Consumption Per Capita", unit: "kWh" },
  "fossil fuel": { code: "EG.USE.COMM.FO.ZS", label: "Fossil Fuel Energy Consumption", unit: "% of total" },
  "nuclear energy": { code: "EG.ELC.NUCL.ZS", label: "Nuclear Energy (% of electricity)", unit: "%" },
  kärnkraft: { code: "EG.ELC.NUCL.ZS", label: "Nuclear Energy (% of electricity)", unit: "%" },

  // Agriculture
  "arable land": { code: "AG.LND.ARBL.ZS", label: "Arable Land", unit: "% of land area" },
  åkermark: { code: "AG.LND.ARBL.ZS", label: "Arable Land", unit: "% of land area" },
  "agricultural land": { code: "AG.LND.AGRI.ZS", label: "Agricultural Land", unit: "% of land area" },
  jordbruksmark: { code: "AG.LND.AGRI.ZS", label: "Agricultural Land", unit: "% of land area" },
  "cereal yield": { code: "AG.YLD.CREL.KG", label: "Cereal Yield", unit: "kg per hectare" },
  "food production": { code: "AG.PRD.FOOD.XD", label: "Food Production Index", unit: "index (2014-2016=100)" },
  livsmedelsproduktion: { code: "AG.PRD.FOOD.XD", label: "Food Production Index", unit: "index (2014-2016=100)" },

  // Health (extended)
  vaccination: { code: "SH.IMM.MEAS", label: "Measles Immunization", unit: "% of children (12-23 months)" },
  immunization: { code: "SH.IMM.MEAS", label: "Measles Immunization", unit: "% of children (12-23 months)" },
  vaccinering: { code: "SH.IMM.MEAS", label: "Measles Immunization", unit: "% of children (12-23 months)" },
  "hospital beds": { code: "SH.MED.BEDS.ZS", label: "Hospital Beds", unit: "per 1,000 people" },
  sjukhussängar: { code: "SH.MED.BEDS.ZS", label: "Hospital Beds", unit: "per 1,000 people" },
  physicians: { code: "SH.MED.PHYS.ZS", label: "Physicians", unit: "per 1,000 people" },
  läkartäthet: { code: "SH.MED.PHYS.ZS", label: "Physicians", unit: "per 1,000 people" },
  nurses: { code: "SH.MED.NUMW.P3", label: "Nurses and Midwives", unit: "per 1,000 people" },
  tuberculosis: { code: "SH.TBS.INCD", label: "Tuberculosis Incidence", unit: "per 100,000 people" },
  tuberkulos: { code: "SH.TBS.INCD", label: "Tuberculosis Incidence", unit: "per 100,000 people" },
  hiv: { code: "SH.DYN.AIDS.ZS", label: "HIV Prevalence", unit: "% of population (15-49)" },
  malaria: { code: "SH.STA.MALR", label: "Malaria Incidence", unit: "per 1,000 at-risk population" },
  obesity: { code: "SH.STA.OWAD.ZS", label: "Obesity Prevalence", unit: "% of adults" },
  fetma: { code: "SH.STA.OWAD.ZS", label: "Obesity Prevalence", unit: "% of adults" },
  smoking: { code: "SH.PRV.SMOK", label: "Smoking Prevalence", unit: "% of adults" },
  rökning: { code: "SH.PRV.SMOK", label: "Smoking Prevalence", unit: "% of adults" },
  suicide: { code: "SH.STA.SUIC.P5", label: "Suicide Mortality Rate", unit: "per 100,000 population" },
  självmord: { code: "SH.STA.SUIC.P5", label: "Suicide Mortality Rate", unit: "per 100,000 population" },

  // Education (extended)
  "secondary enrollment": { code: "SE.SEC.ENRR", label: "Secondary School Enrollment", unit: "% gross" },
  "tertiary enrollment": { code: "SE.TER.ENRR", label: "Tertiary Education Enrollment", unit: "% gross" },
  "research spending": { code: "GB.XPD.RSDV.GD.ZS", label: "R&D Expenditure", unit: "% of GDP" },
  "r&d spending": { code: "GB.XPD.RSDV.GD.ZS", label: "R&D Expenditure", unit: "% of GDP" },
  "r&d": { code: "GB.XPD.RSDV.GD.ZS", label: "R&D Expenditure", unit: "% of GDP" },
  "r&d expenditure": { code: "GB.XPD.RSDV.GD.ZS", label: "R&D Expenditure", unit: "% of GDP" },
  "research and development": { code: "GB.XPD.RSDV.GD.ZS", label: "R&D Expenditure", unit: "% of GDP" },
  forskning: { code: "GB.XPD.RSDV.GD.ZS", label: "R&D Expenditure", unit: "% of GDP" },
  forskningsutgifter: { code: "GB.XPD.RSDV.GD.ZS", label: "R&D Expenditure", unit: "% of GDP" },

  // Economy (extended)
  "gdp growth": { code: "NY.GDP.MKTP.KD.ZG", label: "GDP Growth Rate", unit: "% annual" },
  "bnp-tillväxt": { code: "NY.GDP.MKTP.KD.ZG", label: "GDP Growth Rate", unit: "% annual" },
  "foreign investment": { code: "BX.KLT.DINV.WD.GD.ZS", label: "Foreign Direct Investment", unit: "% of GDP" },
  "government debt": { code: "GC.DOD.TOTL.GD.ZS", label: "Government Debt", unit: "% of GDP" },
  statsskuld: { code: "GC.DOD.TOTL.GD.ZS", label: "Government Debt", unit: "% of GDP" },
  "tax revenue": { code: "GC.TAX.TOTL.GD.ZS", label: "Tax Revenue", unit: "% of GDP" },
  skatteinkomster: { code: "GC.TAX.TOTL.GD.ZS", label: "Tax Revenue", unit: "% of GDP" },
  remittances: { code: "BX.TRF.PWKR.DT.GD.ZS", label: "Personal Remittances Received", unit: "% of GDP" },
  exports: { code: "NE.EXP.GNFS.ZS", label: "Exports of Goods and Services", unit: "% of GDP" },
  export: { code: "NE.EXP.GNFS.ZS", label: "Exports of Goods and Services", unit: "% of GDP" },
  imports: { code: "NE.IMP.GNFS.ZS", label: "Imports of Goods and Services", unit: "% of GDP" },
  "current account": { code: "BN.CAB.XOKA.GD.ZS", label: "Current Account Balance", unit: "% of GDP" },
  tourism: { code: "ST.INT.ARVL", label: "International Tourism Arrivals", unit: "number of arrivals" },
  turism: { code: "ST.INT.ARVL", label: "International Tourism Arrivals", unit: "number of arrivals" },

  // Gender & social
  "female labor": { code: "SL.TLF.CACT.FE.ZS", label: "Female Labor Force Participation", unit: "% of female population 15+" },
  "child labor": { code: "SL.TLF.0714.ZS", label: "Child Labor", unit: "% of children 7-14" },
  barnarbete: { code: "SL.TLF.0714.ZS", label: "Child Labor", unit: "% of children 7-14" },
  "women in parliament": { code: "SG.GEN.PARL.ZS", label: "Women in Parliament", unit: "% of seats" },

  // Infrastructure
  "road density": { code: "IS.ROD.DNST.K2", label: "Road Density", unit: "km per 100 sq. km" },
  "rail lines": { code: "IS.RRS.TOTL.KM", label: "Rail Lines", unit: "total km" },
  järnväg: { code: "IS.RRS.TOTL.KM", label: "Rail Lines", unit: "total km" },
  "air transport": { code: "IS.AIR.PSGR", label: "Air Transport Passengers", unit: "passengers" },
  flygtrafik: { code: "IS.AIR.PSGR", label: "Air Transport Passengers", unit: "passengers" },

  // Environment (extended)
  "greenhouse gas": { code: "EN.ATM.GHGT.KT.CE", label: "Total Greenhouse Gas Emissions", unit: "kt CO2 equivalent" },
  växthusgaser: { code: "EN.ATM.GHGT.KT.CE", label: "Total Greenhouse Gas Emissions", unit: "kt CO2 equivalent" },
  "protected areas": { code: "ER.LND.PTLD.ZS", label: "Terrestrial Protected Areas", unit: "% of land area" },
  naturskyddat: { code: "ER.LND.PTLD.ZS", label: "Terrestrial Protected Areas", unit: "% of land area" },
  "marine protected": { code: "ER.MRN.PTMR.ZS", label: "Marine Protected Areas", unit: "% of territorial waters" },
  deforestation: { code: "AG.LND.FRST.ZS", label: "Forest Area", unit: "% of land area" },
  avskogning: { code: "AG.LND.FRST.ZS", label: "Forest Area", unit: "% of land area" },
};

const SUBNATIONAL_KEYWORDS = [
  // English
  "state", "states", "province", "provinces", "county", "counties",
  "district", "districts", "municipality", "municipalities",
  "region", "regions", "prefecture", "prefectures",
  // German
  "bundesland", "bundesländer", "kreis", "kreise", "landkreis", "landkreise",
  // French
  "département", "départements", "région", "régions",
  // Spanish
  "comunidad", "comunidades", "provincia", "provincias",
  // Italian
  "regione", "regioni",
  // Swedish
  "län", "kommun", "kommuner",
  // Norwegian
  "fylke", "fylker",
  // Danish/Finnish
  "maakunta",
  // Portuguese
  "estado", "estados", "município", "municípios",
  // Japanese
  "prefecture",
  // Generic
  "subnational", "sub-national", "federal",
];

const WB_INDICATOR_KEYS = Object.keys(WORLD_BANK_INDICATORS);
const WB_INDICATOR_DESCRIPTIONS = [...new Set(
  Object.entries(WORLD_BANK_INDICATORS).map(
    ([k, v]) => `${k}: ${v.label} (${v.code})`,
  ),
)].join("\n");

interface WBIntentResult {
  isCountryLevel: boolean;
  indicatorKey: string | null;
  indicatorCode: string | null;
  indicatorLabel: string | null;
  englishPrompt: string;
}

const WB_INTENT_SYSTEM = `You extract structured intent from map prompts about country-level world statistics. Any language.

Reply with a single JSON object:
{
  "isCountryLevel": true/false,
  "indicatorKey": "key" or null,
  "indicatorCode": "XX.XXX.XXX" or null,
  "indicatorLabel": "human-readable label" or null,
  "englishPrompt": "translated prompt"
}

Rules:
- isCountryLevel: true if the user wants data compared ACROSS countries (not subnational like states/provinces).
- indicatorKey: pick the best match from the curated list below. null if none match.
- indicatorCode: if indicatorKey is null, provide a World Bank API indicator code from your knowledge (e.g. "SH.TBS.INCD", "EN.GHG.CO2.PC.CE.AR5"). null if you cannot determine one.
- indicatorLabel: human-readable label for indicatorCode (e.g. "Tuberculosis incidence per 100k"). null if indicatorCode is null.
- englishPrompt: translate the prompt to concise English (max 15 words).

Curated indicators (prefer these when they match):
${WB_INDICATOR_DESCRIPTIONS}

Output ONLY the JSON object, nothing else.`;

export function isWorldBankSubnationalQuery(query: string): boolean {
  const words = query.toLowerCase().split(/\s+/);
  return SUBNATIONAL_KEYWORDS.some((kw) => words.includes(kw));
}

function getIndicatorByCode(code: string): WorldBankIndicator | null {
  return Object.values(WORLD_BANK_INDICATORS).find((indicator) => indicator.code === code) ?? null;
}

function keywordMatchWorldBankIndicator(query: string): WorldBankIndicator | null {
  const coreCode = matchWorldBankCoreKeyword(query);
  if (coreCode) {
    return getIndicatorByCode(coreCode) ?? { code: coreCode, label: coreCode, unit: "" };
  }

  const lower = query.toLowerCase();
  const sortedEntries = Object.entries(WORLD_BANK_INDICATORS)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [keyword, indicator] of sortedEntries) {
    if (lower.includes(keyword)) {
      return indicator;
    }
  }
  return null;
}

async function extractWorldBankIntent(
  query: string,
  timeoutMs: number,
): Promise<WBIntentResult | null> {
  try {
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), timeoutMs),
    );
    const aiPromise = generateText({
      model: MODELS.utility(),
      maxOutputTokens: 128,
      system: WB_INTENT_SYSTEM,
      messages: [{ role: "user", content: query }],
    }).then((r) => {
      const raw = r.text?.trim();
      if (!raw) return null;
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start === -1 || end === -1 || end <= start) return null;
      const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<WBIntentResult>;
      return {
        isCountryLevel: parsed.isCountryLevel === true,
        indicatorKey:
          typeof parsed.indicatorKey === "string" &&
          WB_INDICATOR_KEYS.includes(parsed.indicatorKey)
            ? parsed.indicatorKey
            : null,
        indicatorCode:
          typeof parsed.indicatorCode === "string" && /^[A-Z]{2}[\w.]+$/.test(parsed.indicatorCode)
            ? parsed.indicatorCode
            : null,
        indicatorLabel:
          typeof parsed.indicatorLabel === "string"
            ? parsed.indicatorLabel
            : null,
        englishPrompt:
          typeof parsed.englishPrompt === "string" && parsed.englishPrompt.trim().length > 0
            ? parsed.englishPrompt.trim()
            : query,
      } satisfies WBIntentResult;
    }).catch(() => null);
    return await Promise.race([aiPromise, timeout]);
  } catch {
    return null;
  }
}

export interface WorldBankResolution {
  indicator: WorldBankIndicator | null;
  isCountryLevel: boolean;
  englishPrompt?: string;
  source: "keyword" | "ai" | "none";
}

export async function resolveWorldBankIndicator(
  query: string,
  options?: { allowAiFallback?: boolean; timeoutMs?: number },
): Promise<WorldBankResolution> {
  const allowAiFallback = options?.allowAiFallback ?? true;
  const timeoutMs = options?.timeoutMs ?? 2_500;

  if (isWorldBankSubnationalQuery(query)) {
    return { indicator: null, isCountryLevel: false, source: "none" };
  }

  const keywordMatch = keywordMatchWorldBankIndicator(query);
  if (keywordMatch) {
    return { indicator: keywordMatch, isCountryLevel: true, source: "keyword" };
  }

  if (!allowAiFallback) {
    return { indicator: null, isCountryLevel: true, source: "none" };
  }

  const intent = await extractWorldBankIntent(query, timeoutMs);
  if (!intent) {
    return { indicator: null, isCountryLevel: true, source: "none" };
  }
  if (!intent.isCountryLevel) {
    return { indicator: null, isCountryLevel: false, englishPrompt: intent.englishPrompt, source: "ai" };
  }
  if (intent.indicatorKey) {
    return {
      indicator: WORLD_BANK_INDICATORS[intent.indicatorKey],
      isCountryLevel: true,
      englishPrompt: intent.englishPrompt,
      source: "ai",
    };
  }
  if (intent.indicatorCode && intent.indicatorLabel) {
    return {
      indicator: { code: intent.indicatorCode, label: intent.indicatorLabel, unit: "" },
      isCountryLevel: true,
      englishPrompt: intent.englishPrompt,
      source: "ai",
    };
  }

  return { indicator: null, isCountryLevel: true, englishPrompt: intent.englishPrompt, source: "ai" };
}
