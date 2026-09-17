import { test } from 'node:test';
import assert from 'node:assert/strict';
import createViteConfig, {
  fetchGdeltGeoNews,
  newsProxy,
} from '../../vite.config.js';
import {
  GDELT_GEO_API,
  GDELT_GEO_DEFAULT_TIMESPAN,
  buildGdeltGeoUrl,
  filterGdeltNewsToBbox,
  gdeltRecordInBbox,
  normalizeGdeltGeoFeatures,
  normalizeGdeltMaxPoints,
  normalizeGdeltNewsQuery,
  normalizeGdeltTimespan,
  parseGdeltBbox,
} from './gdeltNews.js';

/** A minimal valid GDELT GEO feature; `props` overrides properties, `top` the feature itself. */
const feature = (props = {}, top = {}) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [12.5, 41.9] },
  properties: {
    name: 'Rome',
    url: 'https://example.com/1',
    tone: 3.2,
    ...props,
  },
  ...top,
});

test('query sanitizer strips quotes/control chars and bounds length', () => {
  assert.equal(
    normalizeGdeltNewsQuery('  "attack" \u0007 on   port '),
    'attack on port',
  );
  assert.equal(normalizeGdeltNewsQuery(''), '');
  assert.equal(normalizeGdeltNewsQuery(null), '');
  assert.equal(normalizeGdeltNewsQuery('x'.repeat(500)).length, 140);
});

test('timespan coerces to the allow-list', () => {
  assert.equal(normalizeGdeltTimespan('1d'), '1d');
  assert.equal(normalizeGdeltTimespan('7D'), '7d');
  assert.equal(normalizeGdeltTimespan('bogus'), GDELT_GEO_DEFAULT_TIMESPAN);
  assert.equal(normalizeGdeltTimespan(undefined), GDELT_GEO_DEFAULT_TIMESPAN);
});

test('maxpoints clamps to [1, 1000] and falls back on junk', () => {
  assert.equal(normalizeGdeltMaxPoints(0), 1);
  assert.equal(normalizeGdeltMaxPoints(5000), 1000);
  assert.equal(normalizeGdeltMaxPoints('42'), 42);
  assert.equal(normalizeGdeltMaxPoints('junk'), 250);
});

test('URL builder requires a query and pins format=geojson', () => {
  assert.equal(buildGdeltGeoUrl({ query: '  ' }), null);
  assert.equal(
    buildGdeltGeoUrl({ query: 'cyber attack' }),
    `${GDELT_GEO_API}?query=cyber+attack&format=geojson&timespan=1d&maxpoints=250`,
  );
  assert.match(
    buildGdeltGeoUrl({ query: 'flood', timespan: '7d', maxpoints: 10 }),
    /format=geojson/,
  );
});

test('bbox parser rejects malformed boxes', () => {
  assert.deepEqual(
    parseGdeltBbox({ west: -10, south: 20, east: 10, north: 40 }),
    { west: -10, south: 20, east: 10, north: 40 },
  );
  assert.equal(
    parseGdeltBbox({ west: 10, south: 20, east: -10, north: 40 }),
    null,
  );
  assert.equal(
    parseGdeltBbox({ west: -190, south: 20, east: 10, north: 40 }),
    null,
  );
  assert.equal(parseGdeltBbox({ west: -10, south: 20, east: 10 }), null);
  assert.equal(
    parseGdeltBbox({ west: -10, south: 40, east: 10, north: 20 }),
    null,
  );
});

test('bbox filter keeps only points inside the box', () => {
  const bbox = { west: -10, south: 20, east: 10, north: 40 };
  assert.equal(gdeltRecordInBbox({ lon: 0, lat: 30 }, bbox), true);
  assert.equal(gdeltRecordInBbox({ lon: 50, lat: 30 }, bbox), false);
  assert.equal(gdeltRecordInBbox({ lon: 0 }, bbox), false);
  const records = [
    { lon: 0, lat: 30 },
    { lon: 50, lat: 30 },
  ];
  assert.equal(filterGdeltNewsToBbox(records, bbox).length, 1);
  assert.equal(filterGdeltNewsToBbox(records, null), records);
  assert.deepEqual(filterGdeltNewsToBbox(null, bbox), []);
});

test('normalizes geocoded features and extracts url/tone/location', () => {
  const rows = normalizeGdeltGeoFeatures({
    features: [feature(), feature({ url: 'https://example.com/2' })],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].lon, 12.5);
  assert.equal(rows[0].lat, 41.9);
  assert.equal(rows[0].url, 'https://example.com/1');
  assert.equal(rows[0].location, 'Rome');
  assert.equal(rows[0].tone, 3.2);
  assert.ok(rows[0].stableId.startsWith('news-'));
  assert.equal(rows[0].seenAt, null);
});

