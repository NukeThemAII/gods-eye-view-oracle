import * as Cesium from 'cesium';
import { categoryColor, mapAnalystRecord } from './model.js';
export * from './model.js';
export { createEonetSource } from './source.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function descriptionFor(row) {
  const title = escapeHtml(row.title || row.category || 'Hazard event');
  const category = row.category ? escapeHtml(`Category: ${row.category}`) : '';
  const summary = row.description ? escapeHtml(row.description) : '';
  const status = row.status ? escapeHtml(`Status: ${row.status}`) : '';
  const link = row.url
    ? `<a href="${escapeHtml(row.url)}" target="_blank" rel="noopener">View event</a>`
    : '';
  return [title, category, summary, status, link].filter(Boolean).join('<br/>');
}

/** Own one disaster-events display and its refresh lifecycle. */
export function createEonetLayer({ source } = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('EONET layer requires a snapshot source');
  let _viewer = null;
  let _request = null;
  let _dataSource = null;
  let _records = [];
  let _count = 0;
  let _lastUpdate = null;
  let _lastError = null;
  let _enabled = false;

  const layer = {
    id: 'eonet',
    name: 'Disaster Events',
    icon: '⚠️',
    source: 'NASA EONET · LIVE',
    updateInterval: 10 * 60_000,

    init(viewer) {
      if (_viewer) throw new Error('EONET layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource('eonet');
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      _records = [];
      _count = 0;
      _lastUpdate = null;
      _lastError = null;
      _enabled = false;
      console.log('[Data:Eonet] Initialized');
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
              id: `eonet:${row.stableId}`,
              position,
              name: row.title || row.category || 'Hazard event',
              description: descriptionFor(row),
              point: new Cesium.PointGraphics({
                pixelSize: 8,
                color: categoryColor(row.categoryId),
                outlineColor: Cesium.Color.WHITE.withAlpha(0.35),
                outlineWidth: 1,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              }),
              properties: {
                title: row.title,
                url: row.url,
                category: row.category,
                description: row.description,
                status: row.status,
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
        console.log(`[Data:Eonet] Updated: ${_count} events`);
        return true;
      } catch (error) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        console.warn('[Data:Eonet] Fetch error:', error);
        _lastError = error?.message || 'Hazard source unavailable';
        // A transient source outage degrades the layer (stays enabled, shows
        // the error, retries next refresh) — only `false` rejects the lifecycle
        // and rolls the toggle back off.
        return true;
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

    /** Snapshot last-good records as JSON-safe objects for the analyst engine. */
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
