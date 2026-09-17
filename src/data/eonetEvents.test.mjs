import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EONET_EVENTS_API,
  EONET_DEFAULT_LIMIT,
  EONET_DEFAULT_STATUS,
  buildEonetEventsUrl,
  latestEonetPoint,
  normalizeEonetEvents,
  normalizeEonetLimit,
  normalizeEonetStatus,
  primaryEonetCategory,
} from './eonetEvents.js';
import { eonetProxy, fetchEonetEvents } from '../../server/providers/eonet.js';

/** A minimal valid EONET event; `over` overrides top-level fields. */
const event = (over = {}) => ({
  id: 'EONET_1',
  title: 'Wildfire Near Testville',
  description: 'A large fire',
  link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_1',
  closed: null,
  categories: [{ id: 'wildfires', title: 'Wildfires' }],
  geometry: [
    { type: 'Point', coordinates: [-98.6, 34.8], date: '2026-09-08T00:00:00Z' },
    { type: 'Point', coordinates: [-98.7, 34.9], date: '2026-09-09T00:00:00Z' },
  ],
  ...over,
});

test('status coerces to the allow-list and falls back on junk', () => {
  assert.equal(normalizeEonetStatus('open'), 'open');
  assert.equal(normalizeEonetStatus('CLOSED'), 'closed');
  assert.equal(normalizeEonetStatus('bogus'), EONET_DEFAULT_STATUS);
  assert.equal(normalizeEonetStatus(undefined), EONET_DEFAULT_STATUS);
});

test('URL builder pins status and limit parameters', () => {
  assert.equal(
    buildEonetEventsUrl({ status: 'open' }),
    `${EONET_EVENTS_API}?status=open&limit=500`,
  );
  assert.equal(
    buildEonetEventsUrl({ status: 'bogus' }),
    `${EONET_EVENTS_API}?status=open&limit=500`,
  );
  assert.equal(
    buildEonetEventsUrl({ limit: 20 }),
    `${EONET_EVENTS_API}?status=open&limit=20`,
  );
  assert.equal(normalizeEonetLimit(9999), 1000);
  assert.equal(normalizeEonetLimit('junk'), EONET_DEFAULT_LIMIT);
});

test('latestEonetPoint walks backward to the newest valid Point', () => {
  assert.deepEqual(
    latestEonetPoint([
      { type: 'Point', coordinates: [0, 0] },
      { type: 'Point', coordinates: [10, 20] },
    ]).coordinates,
    [10, 20],
  );
  assert.equal(latestEonetPoint(null), null);
  assert.equal(
    latestEonetPoint([{ type: 'Polygon', coordinates: [[[0, 0]]] }]),
    null,
  );
  assert.equal(latestEonetPoint([{ type: 'Point', coordinates: [200, 0] }]), null);
});

test('primaryEonetCategory picks the first category and falls back to id', () => {
  assert.deepEqual(
    primaryEonetCategory([
      { id: 'severeStorms', title: 'Severe Storms' },
      { id: 'floods', title: 'Floods' },
    ]),
    { id: 'severeStorms', title: 'Severe Storms' },
  );
  assert.deepEqual(primaryEonetCategory([{ id: 'floods' }]), {
    id: 'floods',
    title: 'floods',
  });
  assert.equal(primaryEonetCategory([]), null);
});

test('normalizeEonetEvents validates, uses the latest point, and dedupes', () => {
  const rows = normalizeEonetEvents({
    events: [
      event(),
      event(), // duplicate id
      event({ id: 'EONET_2', title: null, link: null }), // no title/url
      event({ id: 'EONET_3', geometry: [{ type: 'Polygon' }] }), // no point
      event({ id: 'EONET_4', closed: '2026-09-10T00:00:00Z' }),
    ],
  });
  assert.ok(Array.isArray(rows));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].stableId, 'EONET_1');
  assert.equal(rows[0].lon, -98.7, 'latest point wins');
  assert.equal(rows[0].category, 'Wildfires');
  assert.equal(rows[0].status, 'open');
  assert.equal(rows[1].status, 'closed');
});

test('normalizeEonetEvents rejects a malformed payload', () => {
  assert.equal(normalizeEonetEvents(null), null);
  assert.equal(normalizeEonetEvents({}), null);
  assert.equal(normalizeEonetEvents({ events: 'nope' }), null);
});

test('fetchEonetEvents normalizes a valid payload and rejects HTTP errors', async () => {
  const rows = await fetchEonetEvents({
    status: 'open',
    fetchImpl: async () => new Response(JSON.stringify({ events: [event()] })),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, 'Wildfires');

  await assert.rejects(
    fetchEonetEvents({
      fetchImpl: async () => new Response('unavailable', { status: 503 }),
    }),
    /EONET HTTP 503/,
  );
  await assert.rejects(
    fetchEonetEvents({
      fetchImpl: async () => new Response(JSON.stringify({})),
    }),
    /Malformed EONET response/,
  );
});

test('eonet proxy serves, caches, and honors the status filter', async () => {
  const routes = [];
  const plugin = eonetProxy({
    fetchImpl: async (url) => {
      const status = new URL(url).searchParams.get('status');
      return new Response(
        JSON.stringify({
          events: [
            event(),
            event({
              id: 'EONET_2',
              closed: status === 'closed' ? '2026-09-10T00:00:00Z' : null,
            }),
          ],
        }),
      );
    },
  });
  plugin.configureServer({
    middlewares: {
      use(path, handler) {
        routes.push({ path, handler });
      },
    },
  });
  assert.equal(routes.length, 1);
  assert.equal(routes[0].path, '/api/eonet/events');

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

  const first = await call('/api/eonet/events');
  assert.equal(first.status, 200);
  assert.equal(first.body.status, 'ready');
  assert.equal(first.body.count, 2);
  assert.equal(first.body.source, 'NASA EONET');
  assert.equal(first.body.events[0].category, 'Wildfires');

  const cached = await call('/api/eonet/events');
  assert.equal(cached.body.status, 'cached');
  assert.equal(cached.body.count, 2);

  const closed = await call('/api/eonet/events?status=closed');
  assert.equal(closed.body.filter, 'closed');

  const badMethod = await new Promise((resolve) => {
    const res = {
      writeHead(status) {
        this.status = status;
      },
      end(body) {
        resolve({ status: this.status, body: JSON.parse(body) });
      },
    };
    routes[0].handler({ method: 'POST', url: '/api/eonet/events' }, res);
  });
  assert.equal(badMethod.status, 405);
});
