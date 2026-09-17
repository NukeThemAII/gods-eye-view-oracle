import { readResponseJsonCapped } from '../common/http.js';
import {
  buildGdeltGeoUrl,
  normalizeGdeltGeoFeatures,
} from '../../../src/data/gdeltNews.js';

const GDELT_GEO_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const GDELT_GEO_TIMEOUT_MS = 12_000;
const GDELT_GEO_MAXPOINTS = 250;

/**
 * Fetch and normalize one GDELT GEO 2.0 news query. The deadline covers the
 * BODY (not just the headers) via the AbortController handed to the capped
 * reader, so an upstream that answers headers and then stalls still times out.
 *
 * @param {object} options
 * @param {string} options.query - Free-text query (sanitized by the URL builder).
 * @param {string} [options.timespan] - GDELT timespan token.
 * @param {number} [options.maxpoints] - Point budget for the upstream call.
 * @param {Function} [options.fetchImpl] - Injectable fetch for tests.
 * @returns {Promise<Array<object>>} Normalized geocoded records.
 */
export async function fetchGdeltGeoNews({
  query,
  timespan,
  maxpoints = GDELT_GEO_MAXPOINTS,
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  const url = buildGdeltGeoUrl({ query, timespan, maxpoints });
  if (!url) throw new Error('GDELT news query is required');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GDELT_GEO_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'GodsEyeView/0.1' },
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`GDELT HTTP ${response.status}`);
    const payload = await readResponseJsonCapped(
      response,
      GDELT_GEO_MAX_RESPONSE_BYTES,
      controller.signal,
    );
    const records = normalizeGdeltGeoFeatures(payload, maxpoints);
    if (!records) throw new Error('Malformed GDELT GEO response');
    return records;
  } finally {
    clearTimeout(timeout);
  }
}
