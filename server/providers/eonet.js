import { makeRateLimiter, clientKey } from './common/rate-limit.js';
import { coalesceProxyRequest, readResponseJsonCapped } from './common/http.js';
import {
  EONET_DEFAULT_STATUS,
  buildEonetEventsUrl,
  normalizeEonetEvents,
  normalizeEonetStatus,
} from '../../src/data/eonetEvents.js';

// ---------------------------------------------------------------------------
// NASA EONET v3 hazard-events proxy
//
// Serves currently-open (or all/closed) natural-hazard events for the
// globe-wide disaster layer. EONET is keyless and returns the full event list
// in one call, so the cache is keyed only by the `status` allow-list value —
// no query fan-out and no per-viewport bbox are required.
// ---------------------------------------------------------------------------

const EONET_CACHE_MS = 10 * 60_000;
const EONET_STALE_MS = 6 * 60 * 60_000;
const EONET_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const EONET_TIMEOUT_MS = 15_000;

/**
 * Fetch and normalize one EONET events snapshot. The deadline covers the BODY
 * (not just the headers) via the AbortController handed to the capped reader.
 *
 * @param {object} [options]
 * @param {string} [options.status] - EONET status token (open|closed|all).
 * @param {number} [options.limit] - Upstream event budget (default 500).
 * @param {Function} [options.fetchImpl] - Injectable fetch for tests.
 * @returns {Promise<Array<object>>} Normalized hazard records.
 */
export async function fetchEonetEvents({
  status = EONET_DEFAULT_STATUS,
  limit,
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  const url = buildEonetEventsUrl({ status, limit });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EONET_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'GodsEyeView/0.1' },
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`EONET HTTP ${response.status}`);
    const payload = await readResponseJsonCapped(
      response,
      EONET_MAX_RESPONSE_BYTES,
      controller.signal,
    );
    const events = normalizeEonetEvents(payload);
    if (!events) throw new Error('Malformed EONET response');
    return events;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Vite plugin exposing `GET /api/eonet/events`.
 *
 * Query parameters:
 *   status (optional) EONET status token: open|closed|all (default `open`)
 */
function eonetProxy({ fetchImpl } = {}) {
  const cache = new Map();
  const inFlight = new Map();
  const rateLimiter = makeRateLimiter({
    windowMs: 60_000,
    max: 30,
    globalMax: 120,
  });

  function install(middlewares) {
    middlewares.use('/api/eonet/events', async (req, res) => {
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
      const status = normalizeEonetStatus(
        url.searchParams.get('status') || EONET_DEFAULT_STATUS,
      );

      const serve = (events, cacheStatus, extra = {}) => {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control':
            cacheStatus === 'stale' ? 'no-store' : 'public, max-age=60',
        });
        res.end(
          JSON.stringify({
            status: cacheStatus,
            filter: status,
            count: events.length,
            events,
            source: 'NASA EONET',
            ...extra,
          }),
        );
      };

      const cached = cache.get(status);
      const now = Date.now();
      if (cached && now - cached.cachedAt <= EONET_CACHE_MS) {
        serve(cached.events, 'cached', { retrievedAt: cached.retrievedAt });
        return;
      }

      const refresh = coalesceProxyRequest(inFlight, status, async () => {
        const events = await fetchEonetEvents({ status, fetchImpl });
        const entry = {
          events,
          cachedAt: Date.now(),
          retrievedAt: new Date().toISOString(),
        };
        cache.set(status, entry);
        return entry;
      });

      try {
        const entry = await refresh.promise;
        serve(entry.events, 'ready', { retrievedAt: entry.retrievedAt });
      } catch {
        if (cached && now - cached.cachedAt <= EONET_STALE_MS) {
          serve(cached.events, 'stale', { retrievedAt: cached.retrievedAt });
          return;
        }
        res.writeHead(503, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({ error: 'Hazard source is temporarily unavailable' }),
        );
      }
    });
  }

  return {
    name: 'eonet-events-proxy',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}

export { eonetProxy };
