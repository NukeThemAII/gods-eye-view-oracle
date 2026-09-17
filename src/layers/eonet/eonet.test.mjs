import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEonetRecords, EONET_MAX_RECORDS } from './records.js';
import { createEonetSource } from './source.js';
import { categoryColor, mapAnalystRecord } from './model.js';
import { createEonetLayer } from './index.js';

const record = (over = {}) => ({
  stableId: 'EONET_1',
  lon: -98.7,
  lat: 34.9,
  title: 'Wildfire Near Testville',
  url: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_1',
  category: 'Wildfires',
  categoryId: 'wildfires',
  description: 'A large fire',
  status: 'open',
  seenAt: '2026-09-09T00:00:00Z',
  ...over,
});

test('normalizeEonetRecords validates and dedupes server records', () => {
  assert.deepEqual(normalizeEonetRecords(null), []);
  const rows = normalizeEonetRecords([
    record(),
    record(), // duplicate stableId
    record({ stableId: 'EONET_2', lon: 200 }), // out-of-range lon
    record({ stableId: 'EONET_3', lat: 91 }), // out-of-range lat
    record({ stableId: 'EONET_4', title: null, url: null }), // no title/url
    record({ stableId: 'EONET_5', lon: null }), // null lon coerced, must drop
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stableId, 'EONET_1');
  assert.equal(rows[0].category, 'Wildfires');
});

test('normalizeEonetRecords clamps the budget and fills fallback ids', () => {
  const rows = normalizeEonetRecords(
    [
      { lon: 0, lat: 0, title: 'x' },
      { lon: 1, lat: 1, title: 'y' },
    ],
    1,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stableId, 'eonet-0');
  assert.equal(EONET_MAX_RECORDS, 1000);
});

test('source fetches open events and rejects a non-OK upstream response', async () => {
  const calls = [];
  const source = createEonetSource({
    proxyPath: '/api/eonet/events',
    fetchImpl: async (url) => {
      calls.push(url);
      return new Response(JSON.stringify({ events: [record()] }));
    },
  });
  const rows = await source.getSnapshot();
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('status=open'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stableId, 'EONET_1');

  const failing = createEonetSource({
    proxyPath: '/api/eonet/events',
    fetchImpl: async () => new Response('unavailable', { status: 503 }),
  });
  await assert.rejects(failing.getSnapshot(), /EONET HTTP 503/);
});

test('categoryColor maps categories to distinct hues with a gray fallback', () => {
  assert.notEqual(
    categoryColor('wildfires').red,
    categoryColor('floods').red,
    'distinct categories get distinct colors',
  );
  assert.equal(
    categoryColor('unknown-category').red,
    categoryColor(undefined).red,
    'unknown and absent share the fallback',
  );
  const first = categoryColor('volcanoes');
  const second = categoryColor('volcanoes');
  assert.notEqual(first, second, 'callers own their Color instance');
});

test('mapAnalystRecord is JSON-safe and null-safe', () => {
  const r = mapAnalystRecord(record(), 0);
  assert.equal(r.id, 'EONET_1');
  assert.equal(r.category, 'Wildfires');
  assert.equal(r.lat, 34.9);
  assert.equal(r.lon, -98.7);
  const missing = mapAnalystRecord({}, 3);
  assert.equal(missing.id, 'EONET-0003');
  assert.equal(missing.category, null);
  assert.deepEqual(JSON.parse(JSON.stringify(missing)), missing);
});

test('eonet layer lifecycle renders entities and reports stats', async () => {
  const dataSources = [];
  const viewer = {
    dataSources: {
      add(source) {
        dataSources.push(source);
      },
      remove() {
        return true;
      },
    },
  };
  const source = {
    getSnapshot: async () => [
      record(),
      record({ stableId: 'EONET_2', categoryId: 'floods' }),
    ],
  };
  const layer = createEonetLayer({ source });
  try {
    layer.init(viewer);
    layer.enable(viewer);
    assert.equal(await layer.update(viewer), true);
    const dataSource = dataSources[0];
    assert.equal(dataSource.entities.values.length, 2);
    assert.equal(layer.getStats().count, 2);
    assert.equal(layer.getAnalystRecords().length, 2);
    assert.equal(layer.getAnalystRecords()[1].id, 'EONET_2');
    layer.disable(viewer);
    assert.deepEqual(layer.getAnalystRecords(), []);
    assert.equal(layer.getStats().count, 2, 'count is retained while disabled');
  } finally {
    layer.destroy(viewer);
  }
});
