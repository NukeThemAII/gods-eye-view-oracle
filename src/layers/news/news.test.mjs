import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNewsRecords, NEWS_MAX_RECORDS } from './records.js';
import { createGdeltNewsSource, DEFAULT_NEWS_QUERIES } from './source.js';
import { toneColor, mapAnalystRecord } from './model.js';
import { createNewsLayer } from './index.js';

const record = (over = {}) => ({
  stableId: 'news-1',
  lon: 12.5,
  lat: 41.9,
  title: 'A headline',
  url: 'https://example.com/a',
  location: 'Rome',
  tone: 1.5,
  seenAt: null,
  ...over,
});

test('normalizeNewsRecords validates and dedupes server records', () => {
  assert.deepEqual(normalizeNewsRecords(null), []);
  const rows = normalizeNewsRecords([
    record(),
    record(), // duplicate stableId
    record({ stableId: 'news-2', lon: 200 }), // out-of-range lon
    record({ stableId: 'news-3', lat: 91 }), // out-of-range lat
    record({ stableId: 'news-4', title: null, url: null }), // no title/url
    record({ stableId: 'news-5', lon: null }), // null lon coerced, must drop
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stableId, 'news-1');
  assert.equal(rows[0].tone, 1.5);
});

test('normalizeNewsRecords clamps the budget and fills fallback ids', () => {
  const rows = normalizeNewsRecords(
    [
      { lon: 0, lat: 0, title: 'x' },
      { lon: 1, lat: 1, title: 'y' },
    ],
    1,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stableId, 'news-0');
  assert.equal(NEWS_MAX_RECORDS, 1000);
});

test('source fans out across queries, merges and de-duplicates', async () => {
  const calls = [];
  const source = createGdeltNewsSource({
    queries: ['a', 'b'],
    proxyPath: '/api/gdelt/news',
    fetchImpl: async (url) => {
      calls.push(url);
      const query = new URL(url, 'http://x').searchParams.get('query');
      return new Response(
        JSON.stringify({
          records: [
            record({ stableId: `news-${query}`, title: query }),
            record({ stableId: 'shared' }),
          ],
        }),
      );
    },
  });
  const rows = await source.getSnapshot();
  assert.equal(calls.length, 2);
  assert.equal(
    rows.length,
    3,
    'the shared mention is de-duplicated across queries',
  );
  assert.ok(DEFAULT_NEWS_QUERIES.length >= 3);
});

test('source rejects a non-OK upstream response', async () => {
  const source = createGdeltNewsSource({
    queries: ['a'],
    proxyPath: '/api/gdelt/news',
    fetchImpl: async () => new Response('unavailable', { status: 503 }),
  });
  await assert.rejects(source.getSnapshot(), /GDELT HTTP 503/);
});

test('toneColor maps sentiment to red/gray/green', () => {
  assert.equal(toneColor(null).red, toneColor(0).red);
  assert.equal(toneColor(undefined).red, toneColor(0).red);
  assert.ok(toneColor(-10).red > toneColor(0).red, 'negative → more red');
  assert.ok(toneColor(-10).green < toneColor(0).green);
  assert.ok(toneColor(10).green > toneColor(0).green, 'positive → more green');
});

test('mapAnalystRecord is JSON-safe and null-safe', () => {
  const r = mapAnalystRecord(record(), 0);
  assert.equal(r.id, 'news-1');
  assert.equal(r.tone, 1.5);
  assert.equal(r.lat, 41.9);
  assert.equal(r.lon, 12.5);
  const missing = mapAnalystRecord({}, 3);
  assert.equal(missing.id, 'NEWS-0003');
  assert.equal(missing.tone, null);
  assert.deepEqual(JSON.parse(JSON.stringify(missing)), missing);
});

test('news layer lifecycle renders entities and reports stats', async () => {
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
      record({ stableId: 'news-2', tone: -5 }),
    ],
  };
  const layer = createNewsLayer({ source });
  try {
    layer.init(viewer);
    layer.enable(viewer);
    assert.equal(await layer.update(viewer), true);
    const dataSource = dataSources[0];
    assert.equal(dataSource.entities.values.length, 2);
    assert.equal(layer.getStats().count, 2);
    assert.equal(layer.getAnalystRecords().length, 2);
    assert.equal(layer.getAnalystRecords()[1].id, 'news-2');
    layer.disable(viewer);
    assert.deepEqual(layer.getAnalystRecords(), []);
    assert.equal(layer.getStats().count, 2, 'count is retained while disabled');
  } finally {
    layer.destroy(viewer);
  }
});

test('news layer degrades (stays enabled) instead of rejecting on a source error', async () => {
  const dataSources = [];
  const viewer = {
    dataSources: { add(s) { dataSources.push(s); }, remove() { return true; } },
  };
  const source = {
    getSnapshot: async () => {
      throw new Error('GDELT HTTP 503');
    },
  };
  const layer = createNewsLayer({ source });
  try {
    layer.init(viewer);
    layer.enable(viewer);
    assert.equal(
      await layer.update(viewer),
      true,
      'a transient source error degrades instead of rejecting the lifecycle',
    );
    assert.equal(layer.getStats().error, 'GDELT HTTP 503');
    assert.equal(layer.getStats().count, 0);
  } finally {
    layer.destroy(viewer);
  }
});
