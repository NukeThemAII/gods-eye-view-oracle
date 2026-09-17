# Agent Change Log

> Maintained by the coding agent. Every meaningful change is recorded here so
> history stays traceable independent of `git log`. Append new entries at the
> top (newest first) using the `##` + date heading convention below.

---

## 2026-09-17 — News heatmap resilience (GDELT outage handling)

**Trigger:** "news heatmap unavailable" — GDELT GEO 2.0 was intermittently
returning 404/429/timeout, and the layer snapped back off.

**Root causes (verified against the live API):**
- GDELT's free tier rate-limits to **one request every 5 seconds**; the
  news source's 4-keyword fan-out (`war`/`disaster`/`protest`/`election`)
  fired back-to-back and tripped the 429.
- `update()` returned `false` on a source error, which the lifecycle treats
  as a rejection and rolls the toggle back off (lifecycle.js:994).

**What changed:**
- `src/layers/news/index.js` + `src/layers/eonet/index.js` — on a transient
  source error, return `true` (degrade, stay enabled, show the error, retry
  next refresh) instead of `false` (roll back). Regression tests added.
- `server/providers/news.js` — an upstream throttle spaces GDELT fetches
  ≥5s apart (injectable `upstreamMinIntervalMs` for tests) so the fan-out
  no longer exceeds GDELT's rate limit.
- `src/data/gdeltNews.test.mjs` — throttle spacing test.

**Not changed:** `earthquakes` keeps its intentional, tested `return false`
(roll back) contract — changing it is a separate design decision.

**Validation:** 23 news/gdelt tests pass; import-direction and
package-boundary checks green; prettier clean (pre-existing `deepseek.js`
still flagged).

---

## 2026-09-17 — EONET disaster/hazard layer (keyless)


**Trigger:** continue development — wire the next keyless roadmap source
end-to-end (NASA EONET, the disaster/hazard layer).

**What changed (code):**
- `src/data/eonetEvents.js` — pure EONET v3 model: status allow-list, URL
  builder, latest-Point picker, category resolver, `normalizeEonetEvents`.
- `server/providers/eonet.js` — `eonetProxy()` vite plugin exposing
  `GET /api/eonet/events` (10-minute caching, 6-hour stale window, request
  coalescing, per-client rate limiting) + `fetchEonetEvents`.
- `src/layers/eonet/{records,source,model,index}.js` — client layer family:
  category-colored point entities on a Cesium `CustomDataSource`.
- `src/app/layers/eonet.js` — app-layer wrapper.
- Registered the keyless `eonet` source, catalog entry, share-link token
  (`o`), analyst schema, Events-group UI entry, and a `dataCredits.js` +
  `DATA_SOURCES.md` attribution row.

**Validation:** 14 new tests (server model + proxy; client layer) pass;
import-direction and package-boundary checks green.

**Not changed:** no query fan-out — EONET returns the full event list in one
call, so the proxy cache is keyed only by status.

---

## 2026-09-17 — Phase A.1 (client): visible GDELT news heatmap layer

**Trigger:** "build the visible client-side layer… full auto."

**What changed (code):**
- `src/layers/news/{records,source,model,index}.js` — client layer family.
  - `source.js` fans out across broad topical keywords, hits `/api/gdelt/news`,
    merges and de-duplicates.
  - `records.js` pure re-validation + dedupe; `model.js` tone→color ramp +
    analyst-record mapper; `index.js` renders tone-colored point entities on a
    Cesium `CustomDataSource` (no overlay-host dependency).
- `src/app/layers/news.js` — app-layer wrapper.
- `src/sources/reference.js` — registers the keyless `news` source.
- `src/app/constructCatalog.js` — `news: ['getSnapshot']` + catalog entry.
- `src/data/layerState.js` — `news` share-link token (`k`), alphabetical.
- `src/data/analystEngine.js` — `news` schema (tone/title/location/url).
- `src/ui/layerPanel.js` — "News Heatmap" in the Events group.
- `package.json` + `scripts/package-boundaries.json` — `news` / `news-source`
  boundary groups plus module ownership for the app/reference groups.
- `src/layers/news/news.test.mjs` — 7 tests (records, source, tone, lifecycle).

**Validation:** import-direction + package-boundary checks green; prettier
clean (the repo formatter flags only the pre-existing `deepseek.js`); 214 tests
across every touched suite pass (news, gdeltNews, constructCatalog, layerState,
reference, manager, scenePolicy, analystEngine, layerPanel, cockpitMarkup, …).

