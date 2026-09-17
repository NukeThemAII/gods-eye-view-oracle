/**
 * Pure NASA EONET v3 hazard-event model — URL construction and event
 * normalization for the globe-wide disaster/hazard layer. No Cesium, no DOM,
 * no network; every export is unit-testable in isolation.
 *
 * Upstream: NASA EONET (Earth Observatory Natural Event Tracker) v3
 *   https://eonet.gsfc.nasa.gov/api/v3/events
 * returns `{ title, description, link, events: [...] }` where each event
 * carries an id, title, description, link, categories, sources, and a
 * `geometry` array of dated observations (earliest first). We surface the
 * most recent Point observation as the event's position and its date as the
 * freshness timestamp.
 */

export const EONET_EVENTS_API = 'https://eonet.gsfc.nasa.gov/api/v3/events';

/** Statuses EONET accepts for the `status` query parameter. */
export const EONET_STATUSES = Object.freeze(['open', 'closed', 'all']);
export const EONET_DEFAULT_STATUS = 'open';
export const EONET_DEFAULT_LIMIT = 500;
export const EONET_MAX_LIMIT = 1000;
export const EONET_MAX_EVENTS = 1000;

/** Coerce a requested status to the allow-list, falling back to the default. */
export function normalizeEonetStatus(value) {
  const normalized = String(value ?? '').toLowerCase();
  return EONET_STATUSES.includes(normalized) ? normalized : EONET_DEFAULT_STATUS;
}

/** Clamp a requested event budget to [1, ceiling]; non-numeric → default. */
export function normalizeEonetLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return EONET_DEFAULT_LIMIT;
  return Math.max(1, Math.min(EONET_MAX_LIMIT, Math.floor(numeric)));
}

/**
 * Build the EONET v3 events URL for a normalized status and point budget.
 * `limit` bounds the upstream payload — the open-events feed can be several
 * megabytes without it.
 */
export function buildEonetEventsUrl({
  status = EONET_DEFAULT_STATUS,
  limit = EONET_DEFAULT_LIMIT,
} = {}) {
  const params = new URLSearchParams({
    status: normalizeEonetStatus(status),
    limit: String(normalizeEonetLimit(limit)),
  });
  return `${EONET_EVENTS_API}?${params.toString()}`;
}

function textOrNull(value, maxLength = 240) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, maxLength) : null;
}

function safeHttpUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

function finiteCoord(value, maxAbs) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && Math.abs(numeric) <= maxAbs ? numeric : null;
}

/**
 * Pick the most recent Point observation from a chronological geometry array.
 * Walks from the end (latest) and returns the first valid Point, or null when
 * the event has no usable point (e.g. polygon-only or malformed geometry).
 */
export function latestEonetPoint(geometry) {
  if (!Array.isArray(geometry)) return null;
  for (let i = geometry.length - 1; i >= 0; i--) {
    const entry = geometry[i];
    if (entry?.type !== 'Point' || !Array.isArray(entry?.coordinates)) continue;
    const [lon, lat] = entry.coordinates;
    if (finiteCoord(lon, 180) === null || finiteCoord(lat, 90) === null)
      continue;
    return entry;
  }
  return null;
}

/** First category entry (most specific), or null. Title falls back to the id. */
export function primaryEonetCategory(categories) {
  if (!Array.isArray(categories)) return null;
  for (const category of categories) {
    if (typeof category?.id !== 'string' || !category.id) continue;
    return { id: category.id, title: textOrNull(category.title, 80) || category.id };
  }
  return null;
}

/**
 * Normalize an EONET v3 events payload into a validated, deduplicated list of
 * hazard records. Returns `null` on a structurally malformed payload so the
 * caller can refuse to replace a last-good snapshot.
 *
 * Each returned record is JSON-safe and shaped for the analyst/heatmap seams:
 *   { stableId, lon, lat, title, url, category, categoryId, description,
 *     status, seenAt }
 */
export function normalizeEonetEvents(payload) {
  if (!Array.isArray(payload?.events)) return null;
  const seen = new Set();
  const events = [];
  for (const event of payload.events) {
    const id = typeof event?.id === 'string' ? event.id : null;
    if (!id) continue;
    const point = latestEonetPoint(event?.geometry);
    if (!point) continue;
    const category = primaryEonetCategory(event?.categories);
    const title = textOrNull(event?.title, 240);
    const url = safeHttpUrl(event?.link);
    if (!title && !url) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    events.push({
      stableId: id,
      lon: Number(point.coordinates[0]),
      lat: Number(point.coordinates[1]),
      title,
      url,
      category: category?.title ?? null,
      categoryId: category?.id ?? null,
      description: textOrNull(event?.description, 500),
      status: event?.closed == null ? 'open' : 'closed',
      seenAt: typeof point?.date === 'string' ? point.date : null,
    });
    if (events.length >= EONET_MAX_EVENTS) break;
  }
  return events;
}