test('extracts url/title from the html anchor when url is absent', () => {
  const rows = normalizeGdeltGeoFeatures({
    features: [
      feature({
        url: undefined,
        html: '<a href="https://example.com/a" target="_blank">A headline</a>',
      }),
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, 'https://example.com/a');
  assert.equal(rows[0].title, 'A headline');
});

test('dedupes on url and drops mentions with no link or title', () => {
  const rows = normalizeGdeltGeoFeatures({
    features: [
      feature({ url: 'https://example.com/x' }),
      feature({ url: 'https://example.com/x' }),
      feature({ url: undefined, html: undefined, title: undefined }),
    ],
  });
  assert.equal(rows.length, 1);
});

test('clamps out-of-range tone and nulls non-numeric tone', () => {
  assert.equal(
    normalizeGdeltGeoFeatures({ features: [feature({ tone: 99 })] })[0].tone,
    20,
  );
  assert.equal(
    normalizeGdeltGeoFeatures({ features: [feature({ tone: 'loud' })] })[0]
      .tone,
    null,
  );
});

test('returns null on malformed payloads', () => {
  assert.equal(normalizeGdeltGeoFeatures(null), null);
  assert.equal(normalizeGdeltGeoFeatures({}), null);
  assert.equal(normalizeGdeltGeoFeatures({ features: 'nope' }), null);
  assert.equal(
    normalizeGdeltGeoFeatures({
      features: [
        feature(
          {},
          {
            geometry: {
              type: 'LineString',
              coordinates: [
                [0, 0],
                [1, 1],
              ],
            },
          },
        ),
      ],
    }),
    null,
  );
  assert.equal(
    normalizeGdeltGeoFeatures({
      features: [feature({}, { geometry: { coordinates: [200, 0] } })],
    }),
    null,
  );
  assert.equal(
    normalizeGdeltGeoFeatures({ features: [feature({}, { properties: [] })] }),
    null,
  );
});

test('gdelt news proxy installs dev and preview hooks', () => {
  const config = createViteConfig({ mode: 'test' });
  const byName = new Map(config.plugins.map((plugin) => [plugin.name, plugin]));
  assert.equal(
    typeof byName.get('gdelt-news-proxy')?.configureServer,
    'function',
  );
  assert.equal(
    typeof byName.get('gdelt-news-proxy')?.configurePreviewServer,
    'function',
  );
});

test('fetchGdeltGeoNews normalizes a valid payload and rejects HTTP errors', async () => {
  const rows = await fetchGdeltGeoNews({
    query: 'rome',
    fetchImpl: async () =>
      new Response(JSON.stringify({ features: [feature()] })),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].location, 'Rome');

  await assert.rejects(
    fetchGdeltGeoNews({
      query: 'rome',
      fetchImpl: async () => new Response('unavailable', { status: 503 }),
    }),
    /GDELT HTTP 503/,
  );
  await assert.rejects(fetchGdeltGeoNews({ query: '  ' }), /query is required/);
});

test('gdelt news handler validates input, serves, caches, and filters to bbox', async () => {
  const routes = [];
  const plugin = newsProxy({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          features: [feature(), feature({ url: 'https://example.com/2' })],
        }),
      ),
  });
  plugin.configureServer({
    middlewares: {
      use(path, handler) {
        routes.push({ path, handler });
      },
    },
  });
  assert.equal(routes.length, 1);
  assert.equal(routes[0].path, '/api/gdelt/news');

  const call = (url) =>
    new Promise((resolve) => {
      const res = {
        writeHead(status, headers) {
          this.status = status;
          this.headers = headers;
        },
        end(body) {
          resolve({ status: this.status, body: JSON.parse(body) });
        },
      };
      routes[0].handler(
        { method: 'GET', url, socket: { remoteAddress: '127.0.0.1' } },
        res,
      );
    });

  const missing = await call('/api/gdelt/news');
  assert.equal(missing.status, 400);

  const badBbox = await call('/api/gdelt/news?query=rome&bbox=not-a-box');
  assert.equal(badBbox.status, 400);

  const first = await call('/api/gdelt/news?query=rome');
  assert.equal(first.status, 200);
  assert.equal(first.body.status, 'ready');
  assert.equal(first.body.count, 2);
  assert.equal(first.body.source, 'GDELT GEO 2.0');
  assert.equal(first.body.records[0].location, 'Rome');

  const cached = await call('/api/gdelt/news?query=rome');
  assert.equal(cached.body.status, 'cached');
  assert.equal(cached.body.count, 2);

  const boxed = await call('/api/gdelt/news?query=rome&bbox=-20,20,20,60');
  assert.equal(boxed.body.count, 2);

  const boxedOut = await call('/api/gdelt/news?query=rome&bbox=80,0,90,10');
  assert.equal(boxedOut.body.count, 0);
});