**Not changed:** no overlay-worker phase — the layer draws its own points, so
the hard-coded allocation phases are untouched.

---

## 2026-09-17 — Phase A.1 (server): keyless GDELT news heatmap proxy

**Trigger:** "you the boss… start building" — implement the highest-value
keyless roadmap item first.

**What changed (code + docs):**
- `server/providers/news/gdelt.js` — bounded upstream fetch for the GDELT
  GEO 2.0 API (12 s body deadline, 2 MB response cap, injectable fetch).
- `server/providers/news.js` — `newsProxy()` vite plugin exposing
  `GET /api/gdelt/news` (`query`, `timespan`, `maxpoints`, optional `bbox`),
  with 5-minute caching, 60-minute stale window, request coalescing, and a
  per-client rate limiter. Full query results are cached and the bbox filter
  is applied per request (pan/zoom costs one upstream call per query).
- `src/data/gdeltNews.js` — pure, Cesium-free model: query sanitizer,
  timespan/maxpoints allow-lists, URL builder, bbox parser/filter, and
  `normalizeGdeltGeoFeatures` (validates GeoJSON points, dedupes, extracts
  url/title/tone/location from a `url` field or the `html` anchor).
- `src/data/gdeltNews.test.mjs` — 14 tests (pure helpers, normalizer, fetch,
  and an end-to-end handler test covering validation/caching/bbox filtering).
- Registered `newsProxy()` in `server/providers/local.js` (order-preserving,
  before the dev-only key-setup endpoint) and re-exported for testability.
- `src/data/dataCredits.js` — added `gdelt-news-map` attribution entry.
- `DATA_SOURCES.md` — added a GDELT GEO 2.0 live-source row.

**Why:** ship the keyless "add a source" path end-to-end at the server layer
(proxy + normalizer + tests + attribution), ready for a client rendering layer.

**Validation:** `node --test src/data/gdeltNews.test.mjs` (14/14); existing
`regionalProxy`, `viteBuild`, `mediaProviders`, `environmentProviders`,
`nominatimSearchRoute`, and `previewServing` suites all pass; import-direction
and package-boundary checks green; prettier clean.

**Not changed:** any client layer/UI wiring — the visible globe layer is the
next step.

---

## 2026-09-17 — Rewrote AGENTS.md as a forward-looking roadmap

**Trigger:** User requested a brainstorm of upgrade ideas (free APIs + news
aggregators), a review of GitHub forks/sibling projects, and an AGENTS.md update.

**Research performed:**
- Read the full repo (`AGENTS.md`, `package.json`, `vite.config.js`,
  `DATA_SOURCES.md`, `README.md`, `server/providers/*`, `src/layers/*`,
  `pinokio/ENVIRONMENT`).
- Queried the GitHub forks API for `bilawalsidhu/gods-eye-view`
  (~40 forks) — most are unmodified mirrors.
- Reviewed two signals: the `likalight/samaritan` fork (AI photo geolocation /
  GEOINT) and the sibling console `AndrewCTF/velocity`
  (replay/history archive, provenance scoring, GPS-jamming, dark-vessel SAR,
  conflict events, internet-outage layer, evidence locker + report export,
  MCP server, local Ollama inference).

**What changed:**
- `AGENTS.md` — rewritten from the historical "DeepSeek Integration Plan"
  (completed work) into a clean, forward-looking roadmap:
  - Current-state inventory (layers, AI, architecture).
  - Guiding principles & guardrails (key isolation, rate limits,
    DATA_SOURCES.md + `dataCredits.js` attribution rule, license carve-outs).
  - Prioritized expansion phases **A–E** with concrete free APIs / news
    aggregators (GDELT, ACLED, UCDP GED, GDACS, NASA EONET, Wikipedia geosearch,
    gpsjam, Cloudflare Radar, IODA, FAA TFR, NGA, Sentinel-1 SAR, Bitnodes,
    Ethernodes, PeeringDB, CoinGecko, Whale Alert, OpenAQ, NOAA NHC, Blitzortung,
    NASA GIBS, plus product features: replay, provenance, evidence locker,
    photo geolocation, MCP server, more LLM providers).
  - Condensed multi-provider AI strategy + cost notes.
  - Preserved a **"Completed history (legacy)"** section summarizing shipped work.

**Why:** Give the project a forward-looking plan grounded in free/keyless data
sources, replacing a document that only described already-shipped work.

**Files:** `AGENTS.md` (rewritten), `LOG.md` (created).

**Not changed:** any source code — this was a documentation-only update.
