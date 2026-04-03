# Findings

## 1. Sparade kartor och artifacts pekar på expirerande cache-URL:er

**Varför det är ett problem**

Nya kartor sparar `geojson_url` som `geoUrl`, vilket normalt är `/api/geo/cached/{key}`. Den read-pathen lever ovanpå `data_cache`, som logiskt expirerar efter TTL, och artifacts återanvänder samma modell trots att de ser ut att vara tänkta som permanenta records.

**Vad det kan orsaka**

En karta kan fungera direkt efter generation men senare öppna tom eller ge 404 i editor, publik vy eller efter duplicering. Artifacts ser versionerade och stabila ut men pekar i praktiken fortfarande på volatil cache.

**Exakta filreferenser**

- `atlas/apps/web/app/app/(editor)/map/new/page.tsx:275`
- `atlas/apps/web/app/api/maps/route.ts:87`
- `atlas/apps/web/app/app/(editor)/map/[id]/page.tsx:244`
- `atlas/apps/web/lib/load-public-map.ts:44`
- `atlas/apps/web/app/api/geo/cached/[key]/route.ts:36`
- `atlas/apps/web/lib/ai/tools/data-search.ts:69`
- `atlas/apps/web/lib/ai/tools/artifact.ts:129`
- `atlas/apps/web/app/api/maps/[id]/duplicate/route.ts:31`

## 2. Uploadad data har ingen riktig persistensväg

**Varför det är ett problem**

`/api/ai/upload-data` parsear och profilerar filer men sparar dem inte i `uploaded_datasets`. I både nya editorn och sparad editor ligger uploadad data i praktiken i komponentstate i stället för bakom en durable URL eller tabellkoppling.

**Vad det kan orsaka**

Användaren kan tro att uppladdad data är en del av kartan, men reload, save, restore eller senare redigering saknar en riktig källa. Det gör upload-spåret skört och svårt att felsöka.

**Exakta filreferenser**

- `atlas/apps/web/app/api/ai/upload-data/route.ts:21`
- `atlas/apps/web/app/api/ai/upload-data/route.ts:57`
- `atlas/apps/web/app/api/ai/upload-data/route.ts:81`
- `atlas/apps/web/app/app/(editor)/map/new/page.tsx:493`
- `atlas/apps/web/app/app/(editor)/map/new/page.tsx:748`
- `atlas/apps/web/app/app/(editor)/map/[id]/page.tsx:417`
- `atlas/supabase/migrations/005_uploaded_datasets.sql:5`

## 3. `data_cache` åldras från första insert, inte från senaste refresh

**Varför det är ett problem**

L2-cachen avgör TTL från `created_at`, men `upsert` uppdaterar inte den tidsstämpeln för samma `cache_key`. En post kan alltså återanvändas länge i flödet utan att dess “ålder” egentligen reset:as.

**Vad det kan orsaka**

Stabila nycklar kan fortsätta se friska ut i varm minnescache men ändå börja ge 404 eller kall-cache-fel så fort processen byts eller L1 försvinner.

**Exakta filreferenser**

- `atlas/apps/web/lib/ai/tools/data-search.ts:72`
- `atlas/apps/web/lib/ai/tools/data-search.ts:99`
- `atlas/apps/web/lib/ai/tools/data-search.ts:124`

## 4. `needs_input` i nya `/app/map/new` är ett svart hål

**Varför det är ett problem**

Förslagsschipsen byter bara query-parametern, men auto-run-effekten blockeras av `pipelineRanRef`, så den nya prompten körs inte säkert igen. Samma view visar agency-hint som extern länk men har ingen riktig upload- eller recovery-väg.

**Vad det kan orsaka**

Användaren fastnar precis när clarify inte kunde lösa datan. UI:t ser interaktivt ut men leder ofta inte vidare till faktisk resolution.

**Exakta filreferenser**

- `atlas/apps/web/app/app/(editor)/map/new/page.tsx:327`
- `atlas/apps/web/app/app/(editor)/map/new/page.tsx:472`
- `atlas/apps/web/app/app/(editor)/map/new/page.tsx:575`

## 5. Clarify-svar tappas mellan rundor i den aktiva editorn

**Varför det är ett problem**

`handleAnswer()` skickar bara senaste svaret, och retry i confirm-steget kör om clarify på råprompten utan tidigare svar. Det betyder att sessionen inte bär sitt eget disambigueringstillstånd.

**Vad det kan orsaka**

Cache-nyckel, routing och source-resolution kan ändras mitt i samma användarsession, särskilt när clarify ställer mer än en fråga eller när användaren backar och provar igen.

**Exakta filreferenser**

