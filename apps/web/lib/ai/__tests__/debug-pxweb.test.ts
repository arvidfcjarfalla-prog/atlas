import { describe, it } from 'vitest';
import { resolvePxWebPure } from '../tools/pxweb-resolution';
import { buildPxSearchQuery, translateSearchQuery, extractGeoLevelHint, searchTables, rankTables, fetchMetadata, fetchData, selectDimensionsWithAmbiguity, jsonStat2ToRecords } from '../tools/pxweb-client';
import { normalizePxWebResult } from '../tools/source-adapter';

const SCB_BASE = 'https://api.scb.se/OV0104/v2beta/api/v2';

describe('debug pipeline fresh', () => {
  it('runs pipeline end to end without cache', async () => {
    const prompt = 'Utbildningsniva per lan i Sverige 2024';
    const geoHint = extractGeoLevelHint(prompt);
    const q = buildPxSearchQuery(prompt);
    const translated = translateSearchQuery(q, 'sv');
    console.log('query:', translated, '| geoHint:', geoHint);

    // Search + rank
    const t1 = await searchTables(SCB_BASE, translated, 'sv', 20);
    const t2 = await searchTables(SCB_BASE, `${translated} region`, 'sv', 20);
    const seen = new Set<string>();
    const merged = [...t2, ...t1].filter(t => !seen.has(t.id) && seen.add(t.id));
    const ranked = rankTables(merged, prompt, geoHint ?? undefined, translated);
    const table = ranked[0];
    console.log('table:', table.id, table.label);

    // Metadata + dimension selection
    const meta = await fetchMetadata(SCB_BASE, table.id, 'sv');
    if (!meta) { console.log('NO META'); return; }
    const dimResult = selectDimensionsWithAmbiguity(meta, prompt, geoHint);
    console.log('selections:', dimResult.selections.map(s => `${s.dimensionId}[${s.valueCodes.length}]`).join(', '));

    // Find geo/contents/time dims
    const geoDim = meta.dimensions.find(d => d.type === 'geo');
    const contentsDim = meta.dimensions.find(d => d.type === 'contents');
    const timeDim = meta.dimensions.find(d => d.type === 'time');
    console.log('geoDim:', geoDim?.id, '| contentsDim:', contentsDim?.id, '| timeDim:', timeDim?.id);

    // Check how many region codes selected
    const geoSel = dimResult.selections.find(s => s.dimensionId === geoDim?.id);
    console.log('geo codes selected:', geoSel?.valueCodes.length, 'first 3:', geoSel?.valueCodes.slice(0,3));

    // Fetch data
    const records = await fetchData(SCB_BASE, table.id, dimResult.selections, 'sv');
    console.log('records:', records.length);

    // Normalize
    const normalized = normalizePxWebResult({
      metadata: meta,
      records,
      selections: dimResult.selections,
      geoDimId: geoDim!.id,
      contentsDimId: contentsDim!.id,
      timeDimId: timeDim!.id,
      sourceId: 'se-scb',
      sourceName: 'SCB',
      countryCode: 'SE',
      prompt,
      searchQuery: translated,
      tables: ranked,
      language: 'sv',
    });
    console.log('normalized.rows:', normalized.rows.length);
    console.log('sample row:', JSON.stringify(normalized.rows[0]));
    console.log('dimensions:', normalized.dimensions.map(d => `${d.id}(${d.type},${d.values.length})`).join(', '));

    // Run pure pipeline
    const result = resolvePxWebPure(normalized);
    console.log('\n=== RESULT ===');
    console.log('status:', result.status);
    console.log('reasons:', result.reasons);
    if (result.detection) {
      console.log('detection.level:', result.detection.level);
      console.log('detection.renderHint:', result.detection.renderHint);
      console.log('detection.codeFamily:', JSON.stringify(result.detection.codeFamily));
      console.log('detection.unitCount:', result.detection.unitCount);
    }
    if (result.joinPlan) {
      console.log('joinPlan.strategy:', result.joinPlan.strategy);
      console.log('joinPlan.mapReady:', result.joinPlan.mapReady);
      console.log('joinPlan.reasons:', result.joinPlan.reasons);
    }
    if (result.joinExecution) {
      console.log('joinExecution.status:', result.joinExecution.status);
      console.log('joinExecution.diagnostics:', JSON.stringify(result.joinExecution.diagnostics));
    }
  }, 60000);
});
