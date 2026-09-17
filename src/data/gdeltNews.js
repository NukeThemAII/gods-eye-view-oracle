/**
 * Pure GDELT GEO 2.0 news model — URL construction and geocoded-record
 * normalization for the globe-wide news heatmap. No Cesium, no DOM, no network;
 * every export is unit-testable in isolation.
 *
 * Upstream: GDELT GEO 2.0 API
 *   https://api.gdeltproject.org/api/v2/geo/geo?query=...&format=geojson
 * returns a GeoJSON FeatureCollection of geocoded news "mentions": a Point
 * geometry [lon, lat] whose properties carry a location name, a tone score,
 * and an article link (either a `url` field or an `html` anchor whose `href`
 * and anchor text carry the article).
 */

export const GDELT_GEO_API = 'https://api.gdeltproject.org/api/v2/geo/geo';

/** Timespans GDELT GEO accepts. Kept to a short, documented allow-list. */
export const GDELT_GEO_TIMESPANS = Object.freeze([
  '15min',
  '1h',
  '3h',
  '1d',
  '2d',
  '3d',
  '7d',
]);

export const GDELT_GEO_DEFAULT_TIMESPAN = '1d';
export const GDELT_GEO_DEFAULT_MAXPOINTS = 250;
export const GDELT_GEO_MAXPOINTS_CEILING = 1000;

const MAX_QUERY_CHARS = 140;

/**
 * Sanitize a free-text GDELT query: collapse whitespace, strip quotes and
 * control characters (which GDELT would otherwise treat as syntax), and bound
 * the length so an arbitrary string can't produce a giant request URL.
 * Returns the empty string when nothing usable remains — callers treat that
 * as an absent query.
 */
export function normalizeGdeltNewsQuery(value) {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, MAX_QUERY_CHARS);
}

/** Coerce a requested timespan to the allow-list, falling back to the default. */
export function normalizeGdeltTimespan(value) {
  const normalized = String(value ?? '').toLowerCase();
  return GDELT_GEO_TIMESPANS.includes(normalized)
    ? normalized
    : GDELT_GEO_DEFAULT_TIMESPAN;
}

/** Clamp a requested point budget to [1, ceiling]; non-numeric → default. */
export function normalizeGdeltMaxPoints(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return GDELT_GEO_DEFAULT_MAXPOINTS;
  return Math.max(
    1,
    Math.min(GDELT_GEO_MAXPOINTS_CEILING, Math.floor(numeric)),
  );
}

/** Build the GDELT GEO 2.0 URL for a sanitized query. Returns null without a query. */
export function buildGdeltGeoUrl({
  query,
  timespan = GDELT_GEO_DEFAULT_TIMESPAN,
  maxpoints = GDELT_GEO_DEFAULT_MAXPOINTS,
} = {}) {
  const normalizedQuery = normalizeGdeltNewsQuery(query);
  if (!normalizedQuery) return null;
  const params = new URLSearchParams({
    query: normalizedQuery,
    format: 'geojson',
  });
  params.set('timespan', normalizeGdeltTimespan(timespan));
  params.set('maxpoints', String(normalizeGdeltMaxPoints(maxpoints)));
  return `${GDELT_GEO_API}?${params.toString()}`;
}

/**
 * Parse and validate a bounding box of the form { west, south, east, north }.
 * Returns null unless every edge is a finite number within range and west/east
 * and south/north do not cross the globe's poles/anti-meridian in a way that
 * would make the box meaningless. Used to filter a keyword's global matches
 * down to the visible viewport without asking GDELT for location syntax.
 */
export function parseGdeltBbox({ west, south, east, north } = {}) {
  const w = Number(west);
  const s = Number(south);
  const e = Number(east);
  const n = Number(north);
  if (![w, s, e, n].every(Number.isFinite)) return null;
  if (w < -180 || w > 180 || e < -180 || e > 180) return null;
  if (s < -90 || s > 90 || n < -90 || n > 90) return null;
  if (w > e || s > n) return null;
  return { west: w, south: s, east: e, north: n };
}