- `atlas/apps/web/app/app/(editor)/map/new/page.tsx:192`
- `atlas/apps/web/app/app/(editor)/map/new/page.tsx:249`
- `atlas/apps/web/app/app/(editor)/map/new/page.tsx:320`
- `atlas/apps/web/app/app/(editor)/map/new/page.tsx:346`
- `atlas/apps/web/app/api/ai/clarify/route.ts:384`

## 6. AI-clarifyns frågespår är i praktiken dött

**Varför det är ett problem**

Slow path deklarerar `questions` i svaret, men efter parsning kastas de i praktiken bort och ersätts med `warning`/`suggestions`. Frontend prioriterar dessutom warnings och suggestions över frågor.

**Vad det kan orsaka**

Systemet ser ut att ha ett AI-baserat clarify-läge men i runtime faller det oftast till “prova istället”-chips i stället för riktiga uppföljningsfrågor. Routinglogiken blir därmed mer skenbar än verklig.

**Exakta filreferenser**

- `atlas/apps/web/app/api/ai/clarify/route.ts:987`
- `atlas/apps/web/app/api/ai/clarify/route.ts:1004`
- `atlas/apps/web/app/api/ai/clarify/route.ts:1090`
- `atlas/apps/web/lib/ai/clarify-action.ts:101`

## 7. Den deterministiska `generate-map`-vägen fungerar bara på varm cache

**Varför det är ett problem**

PxWeb skriver `normalizedMeta` till `CacheEntry`, och `generate-map` försöker läsa tillbaka den för att hoppa AI helt. Men L2-persistensen i `data_cache` varken sparar eller läser `normalizedMeta`.

**Vad det kan orsaka**

Samma dataset kan gå deterministiskt på varm process men falla tillbaka till AI efter cold start eller instansbyte. Det gör utfallet känsligt för deployment- och cacheläge snarare än bara input.

**Exakta filreferenser**

- `atlas/apps/web/app/api/ai/generate-map/route.ts:24`
- `atlas/apps/web/app/api/ai/generate-map/route.ts:223`
- `atlas/apps/web/lib/ai/tools/pxweb-resolution.ts:634`
- `atlas/apps/web/lib/ai/tools/data-search.ts:72`
- `atlas/apps/web/lib/ai/tools/data-search.ts:99`

## 8. Learning/minneslagret är poisonable och semantiskt felkopplat

**Varför det är ett problem**

`generate-map` sparar varje generation som `accepted` och använder sedan `case-memory` som lessons, men den aktiva `/app/map/new`-vägen läser inte ens tillbaka `caseId` och uppdaterar aldrig riktiga utfall eller refinements. Samtidigt är `/api/ai/case-memory` utan auth och lagret ligger i `.next/cache`.

**Vad det kan orsaka**

Lesson-lagret är både publikt läsbart/skrivbart och opålitligt mellan deploys. Det kan förgifta framtida körningar och samtidigt ge falsk trygghet om att systemet “lär sig”.

**Exakta filreferenser**

- `atlas/apps/web/app/api/ai/generate-map/route.ts:456`
- `atlas/apps/web/app/app/(editor)/map/new/page.tsx:134`
- `atlas/apps/web/app/(maps)/create/page.tsx:522`
- `atlas/apps/web/app/api/ai/case-memory/route.ts:11`
- `atlas/apps/web/lib/ai/case-memory.ts:17`
- `atlas/apps/web/lib/ai/tools/resolution-memory.ts:44`

## 9. Artifact-lagret är inte permanent i praktiken

**Varför det är ett problem**

Koden beskriver artifacts som versionerade, permanenta records, men de sparar fortfarande `geojson_url` som `/api/geo/cached/...`, alltså samma expirerande path som kartorna själva läser ifrån. Versionshashen bygger dessutom på `_atlas_code`, medan joinen skriver `_atlas_geo_code`.

**Vad det kan orsaka**

Artifact-versioner kan se stabila ut men ändå brytas när cache expirerats. Även versionssanningen blir skör eftersom hashning och faktiskt join-fält inte använder samma kontrakt.

**Exakta filreferenser**

- `atlas/apps/web/lib/ai/tools/artifact.ts:1`
- `atlas/apps/web/lib/ai/tools/artifact.ts:129`
- `atlas/apps/web/lib/ai/tools/pxweb-resolution.ts:676`
- `atlas/apps/web/lib/ai/tools/geometry-join.ts:266`

## 10. URL-baserade lager kompileras mot tom data

**Varför det är ett problem**

När `data` är en URL kompileras lagret först mot en tom `FeatureCollection`, warnings tystas, och riktig data laddas senare av MapLibre utan recompilation.

**Vad det kan orsaka**

För klassade choropleths kan legend, breaks och färgskala vara fel trots att lagret “syns”. Det är särskilt missvisande för sparade/public kartor där användaren ser något som verkar fungera men är beräknat på tom input.

