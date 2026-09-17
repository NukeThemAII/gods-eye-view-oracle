/**
 * Pure GDELT news record normalization for the client layer. No Cesium, no
 * network — unit-testable in isolation. The server proxy already returns
 * normalized records ({ stableId, lon, lat, title, url, location, tone,
 * seenAt }); this module re-validates that shape defensively and dedupes
 * across the multiple topical queries the source fans out.
 */

export const NEWS_MAX_RECORDS = 1000;

function finiteCoord(value, maxAbs) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && Math.abs(numeric) <= maxAbs
    ? numeric
    : null;
}

function textOrNull(value, maxLength = 240) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, maxLength) : null;
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Validate and deduplicate a batch of server-normalized news records.
 * Drops records with missing/out-of-range coordinates or with neither a title
 * nor a URL. Deduplicates on `stableId`, which the server derives from the
 * article URL (or a coordinate+title hash), so the same article surfaced by
 * several topical queries is counted once.
 *
 * @param {Array<object>|unknown} rows
 * @param {number} [limit]
 * @returns {Array<object>} Clean records shaped for rendering/analyst seams.
 */
export function normalizeNewsRecords(rows, limit = NEWS_MAX_RECORDS) {
  if (!Array.isArray(rows)) return [];
  const cap = Math.max(
    1,
    Math.min(NEWS_MAX_RECORDS, Math.floor(Number(limit) || 0)),
  );
  const seen = new Set();
  const records = [];
  for (const [index, row] of rows.entries()) {
    const lon = finiteCoord(row?.lon, 180);
    const lat = finiteCoord(row?.lat, 90);
    if (lon === null || lat === null) continue;
    const title = textOrNull(row?.title, 240);
    const url = textOrNull(row?.url, 500);
    if (!title && !url) continue;
    const stableId = textOrNull(row?.stableId, 64) || `news-${index}`;
    if (seen.has(stableId)) continue;
    seen.add(stableId);
    records.push({
      stableId,
      lon,
      lat,
      title,
      url,
      location: textOrNull(row?.location, 160),
      tone: numberOrNull(row?.tone),
      seenAt: textOrNull(row?.seenAt, 40),
    });
    if (records.length >= cap) break;
  }
  return records;
}
