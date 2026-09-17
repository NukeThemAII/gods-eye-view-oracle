import { normalizeEonetRecords } from './records.js';

const EONET_PROXY_PATH = '/api/eonet/events';

/**
 * Fetch the currently-open hazard events from the server proxy. EONET returns
 * the full event list in one call (no query fan-out), and the proxy caches
 * each status for ten minutes.
 *
 * @param {object} [options]
 * @param {Function} [options.fetchImpl] - Injectable fetch for tests.
 * @param {string} [options.proxyPath] - Proxy base path override for tests.
 */
export function createEonetSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  proxyPath = EONET_PROXY_PATH,
} = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      const response = await fetchImpl(`${proxyPath}?status=open`, { signal });
      if (!response.ok) throw new Error(`EONET HTTP ${response.status}`);
      const payload = await response.json();
      signal?.throwIfAborted();
      if (!Array.isArray(payload?.events))
        throw new Error('Malformed EONET response');
      return normalizeEonetRecords(payload.events);
    },
  };
}
