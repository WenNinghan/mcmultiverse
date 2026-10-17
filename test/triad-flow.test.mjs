import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSession, choose, getOriginalIds, setOriginalQuote, replaceSide
} from '../assets/triad-core.mjs';
import { createQuoteCoordinator } from '../assets/triad-flow.mjs';

// Deliberately synthetic contracts: no fixtures or prices enter the page.
const time = '2026-10-17T03:00:00.000Z';
const store = { code: 'flow-store', name: '自动报价合成测试门店' };
const item = id => ({ id, name: `合成餐品 ${id}`, image: `assets/menu/${id}.png` });
const officialQuote = (ids, totalCents = 3000, extra = {}) => ({
  source: { kind: 'mcp', tool: 'calculate-price' }, store,
  quotedAt: time, totalCents, items: ids.map(id => ({ id, quantity: 1 })), ...extra
});
function snapshot(sideId = 'side-b') {
  let session = createSession({
    sessionId: 'flow-session', store,
    mainOptions: [item('main-a'), item('main-b')],
    sideOptions: [item('side-a'), item('side-b'), item('side-c')],
    drink: item('drink'), source: { kind: 'mcp', fetchedAt: time }
  });
  session = choose(choose(session, 'main', 'main-a'), 'side', 'side-a');
  session = setOriginalQuote(session, officialQuote(getOriginalIds(session)));
  return replaceSide(session, sideId);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function controlled() {
  const requests = [], events = [];
  const coordinator = createQuoteCoordinator({
    quote(request) {
      const task = deferred();
      requests.push({ ...task, request });
      return task.promise;
    },
    onStart: current => events.push({ type: 'start', snapshot: current }),
    onResult: (session, current) => events.push({ type: 'result', session, snapshot: current }),
    onError: (error, current) => events.push({ type: 'error', error, snapshot: current }),
    onSettled: current => events.push({ type: 'settled', snapshot: current })
  });
  return { coordinator, requests, events };
}
const flush = () => Promise.resolve();
function resolveQuote(request, totalCents = 3000, extra = {}) {
  request.resolve(officialQuote(request.request.itemIds, totalCents, extra));
}

test('starts synchronously, quotes A before B and applies the exact immutable snapshot', async () => {
  const { coordinator, requests, events } = controlled();
  const current = snapshot();
  const result = coordinator.run(current);
  assert.deepEqual(events, [{ type: 'start', snapshot: current }]);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].request, { sessionId: 'flow-session', itemIds: ['main-a', 'side-a', 'drink'] });
  resolveQuote(requests[0], 3100);
  await flush();
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].request, { sessionId: 'flow-session', itemIds: ['main-a', 'side-b', 'drink'] });
  resolveQuote(requests[1], 3300);
  const applied = await result;
  assert.equal(applied.status, 'applied');
  assert.deepEqual(events.map(event => event.type), ['start', 'result', 'settled']);
  assert.equal(events[1].snapshot, current);
  assert.equal(events[1].session, applied.session);
  assert.equal(applied.session.comparison.deltaCents, 200);
  assert.equal(applied.session.comparison.baselineChangedCents, 100);
  assert.equal(applied.session.originalQuote.totalCents, 3000);
  assert.deepEqual(applied.session.selection, current.selection);
  assert.equal(applied.session.replacementSideId, 'side-b');
  assert.equal(current.comparison, null);
  assert.ok(Object.isFrozen(applied.session.comparison));
});

test('rapid replacements retire an older A before it can send B', async () => {
  const { coordinator, requests, events } = controlled();
  const older = snapshot('side-b'), newer = snapshot('side-c');
  const first = coordinator.run(older);
  const second = coordinator.run(newer);
  resolveQuote(requests[1], 3200);
  await flush();
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[2].request.itemIds, ['main-a', 'side-c', 'drink']);
  resolveQuote(requests[2], 3100);
  const latest = await second;
  resolveQuote(requests[0], 1000);
  assert.deepEqual(await first, { status: 'stale' });
  assert.equal(requests.length, 3);
  assert.equal(latest.session.replacementSideId, 'side-c');
  assert.equal(latest.session.comparison.deltaCents, -100);
  assert.deepEqual(events.map(event => [event.type, event.snapshot.replacementSideId]), [
    ['start', 'side-b'], ['start', 'side-c'], ['result', 'side-c'], ['settled', 'side-c']
  ]);
});

test('an older B arriving after the latest B cannot replace its comparison or settle its spinner', async () => {
  const { coordinator, requests, events } = controlled();
  const first = coordinator.run(snapshot('side-b'));
  resolveQuote(requests[0], 3000);
  await flush();
  const second = coordinator.run(snapshot('side-c'));
  resolveQuote(requests[2], 3100);
  await flush();
  resolveQuote(requests[3], 3300);
  const latest = await second;
  resolveQuote(requests[1], 100);
  assert.deepEqual(await first, { status: 'stale' });
  assert.equal(latest.session.comparison.deltaCents, 200);
  assert.equal(events.filter(event => event.type === 'result').length, 1);
  assert.equal(events.filter(event => event.type === 'settled').length, 1);
  assert.equal(events.find(event => event.type === 'result').snapshot.replacementSideId, 'side-c');
});

