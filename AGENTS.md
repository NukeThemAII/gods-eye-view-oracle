# God's Eye View — Oracle Edition

**A self-hosted, open-source spatial-intelligence console.** Photorealistic 3D
globe, live public feeds, and hands-free multi-provider AI. *No place left
behind. No API budget blown.*

> Status (2026-09): DeepSeek-V4.1-Flash AI shipped (chat + HUD summary),
> OpenAI Realtime voice retained, the "Director" modular architecture synced
> from upstream `bilawalsidhu/gods-eye-view`, and **Phase A.1 shipped** — a
> keyless GDELT news heatmap (proxy at `/api/gdelt/news` + a tone-colored
> globe layer under `src/layers/news/`).

---

## 1. Current State

### Layers (live & bundled)
- **Tracking**: aircraft (OpenSky → adsb.lol fallback), vessels (AISStream),
  satellites (CelesTrak), rocket launches (Launch Library 2)
- **Earth**: earthquakes (USGS), wildfires (NASA FIRMS), weather & atmospheric
  effects (Open-Meteo)
- **Ground**: CCTV (multi-city catalog), ALPR cameras (DeFlock/OSM), bikeshare
  (GBFS), traffic (TomTom), transit, directions (OSRM), radio (Radio Browser)
- **Infrastructure**: submarine cables (TeleGeography), datacenters, dams,
  neighborhoods, Natural Earth regions, military installations (OSM)
- **Intel**: cockpit "regional briefing" (Google News RSS → GDELT → Open-Meteo),
  contacts/awareness proximity engine, annotations
- **Authoring**: Director scenes, camera directions, data packs, sharing, and
  timeline (incl. a Nepal evidence pack)

### AI & Voice
- **OpenAI Realtime** WebRTC voice (`gpt-realtime-2` / `-2.1-mini`) — retained
  but expensive.
- **DeepSeek-V4.1-Flash** — default for text commands (tool-calling) and the
  5-word HUD summary via `server/providers/deepseek.js`.
- **Web Speech API** STT/TTS — the zero-cost voice path.

### Architecture
Modular: `server/providers/*` (server-side proxies, rate limiting, key
isolation), `src/layers/*` (per-layer modules), `src/voice/*` (28-tool action
runner), `src/director/*` (authoring), `src/data/*` (bundled datasets + credits).

---

## 2. Guiding Principles & Guardrails

1. **Keyless by default, opt-in keys.** The app runs with zero keys; every
   provider is opt-in via `pinokio/ENVIRONMENT`.
2. **Server-side key isolation.** Keys never reach client JavaScript.
3. **Rate limiting.** Per-provider `GEV_RATELIMIT_*_PER_MIN` ceilings (app
   guards, not billing caps).
4. **Every source documented & attributed.** A new source must add an entry to
   `DATA_SOURCES.md` (license + terms) **and** register a credit in
   `src/data/dataCredits.js` so it surfaces in the in-app attribution popover.
5. **License carve-outs.** Non-commercial datasets (TeleGeography CC BY-NC-SA,
   Bhote Koshi CC BY-NC) stay bundled but flagged; commercial users must
   remove/replace them.

---

## 3. Roadmap (prioritized)

### Phase A — News & Events Intelligence (free / keyless first)
1. **Global GDELT news heatmap** — promote DOC 2.0 + GKG + Events from the
   cockpit fallback into a globe-wide geocoded layer: event codes, tone /
   sentiment, article density. Keyless.
2. **Conflict layer** — ACLED (free registration) + UCDP GED (free download),
   geocoded conflict/protest events.
3. **Disaster / hazard layer** — GDACS RSS (keyless) + NASA EONET (keyless).
4. **"What's notable here"** — Wikipedia geosearch (keyless).
5. **Optional keyed tiers** — MediaStack / NewsData.io / The Guardian Open
   Platform.

### Phase B — Signal, Air & Maritime Intelligence
1. **GPS jamming** — gpsjam.org daily interference polygons (keyless).
2. **Internet outages** — Cloudflare Radar (free token) + IODA (Georgia Tech,
   keyless).
3. **FAA TFR airspace** + **NGA World Port Index / naval warnings** (free).
4. **Dark-vessel detection** — Sentinel-1 SAR (Copernicus free) *[stretch]*.

### Phase C — Internet & Crypto Node OSINT (keyless)
1. **Bitnodes** (Bitcoin) + **Ethernodes** node geolocation.
2. **PeeringDB** IXPs / datacenters.
3. **CoinGecko** (free) markets + **Whale Alert** (free tier) large
   transactions.

### Phase D — Earth Observation & Hazards
1. **OpenAQ** air quality; **Open-Meteo** lightning/AQ; **NOAA NHC** hurricane
   tracks; **Blitzortung** lightning; **NASA GIBS** imagery tiles.

### Phase E — Product & AI Capabilities (larger efforts)
1. **Replay / history archive** — persist ADS-B/AIS positions locally + a
   timeline scrubber (the differentiator vs. FR24/MarineTraffic paywalls).
2. **Provenance & confidence scoring** — per-contact source agreement + fix age.
3. **Evidence locker + case export** — SHA-256 chain-of-custody → HTML/PPTX
   reports (extends the Director document/bundle work).
4. **Photo geolocation (GEOINT)** — DeepSeek reasoning + Nominatim/Photon over
   an uploaded image.
5. **MCP server** — let any AI agent query the live feeds.
6. **More providers** — Ollama (local), Groq, Gemini, Mistral, OpenRouter.

---

## 4. Multi-Provider AI Strategy

- **Default: DeepSeek-V4.1-Flash.** Its context caching of the system prompt +
  28 tool schemas makes tool-calling ≈ **$0.001 per 100 commands** (vs. ~$3–6
  on OpenAI Realtime) — ~99.9% cheaper.
- **Decoupled agent:** Web Speech STT → LLM tool-calling →
  `createGevActionRunner` → speechSynthesis TTS.
- **Fallbacks:** OpenAI Realtime for voice when configured; the HUD summary
  falls back DeepSeek ↔ OpenAI.
- **Rate limits:** `GEV_RATELIMIT_DEEPSEEK_PER_MIN` (default 60),
  `GEV_RATELIMIT_OPENAI_PER_MIN`, `GEV_RATELIMIT_GOOGLE_PER_MIN`.

---

## 5. Next Actions / Open Questions

1. **Phase A.1 done** (keyless GDELT news heatmap: proxy + globe layer). Next
   polish: a keyword/place search box in the layer row so the heatmap query is
   steerable instead of fixed topical keywords.
2. Wire one more keyless source (gpsjam or NASA EONET) end-to-end to prove the
   "add a source" path.
3. Decide the replay storage backend (SQLite vs. JSONL vs. `.gev-cache/`).

---

## 6. Completed History (legacy)

- **DeepSeek integration (Milestones 1–4, shipped).** Decoupled
  OpenAI-compatible chat + HUD summary via `server/providers/deepseek.js`,
  Web Speech voice path, glass-morphism chat UI (`src/ai/*`,
  `src/ui/styles/deepseek-chat.css`), and key setup in `pinokio/ENVIRONMENT`.
- **"Director" upstream sync.** Modular refactor merged from
  `bilawalsidhu/gods-eye-view`; the DeepSeek proxy was relocated from the
  monolithic `vite.config.js` into `server/providers/`.
- See `git log` and `CHANGELOG.md` for the full historical record.