/** True when a record's coordinates fall inside the (validated) bounding box. */
export function gdeltRecordInBbox(record, bbox) {
  if (!bbox || !Number.isFinite(record?.lon) || !Number.isFinite(record?.lat))
    return false;
  const lon = record.lon;
  const lat = record.lat;
  if (lon < bbox.west || lon > bbox.east) return false;
  if (lat < bbox.south || lat > bbox.north) return false;
  return true;
}

/** Filter records to those inside the box; no-op when the box is null. */
export function filterGdeltNewsToBbox(records, bbox) {
  if (!Array.isArray(records)) return [];
  if (!bbox) return records;
  return records.filter((record) => gdeltRecordInBbox(record, bbox));
}

/** Deterministic 8-hex-char FNV-1a hash for stable, content-addressed ids. */
function hashString(value) {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function safeHttpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

/** Strip an HTML fragment to plain text (for the anchor-title fallback path). */
function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function textOrNull(value, maxLength = 180) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  return text || null;
}

function toneOrNull(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(-20, Math.min(20, numeric));
}

/** Pull a URL + title out of the GEO API's `html` anchor property, if present. */
function parseHtmlLink(html) {
  if (typeof html !== 'string') return { url: null, title: null };
  const href = /href\s*=\s*["']([^"']+)["']/i.exec(html)?.[1];
  const title = stripHtml(html);
  return { url: safeHttpUrl(href), title: title || null };
}

/**
 * Normalize a GDELT GEO 2.0 `format=geojson` payload into a validated,
 * deduplicated list of geocoded news records. Returns `null` on a structurally
 * malformed payload so the caller can refuse to replace a last-good snapshot.
 *
 * Each returned record is JSON-safe and shaped for the analyst/heatmap seams:
 *   { stableId, lon, lat, title, url, location, tone, seenAt }
 * `seenAt` is absent from the GEO payload (it has no per-mention timestamp),
 * so it stays null here; the proxy stamps its own `retrievedAt` separately.
 */
export function normalizeGdeltGeoFeatures(payload, limit = 250) {
  if (!Array.isArray(payload?.features)) return null;
  const cap = Math.max(
    1,
    Math.min(GDELT_GEO_MAXPOINTS_CEILING, Math.floor(Number(limit) || 0)),
  );
  const seen = new Set();
  const records = [];
  for (const [index, feature] of payload.features.entries()) {
    const geometry = feature?.geometry;
    const properties = feature?.properties;
    if (!geometry || !Array.isArray(geometry.coordinates)) return null;
    if (geometry.type != null && geometry.type !== 'Point') return null;
    const [lon, lat] = geometry.coordinates;
    if (!Number.isFinite(lon) || Math.abs(lon) > 180) return null;
    if (!Number.isFinite(lat) || Math.abs(lat) > 90) return null;
    if (properties != null && typeof properties !== 'object') return null;
    if (Array.isArray(properties)) return null;

    const { url: htmlUrl, title: htmlTitle } = parseHtmlLink(properties?.html);
    const url = safeHttpUrl(properties?.url) || htmlUrl;
    const title = textOrNull(properties?.title) || htmlTitle || null;
    const location = textOrNull(properties?.name, 120);

    // A mention without an article link or title carries no usable news.
    if (!url && !title) continue;

    const signature = url
      ? url
      : `${lon.toFixed(4)}|${lat.toFixed(4)}|${String(title).toLowerCase()}`;
    if (seen.has(signature)) continue;
    seen.add(signature);

    const stableId = url
      ? `news-${hashString(url)}`
      : `news-${hashString(`${lon.toFixed(4)},${lat.toFixed(4)},${title}`)}-${index}`;
    records.push({
      stableId,
      lon,
      lat,
      title,
      url,
      location,
      tone: toneOrNull(properties?.tone),
      seenAt: null,
    });
    if (records.length >= cap) break;
  }
  return records;
}
