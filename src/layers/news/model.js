import * as Cesium from 'cesium';
export { normalizeNewsRecords, NEWS_MAX_RECORDS } from './records.js';

// Sentiment ramp: negative tone → red, neutral → gray, positive → green.
// GDELT tone is roughly [-20, +20]; we clamp to ±10 for visual intensity.
const NEGATIVE = Cesium.Color.fromBytes(229, 72, 77, 255); // #e5484d
const NEUTRAL = Cesium.Color.fromBytes(138, 143, 152, 255); // #8a8f98
const POSITIVE = Cesium.Color.fromBytes(70, 167, 88, 255); // #46a758

/**
 * Map a GDELT tone score to a point color: negative sentiment → red,
 * neutral → gray, positive → green, with intensity growing toward ±10.
 * Non-numeric/absent tone renders as the neutral gray.
 */
export function toneColor(tone) {
  const clamped = Number.isFinite(tone) ? Math.max(-10, Math.min(10, tone)) : 0;
  if (clamped === 0) return NEUTRAL.clone();
  const amount = Math.abs(clamped) / 10;
  return Cesium.Color.lerp(
    NEUTRAL,
    clamped < 0 ? NEGATIVE : POSITIVE,
    amount,
    new Cesium.Color(),
  );
}

/**
 * Map one news record's plain values to a JSON-safe analyst record (analyst
 * query engine seam). Pure — no Cesium types. Missing fields become null,
 * never NaN/undefined; falls back to an index-based id when stableId is absent.
 */
export function mapAnalystRecord(raw, index = 0) {
  const num = (value) => {
    if (value == null || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };
  const text = (value) => {
    const t = String(value ?? '').trim();
    return t || null;
  };
  return {
    id: text(raw?.stableId) || `NEWS-${String(index).padStart(4, '0')}`,
    tone: num(raw?.tone),
    lat: num(raw?.lat),
    lon: num(raw?.lon),
    title: text(raw?.title),
    location: text(raw?.location),
    url: text(raw?.url),
  };
}
