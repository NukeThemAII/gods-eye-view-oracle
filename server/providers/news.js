import { makeRateLimiter, clientKey } from './common/rate-limit.js';
import { coalesceProxyRequest } from './common/http.js';
import { fetchGdeltGeoNews } from './news/gdelt.js';
import {
  GDELT_GEO_DEFAULT_MAXPOINTS,
  GDELT_GEO_DEFAULT_TIMESPAN,
  filterGdeltNewsToBbox,
  normalizeGdeltMaxPoints,
  normalizeGdeltNewsQuery,
  normalizeGdeltTimespan,
  parseGdeltBbox,
} from '../../src/data/gdeltNews.js';

// ---------------------------------------------------------------------------
// GDELT GEO 2.0 news heatmap proxy
//
// Serves geocoded news "mentions" for a free-text query, optionally filtered
// to a viewport bounding box. The full (unfiltered) query result is cached and
// the bbox filter is applied per request, so panning/zooming across one query
// costs a single upstream call instead of one per viewport.
// ---------------------------------------------------------------------------

const GDELT_NEWS_CACHE_MS = 5 * 60_000;
const GDELT_NEWS_STALE_MS = 60 * 60_000;
const GDELT_NEWS_MAX_CACHE = 200;
// GDELT's free tier asks for at most one request every 5 seconds; exceeding it
// returns a 429. The news source fans out across several keywords, so the proxy
// must space upstream fetches to stay under that ceiling.
const GDELT_UPSTREAM_MIN_INTERVAL_MS = 5_000;

function gdeltNewsCacheKey({ query, timespan, maxpoints }) {
  return `${query}|${timespan}|${maxpoints}`;
}

function trimGdeltNewsCache(cache) {
  while (cache.size > GDELT_NEWS_MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * Vite plugin exposing `GET /api/gdelt/news`.
 *
 * Query parameters:
 *   query      (required) free-text keyword/place search
 *   timespan   (optional) GDELT timespan token (default `1d`)
 *   maxpoints  (optional) upstream point budget, 1..1000 (default 250)
 *   bbox       (optional) `west,south,east,north` viewport filter
 */
function newsProxy({
  fetchImpl,
  upstreamMinIntervalMs = GDELT_UPSTREAM_MIN_INTERVAL_MS,
} = {}) {
  const cache = new Map();
  const inFlight = new Map();
  const rateLimiter = makeRateLimiter({
    windowMs: 60_000,
    max: 30,
    globalMax: 240,
  });

  // Serialize and space upstream GDELT fetches so the multi-keyword fan-out
  // never fires two requests inside the allowed interval. The queue keeps the
  // chain alive past a rejection so one failed query can't deadlock the next.
  let upstreamAt = 0;
  let upstreamQueue = Promise.resolve();
  const scheduleUpstream = (task) => {
    const run = upstreamQueue.then(async () => {
      const wait = upstreamAt + upstreamMinIntervalMs - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      upstreamAt = Date.now();
      return task();
    });
    upstreamQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  function install(middlewares) {
    middlewares.use('/api/gdelt/news', async (req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return;
      }
      if (!rateLimiter(clientKey(req))) {
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'Retry-After': '10',
        });
        res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
        return;
      }
      const url = new URL(req.url || '', 'http://localhost');
      const query = normalizeGdeltNewsQuery(url.searchParams.get('query'));
      if (!query) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'A query is required' }));
        return;
      }
      const timespan = normalizeGdeltTimespan(
        url.searchParams.get('timespan') || GDELT_GEO_DEFAULT_TIMESPAN,
      );
      const maxpoints = normalizeGdeltMaxPoints(
        url.searchParams.get('maxpoints') || GDELT_GEO_DEFAULT_MAXPOINTS,
      );
      const bboxRaw = url.searchParams.get('bbox');
      let bbox = null;
      if (bboxRaw) {
        const [west, south, east, north] = bboxRaw.split(',').map(Number);
        bbox = parseGdeltBbox({ west, south, east, north });
        if (!bbox) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid bounding box' }));
          return;
        }
      }

      const key = gdeltNewsCacheKey({ query, timespan, maxpoints });
      const now = Date.now();
      const cached = cache.get(key);

      const serve = (records, status, extra = {}) => {
        const visible = bbox ? filterGdeltNewsToBbox(records, bbox) : records;
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control':
            status === 'stale' ? 'no-store' : 'public, max-age=60',
        });
        res.end(
          JSON.stringify({
            status,
            query,
            timespan,
            count: visible.length,
            records: visible,
            source: 'GDELT GEO 2.0',
            ...extra,
          }),
        );
      };

      if (cached && now - cached.cachedAt <= GDELT_NEWS_CACHE_MS) {
        serve(cached.records, 'cached', { retrievedAt: cached.retrievedAt });
        return;
      }

      const refresh = coalesceProxyRequest(inFlight, key, async () => {
        const records = await scheduleUpstream(() =>
          fetchGdeltGeoNews({
            query,
            timespan,
            maxpoints,
            fetchImpl,
          }),
        );
        const entry = {
          records,
          cachedAt: Date.now(),
          retrievedAt: new Date().toISOString(),
        };
        cache.set(key, entry);
        trimGdeltNewsCache(cache);
        return entry;
      });

      try {
        const entry = await refresh.promise;
        serve(entry.records, 'ready', { retrievedAt: entry.retrievedAt });
      } catch {
        if (cached && now - cached.cachedAt <= GDELT_NEWS_STALE_MS) {
          serve(cached.records, 'stale', { retrievedAt: cached.retrievedAt });
          return;
        }
        res.writeHead(503, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({ error: 'News source is temporarily unavailable' }),
        );
      }
    });
  }

  return {
    name: 'gdelt-news-proxy',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}

export { newsProxy };
