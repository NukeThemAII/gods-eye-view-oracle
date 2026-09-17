import * as Cesium from 'cesium';
export { normalizeEonetRecords, EONET_MAX_RECORDS } from './records.js';

// Category ramp: one color per EONET hazard category id, with a neutral gray
// fallback for events that carry no (or an unknown) category.
const CATEGORY_COLORS = {
  wildfires: Cesium.Color.fromCssColorString('#ff7a1a'), // orange
  volcanoes: Cesium.Color.fromCssColorString('#e5484d'), // red
  earthquakes: Cesium.Color.fromCssColorString('#a2673a'), // brown
  floods: Cesium.Color.fromCssColorString('#2f7bd9'), // blue
  severeStorms: Cesium.Color.fromCssColorString('#8b5cf6'), // violet
  droughts: Cesium.Color.fromCssColorString('#d4a017'), // amber
  seaLakeIce: Cesium.Color.fromCssColorString('#38bdf8'), // sky
  snow: Cesium.Color.fromCssColorString('#e2e8f0'), // pale
  tempExtremes: Cesium.Color.fromCssColorString('#db2777'), // pink
  waterColor: Cesium.Color.fromCssColorString('#14b8a6'), // teal
  dustHaze: Cesium.Color.fromCssColorString('#9ca3af'), // gray
  landslides: Cesium.Color.fromCssColorString('#7c2d12'), // dark brown
  manmade: Cesium.Color.fromCssColorString('#6b7280'), // slate
};
const DEFAULT_COLOR = Cesium.Color.fromCssColorString('#8a8f98');

/**
 * Map an EONET category id to a point color; unknown/absent → neutral gray.
 * Always returns a fresh Color so callers own their instance.
 */
export function categoryColor(categoryId) {
  const color = CATEGORY_COLORS[categoryId];
  return (color || DEFAULT_COLOR).clone();
}

/**
 * Map one hazard record's plain values to a JSON-safe analyst record (analyst
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
    id: text(raw?.stableId) || `EONET-${String(index).padStart(4, '0')}`,
    category: text(raw?.category),
    lat: num(raw?.lat),
    lon: num(raw?.lon),
    title: text(raw?.title),
    url: text(raw?.url),
    description: text(raw?.description),
    status: text(raw?.status),
    seenAt: text(raw?.seenAt),
  };
}