for (const phase of ['A', 'B']) {
  test(`a stale ${phase} failure cannot surface an error or settle a newer request`, async () => {
    const { coordinator, requests, events } = controlled();
    const first = coordinator.run(snapshot('side-b'));
    if (phase === 'B') { resolveQuote(requests[0]); await flush(); }
    const olderRequest = requests.at(-1);
    const second = coordinator.run(snapshot('side-c'));
    const latestA = requests.at(-1);
    olderRequest.reject(new Error(`stale ${phase} transport failure`));
    assert.deepEqual(await first, { status: 'stale' });
    assert.deepEqual(events.map(event => event.type), ['start', 'start']);
    resolveQuote(latestA, 3100);
    await flush();
    resolveQuote(requests.at(-1), 3200);
    assert.equal((await second).status, 'applied');
    assert.deepEqual(events.map(event => event.type), ['start', 'start', 'result', 'settled']);
  });

  test(`cancel during ${phase} invalidates all callbacks and a later run still works`, async () => {
    const { coordinator, requests, events } = controlled();
    const cancelled = coordinator.run(snapshot());
    if (phase === 'B') { resolveQuote(requests[0]); await flush(); }
    const cancelledRequest = requests.at(-1);
    const count = requests.length;
    coordinator.cancel();
    assert.deepEqual(events.map(event => event.type), ['start']);
    resolveQuote(cancelledRequest, 1);
    assert.deepEqual(await cancelled, { status: 'stale' });
    assert.equal(requests.length, count);
    assert.deepEqual(events.map(event => event.type), ['start']);
    const next = coordinator.run(snapshot('side-c'));
    resolveQuote(requests.at(-1), 3200);
    await flush();
    resolveQuote(requests.at(-1), 3100);
    assert.equal((await next).session.comparison.deltaCents, -100);
    assert.deepEqual(events.map(event => event.type), ['start', 'start', 'result', 'settled']);
  });

  test(`current ${phase} failure is reported once and retry requotes both plates`, async () => {
    const { coordinator, requests, events } = controlled();
    const current = snapshot();
    const first = coordinator.run(current);
    if (phase === 'B') { resolveQuote(requests[0], 3300); await flush(); }
    const failure = new Error(`${phase} quote unavailable`);
    requests.at(-1).reject(failure);
    assert.deepEqual(await first, { status: 'error' });
    assert.deepEqual(events.map(event => event.type), ['start', 'error', 'settled']);
    assert.equal(events[1].error, failure);
    assert.equal(events[1].snapshot, current);
    assert.equal(current.comparison, null);
    const count = requests.length;
    const retry = coordinator.run(current);
    assert.equal(requests.length, count + 1);
    assert.deepEqual(requests.at(-1).request.itemIds, ['main-a', 'side-a', 'drink']);
    resolveQuote(requests.at(-1), 3500);
    await flush();
    assert.deepEqual(requests.at(-1).request.itemIds, ['main-a', 'side-b', 'drink']);
    resolveQuote(requests.at(-1), 3600);
    const applied = await retry;
    assert.equal(applied.status, 'applied');
    assert.equal(applied.session.comparison.deltaCents, 100);
    assert.equal(applied.session.comparison.baselineChangedCents, 500);
    assert.deepEqual(events.map(event => event.type), ['start', 'error', 'settled', 'start', 'result', 'settled']);
  });
}

test('only core-validated official quotes are applied', async () => {
  const { coordinator, requests, events } = controlled();
  const current = snapshot();
  const pending = coordinator.run(current);
  resolveQuote(requests[0]);
  await flush();
  resolveQuote(requests[1], 2000, { source: { kind: 'demo', tool: 'calculate-price' } });
  assert.deepEqual(await pending, { status: 'error' });
  assert.deepEqual(events.map(event => event.type), ['start', 'error', 'settled']);
  assert.match(events[1].error.message, /真实报价/);
  assert.equal(current.comparison, null);
});

test('an onStart cancellation prevents any network request', async () => {
  let calls = 0;
  const events = [];
  const coordinator = createQuoteCoordinator({
    quote() { calls += 1; throw new Error('should not run'); },
    onStart() { events.push('start'); coordinator.cancel(); },
    onResult() { events.push('result'); },
    onError() { events.push('error'); },
    onSettled() { events.push('settled'); }
  });
  assert.deepEqual(await coordinator.run(snapshot()), { status: 'stale' });
  assert.equal(calls, 0);
  assert.deepEqual(events, ['start']);
});
