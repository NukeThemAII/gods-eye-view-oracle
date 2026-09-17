import * as Cesium from 'cesium';
import { toneColor, mapAnalystRecord } from './model.js';
export * from './model.js';
export { createGdeltNewsSource, DEFAULT_NEWS_QUERIES } from './source.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function descriptionFor(row) {
  const title = escapeHtml(row.title || row.location || 'News mention');
  const link = row.url
    ? `<a href="${escapeHtml(row.url)}" target="_blank" rel="noopener">Read article</a>`
    : '';
  const tone =
    row.tone != null && Number.isFinite(row.tone)
      ? `Tone ${Number(row.tone).toFixed(1)}`
      : '';
  return [title, link, tone].filter(Boolean).join('<br/>');
}

/** Own one news-heatmap display and its refresh lifecycle. */
export function createNewsLayer({ source } = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('News layer requires a snapshot source');
  let _viewer = null;
  let _request = null;
  let _dataSource = null;
  let _records = [];
  let _count = 0;
  let _lastUpdate = null;
  let _lastError = null;
  let _enabled = false;

  const layer = {
    id: 'news',
    name: 'News Heatmap',
    icon: '🗞️',
    source: 'GDELT GEO 2.0',
    updateInterval: 5 * 60_000,

    init(viewer) {
      if (_viewer) throw new Error('News layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource('news');
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _records = [];
      _count = 0;
      _lastUpdate = null;
      _lastError = null;
      _enabled = false;
      console.log('[Data:News] Initialized');
    },

    enable(viewer) {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
    },

    disable(viewer) {
      _request?.abort();
      _request = null;
      _enabled = false;
      if (_dataSource) _dataSource.show = false;
    },

    async update(viewer) {
      if (!_enabled || !_dataSource) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const rows = await source.getSnapshot({ signal: request.signal });
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;

        const next = [];
        for (const row of rows) {
          const position = Cesium.Cartesian3.fromDegrees(row.lon, row.lat);
          next.push(
            new Cesium.Entity({
              id: `news:${row.stableId}`,
              position,
              name: row.title || row.location || 'News mention',
              description: descriptionFor(row),
              point: new Cesium.PointGraphics({
                pixelSize: 7,
                color: toneColor(row.tone),
                outlineColor: Cesium.Color.WHITE.withAlpha(0.35),
                outlineWidth: 1,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              }),
              properties: {
                title: row.title,
                url: row.url,
                location: row.location,
                tone: row.tone,
              },
            }),
          );
        }

        _dataSource.entities.removeAll();
        for (const entity of next) _dataSource.entities.add(entity);
        _records = rows;
        _count = next.length;
        _lastUpdate = Date.now();
        _lastError = null;
        console.log(`[Data:News] Updated: ${_count} mentions`);
        return true;
      } catch (error) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:News] Fetch error:', error);
        _lastError = error?.message || 'News source unavailable';
        return false;
      } finally {
        if (_request === request) _request = null;
      }
    },

    destroy(viewer = _viewer) {
      _request?.abort();
      _request = null;
      _viewer = null;
      _enabled = false;
      if (_dataSource) {
        viewer.dataSources.remove(_dataSource, true);
        _dataSource = null;
      }
      _records = [];
      _count = 0;
      _lastUpdate = null;
      _lastError = null;
    },

    /**
     * Snapshot the last-good records as JSON-safe objects for the analyst
     * query engine. On-demand only — zero per-frame cost. Returns [] while the
     * layer is disabled or empty.
     */
    getAnalystRecords(maxCount = 2000) {
      if (!_enabled || !_records.length) return [];
      const limit = Number.isFinite(maxCount)
        ? Math.max(1, Math.floor(maxCount))
        : 2000;
      return _records
        .slice(0, limit)
        .map((record, index) => mapAnalystRecord(record, index));
    },

    getStats() {
      return {
        count: _count,
        lastUpdate: _lastUpdate,
        error: _lastError,
      };
    },
  };
  return layer;
}