**Exakta filreferenser**

- `atlas/packages/map-core/src/use-manifest-renderer.ts:85`
- `atlas/packages/map-core/src/use-manifest-renderer.ts:172`
- `atlas/apps/web/app/m/[slug]/page.tsx:115`

## 11. Privata kartor läcker existens via slug-lookup

**Varför det är ett problem**

`/api/maps/by-slug/[slug]` gör en service-role-baserad kontroll och returnerar `403 private` när en dold karta finns, i stället för att behandla den som icke-existerande för obehöriga.

**Vad det kan orsaka**

Privata slugs eller IDs blir enumerable. Innehållet skyddas fortfarande, men existensen läcker.

**Exakta filreferenser**

- `atlas/apps/web/app/api/maps/by-slug/[slug]/route.ts:39`
- `atlas/apps/web/app/api/maps/by-slug/[slug]/route.ts:55`
- `atlas/apps/web/lib/supabase/service.ts:9`

## 12. Eval/scoring och faktisk runtime använder inte samma viewport-kontrakt

**Varför det är ett problem**

`defaultBounds` och delar av kamera-kontraktet ser ut att vara poängsatta i eval/scoring men inte fullt implementerade i runtime. `MapViewport` använder inte samma fält på samma sätt som resten av systemet verkar anta.

**Vad det kan orsaka**

Eval kan säga att en karta har “rätt” framing eller kamera samtidigt som användaren i runtime får en annan vy. Det skapar mismatch mellan offline-kvalitet och verkligt beteende.

**Exakta filreferenser**

- `atlas/packages/map-core/src/map-viewport.tsx:274`
- `atlas/packages/map-core/src/map-viewport.tsx:339`
- `atlas/apps/web/lib/ai/quality-scorer.ts:101`

## 13. Service-role-baserad persistens kan stängas av tyst

**Varför det är ett problem**

`getServiceClient()` returnerar `null` om rätt env saknas, och flera callers behandlar det som no-op i stället för hårt fel eller tydlig degradering.

**Vad det kan orsaka**

Artifacts, resolution-logging eller andra persistensfunktioner kan se aktiva ut i kod men i praktiken vara avstängda i vissa miljöer utan tydlig signal.

**Exakta filreferenser**

- `atlas/apps/web/lib/supabase/service.ts:9`
- `atlas/apps/web/lib/ai/tools/resolution-logger.ts:68`
- `atlas/apps/web/lib/ai/tools/resolution-logger.ts:117`
- `atlas/apps/web/lib/ai/tools/artifact.ts:92`

## Öppna frågor / osäkerheter

- Jag har inte verifierat faktiska Supabase-migrationer eller RLS-policies utanför repot; vissa DB-risker kan mildras eller förvärras där.
- Jag har inte kört live mot externa datakällor; findingsen ovan är kodbevisade kontraktsbrott och sannolika runtime-fel, inte prod-traces.
- `defaultBounds` och reaktiva kameraändringar ser ut att vara poängsatta i eval/scoring men inte fullt implementerade i runtime. Jag ser det som en verklig kontraktsdrift, men inte lika akut som persistenshålen.
- Jag gick igenom repo-brett, men inte bokstavligen varje statisk fil, fixture och asset.

## Arkitektur som den verkar fungera idag

Den faktiska huvudvägen är `prompt -> /api/ai/clarify -> dataUrl/dataProfile -> /api/ai/generate-map -> manifest -> /api/maps`. `clarify` är en waterfall av katalog, Overpass, PxWeb, Data Commons, Eurostat, World Bank, registry och web-sök, med AI som sista fallback.

Systemets skörhet kommer främst från att persistens och “learning” är splittrade över flera sanningskällor: Supabase-tabeller, processminne och `.next/cache`. Det gör att samma prompt kan bete sig olika beroende på instans, varm/kall cache och om man går via aktiv editor, legacy-flöde eller eval-script.

Jag körde riktade tester för `clarify-action`, `generate-map-api`, `pxweb-cache-correctness`, `artifact`, `dataset-registry` och `resolution-logger`. Alla passerade, vilket stärker bilden att flera av problemen ovan ligger utanför nuvarande testskydd.

## 3 områden att fixa först

1. Gör data-persistensen sann. Sluta spara `/api/geo/cached/*` som långsiktig source of truth för kartor och artifacts, och bygg en riktig persistensväg för uploadad data.
2. Fixa den nya `/app/map/new`-state maskinen. Suggestions måste rerunna pipeline, agency-hint måste ha en väg vidare, och clarify-svar måste ackumuleras och återanvändas vid retry.
3. Konsolidera learning/minne. Antingen flytta case/resolution-memory till riktig durable storage med auth och tydlig semantik, eller stäng av deras påverkan på produktion tills de är reproducerbara.
