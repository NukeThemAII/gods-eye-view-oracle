import { normalizeNewsRecords } from './records.js';

/**
 * Broad topical keywords fanned out to build a zero-input global news
 * heatmap. Each is one cached `/api/gdelt/news` query on the server, so the
 * per-refresh cost stays small even as the list grows.
 */
export const DEFAULT_NEWS_QUERIES = Object.freeze([
  'war',
  'disaster',
  'protest',
  'election',
]);

const NEWS_PROXY_PATH = '/api/gdelt/news';

/**
 * Fetch and merge geocoded news mentions from the server proxy. The proxy
 * caches each query for five minutes and returns already-normalized records;
 * this source fans out across `queries`, concatenates, and de-duplicates.
 *
 * @param {object} [options]
 * @param {string[]} [options.queries] - Topical keywords to fan out.
 * @param {Function} [options.fetchImpl] - Injectable fetch for tests.
 * @param {string} [options.proxyPath] - Proxy base path override for tests.
 */
export function createGdeltNewsSource({
  queries = DEFAULT_NEWS_QUERIES,
  fetchImpl = (...args) => globalThis.fetch(...args),
  proxyPath = NEWS_PROXY_PATH,
} = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      const collected = [];
      for (const query of queries) {
        const url = `${proxyPath}?query=${encodeURIComponent(String(query))}&timespan=1d&maxpoints=250`;
        const response = await fetchImpl(url, { signal });
        if (!response.ok) throw new Error(`GDELT HTTP ${response.status}`);
        const payload = await response.json();
        signal?.throwIfAborted();
        if (Array.isArray(payload?.records)) collected.push(...payload.records);
      }
      return normalizeNewsRecords(collected);
    },
  };
}
