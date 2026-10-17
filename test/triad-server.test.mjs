import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { McpClient, READ_TOOLS, parseMcpResponse, unwrapTool, publicMessage } from '../server/mcp-client.mjs';
import { defaultModification, adaptMeal, menuCandidates, normalizeQuote, normalizeOffers } from '../server/menu-adapter.mjs';
import { createBridge, createTriadServer } from '../server/triad-server.mjs';

const store = { code: '1450713', name: '合成测试门店', address: '合成测试地址' };
const specs = [['5022', '猪柳蛋麦满分'], ['5889', '大脆鸡扒麦满分'], ['4825', '脆薯饼'], ['4437', '玉米杯'], ['505235', '德式图林根香肠'], ['520689', '鲜萃咖啡']];
const menu = { data: { meals: Object.fromEntries(specs.map(([id, name]) => [id, { name, currentPrice: '999', image: 'https://menu-img.mcd.cn/test.png', canWithOrder: false }])) } };
function fakeClient({ failQuote = false, extraProduct = false, menuSpecs = specs, roundsFor = new Set(), failDetail = false } = {}) {
  const calls = [];
  return { calls, token: 'private-test-token', connect: async () => ({ connected: true, tools: READ_TOOLS }), async call(tool, args) {
    calls.push({ tool, args });
    if (tool === 'query-nearby-stores') return { data: [{ storeCode: store.code, storeName: store.name, address: store.address, businessStatus: true }] };
    if (tool === 'query-meals') return { data: { meals: Object.fromEntries(menuSpecs.map(([id, name]) => [id, { name, currentPrice: '999', image: 'https://menu-img.mcd.cn/test.png', canWithOrder: false }])) } };
    if (tool === 'query-store-coupons') return { data: [{ title: '合成测试优惠', subtitle: '仅展示', code: 'must-not-leak', id: 'private-coupon-id' }] };
    if (tool === 'query-meal-detail') {
      if (failDetail) throw Error('官方详情读取失败');
      return { data: { code: args.code, name: menuSpecs.find(([id]) => id === args.code)[1], rounds: roundsFor.has(args.code) ? [{}] : [], supportModify: false, image: 'https://menu-img.mcd.cn/test.png' } };
    }
    if (tool === 'calculate-price') {
      if (failQuote) throw Error('官方测试失败 private-test-token');
      return { data: { price: 1234, originalPrice: 1400, discount: 166, packingPrice: 0, productList: [...args.items.map(item => ({ productCode: item.productCode, productName: '官方明细名', quantity: item.quantity, subtotal: 100 })), ...(extraProduct ? [{ productCode: 'extra', quantity: 1 }] : [])] } };
    }
    throw Error('未允许的测试 Tool');
  } };
}
async function contextFor(client) { const bridge = createBridge(client); await bridge.stores({ city: '上海', keyword: '人民广场' }); return { bridge, context: await bridge.context({ storeCode: store.code }) }; }

test('MCP JSON and SSE select JSON-RPC response without losing structured data', () => {
  assert.equal(parseMcpResponse('{"id":3,"result":{"a":1}}').result.a, 1);
  assert.equal(parseMcpResponse('event: message\r\ndata: {"jsonrpc":"2.0","id":3,"result":{"a":2}}\r\n\r\n', 'text/event-stream').result.a, 2);
  assert.throws(() => parseMcpResponse('data: not-json\n\n', 'text/event-stream'), /有效 JSON/);
});
test('Tool errors and business errors stop processing', () => {
  assert.throws(() => unwrapTool({ isError: true, content: [{ type: 'text', text: 'Tool 原始错误' }] }), /Tool 原始错误/);
  assert.throws(() => unwrapTool({ structuredContent: { code: 500, message: '业务失败', data: {} } }), /业务失败/);
  assert.deepEqual(unwrapTool({ content: [{ type: 'text', text: '{"code":200,"data":[]}' }] }).data, []);
});
test('MCP allowlist rejects mutations before any network request', async () => {
  let called = false; const client = new McpClient({ token: 'secret', fetchImpl: async () => { called = true; } });
  await assert.rejects(client.call('create-order', {}), /白名单/); assert.equal(called, false);
});
test('MCP handshake retains session headers, verifies response IDs and redacts token', async () => {
  const requests = [];
  const client = new McpClient({ token: 'test-secret', fetchImpl: async (url, init) => {
    const body = JSON.parse(init.body); requests.push({ url, headers: init.headers, body });
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    const result = body.method === 'initialize' ? { protocolVersion: '2024-11-05', serverInfo: { name: 'test' } } : body.method === 'tools/list' ? { tools: READ_TOOLS.map(name => ({ name })) } : { content: [{ type: 'text', text: '{"code":200,"data":[]}' }] };
    return new Response(JSON.stringify({ id: body.id, result }), { headers: { 'content-type': 'application/json', 'mcp-session-id': 'session-test' } });
  } });
  await client.call('query-nearby-stores', {});
  assert.equal(requests[1].headers['Mcp-Session-Id'], 'session-test'); assert.equal(requests.at(-1).url, 'https://mcp.mcd.cn');
  assert.equal(requests.at(-1).body.params.name, 'query-nearby-stores');
  assert.doesNotMatch(publicMessage('Bearer test-secret 手机13812345678 token=abc', 'test-secret'), /test-secret|13812345678|token=abc/);
  assert.doesNotMatch(publicMessage('{"couponCode":"private-code","userId":"private-user"}'), /private-code|private-user/);
  const bad = new McpClient({ token: 'secret', fetchImpl: async () => new Response('{"id":999,"result":{}}', { headers: { 'content-type': 'application/json' } }) });
  await assert.rejects(bad.rpc('initialize', {}), /ID 不匹配/);
});
test('Default modifications include both selected and unselected official keys', () => {
  const m = defaultModification({ supportModify: true, modification: { items: [{ minValues: 0, maxValues: 1, values: [{ code: 'a', selectedQuantity: 1, selectedKey: '0-1', maxQuantity: 1 }, { code: 'b', selectedQuantity: 0, unselectedKey: '0-0' }] }] } });
  assert.deepEqual(m.values, [{ code: 'a', key: '0-1', quantity: 1 }, { code: 'b', key: '0-0', quantity: 0 }]);
  assert.throws(() => defaultModification({ supportModify: true }), /缺少/);
});
test('Adapter rejects unverified rounds and price-bearing context fields', () => {
  const candidate = { id: '5022', name: '猪柳蛋麦满分', category: 'main', currentPrice: '999', image: 'https://menu-img.mcd.cn/test.png' };
  assert.equal(adaptMeal(candidate, { data: { code: '5022', name: candidate.name, rounds: [{}] } }), null);
  const item = adaptMeal(candidate, { data: { code: '5022', name: candidate.name, rounds: [], supportModify: false } });
  assert.equal('currentPrice' in item.public, false); assert.equal('price' in item.public, false);
  assert.throws(() => adaptMeal(candidate, { data: { code: 'other', name: '冒充', rounds: [] } }), /身份/);
});
test('Combo and with-order-only candidates cannot become standalone meals', () => {
  const pools = menuCandidates({ data: { meals: { ...menu.data.meals, '990': { name: '猪柳蛋麦满分套餐' }, '991': { name: '麦辣鸡腿汉堡', canWithOrder: true } } } });
  assert.equal(pools.main.some(item => ['990', '991'].includes(item.id)), false); assert.equal(pools.main.length, 2);
});
test('Main classification supports lunch names without the literal word hamburger', () => {
  const pools = menuCandidates({ data: { meals: { '1': { name: '巨无霸' }, '2': { name: '板烧鸡腿堡' }, '3': { name: '麦香鱼' } } } });
  assert.deepEqual(pools.main.map(item => item.name), ['巨无霸', '板烧鸡腿堡', '麦香鱼']);
});
test('Coupon normalization strips private IDs and coupon codes', () => {
  const offers = normalizeOffers({ data: [{ title: '名字', subtitle: '条件', code: 'secret-code', id: 'secret-id' }] });
  assert.deepEqual(offers, [{ title: '名字', conditionsText: '条件' }]);
  const official = normalizeOffers({ data: [{ title: '名字', couponCode: 'secret-code', tradeDateTime: '2026-10-17 - 2026-10-18', products: [{ productName: '玉米杯', productCode: '4437' }] }] });
  assert.match(official[0].conditionsText, /2026-10-17.*玉米杯/); assert.doesNotMatch(JSON.stringify(official), /secret-code|4437/);
  assert.match(normalizeOffers({ data: [{ title: '只有标题' }] })[0].conditionsText, /未提供完整使用条件/);
});
test('Quote validates identity and preserves only official integer cents', () => {
  const requested = [{ public: { id: '5022', name: '名字' } }];
  assert.throws(() => normalizeQuote({ data: { price: '123', productList: [] } }, requested, store), /整数分/);
  assert.throws(() => normalizeQuote({ data: { price: 123, productList: [{ productCode: 'wrong', quantity: 1 }] } }, requested, store), /编码/);
  const quote = normalizeQuote({ data: { price: 123, productList: [{ productCode: '5022', quantity: 1 }] } }, requested, store);
  assert.equal(quote.totalCents, 123); assert.equal('subtotalCents' in quote.items[0], false); assert.equal('originalCents' in quote, false);
});
test('Context queries live tools, conceals prices and carries no private coupon data', async () => {
  const client = fakeClient(); const { context } = await contextFor(client);
  assert.equal(context.source.kind, 'mcp'); assert.equal(context.mainOptions.length, 2); assert.equal(context.sideOptions.length, 3);
  assert.doesNotMatch(JSON.stringify(context), /999|must-not-leak|private-coupon-id/);
  assert.ok(client.calls.some(call => call.tool === 'query-meal-detail'));
  assert.deepEqual(context.replay, { mainFreshCount: 2, sideFreshCount: 3, exhausted: false });
});
test('Replay prioritizes unseen verified mains and sides with an independent session', async () => {
  const menuSpecs = [...specs, ['6001', '麦香鸡'], ['6002', '麦香鱼'], ['6003', '麦乐鸡(5块)'], ['6004', '香芋派'], ['6005', '脆香油条']];
  const client = fakeClient({ menuSpecs }), { bridge, context: first } = await contextFor(client);
  const second = await bridge.context({ storeCode: store.code, excludeMainIds: first.mainOptions.map(item => item.id), excludeSideIds: first.sideOptions.map(item => item.id) });
  assert.notEqual(second.sessionId, first.sessionId);
  assert.equal(second.mainOptions.some(item => first.mainOptions.some(prior => prior.id === item.id)), false);
  assert.equal(second.sideOptions.some(item => first.sideOptions.some(prior => prior.id === item.id)), false);
  assert.deepEqual(second.replay, { mainFreshCount: 2, sideFreshCount: 3, exhausted: false });
  await bridge.quote({ sessionId: first.sessionId, itemIds: [first.mainOptions[0].id, first.sideOptions[0].id, first.drink.id] });
  await bridge.quote({ sessionId: second.sessionId, itemIds: [second.mainOptions[1].id, second.sideOptions[0].id, second.drink.id] });
  assert.ok(second.mainOptions.concat(second.sideOptions).every(item => client.calls.some(call => call.tool === 'query-meal-detail' && call.args.code === item.id)));
});
test('Replay fills with verified seen items and reports partial freshness or exhaustion honestly', async () => {
  const client = fakeClient({ menuSpecs: [...specs, ['6001', '麦香鸡']] }), { bridge, context: first } = await contextFor(client);
  const body = { storeCode: store.code, excludeMainIds: first.mainOptions.map(item => item.id), excludeSideIds: first.sideOptions.map(item => item.id) };
  const second = await bridge.context(body);
  assert.deepEqual(second.replay, { mainFreshCount: 1, sideFreshCount: 0, exhausted: false });
  const third = await bridge.context({ ...body, excludeMainIds: [...body.excludeMainIds, '6001'] });
  assert.deepEqual(third.replay, { mainFreshCount: 0, sideFreshCount: 0, exhausted: true });
  assert.equal(third.mainOptions.length, 2); assert.equal(third.sideOptions.length, 3);
});
test('Replay deduplicates IDs, ignores prior time-slot IDs, and validates request limits before MCP work', async () => {
  const client = fakeClient(), { bridge, context: first } = await contextFor(client);
  const result = await bridge.context({ storeCode: store.code, excludeMainIds: [first.mainOptions[0].id, first.mainOptions[0].id, '123456789012345678901234'], excludeSideIds: ['123456789012345678901234'] });
  assert.equal(result.replay.mainFreshCount, 1); assert.equal(result.replay.sideFreshCount, 3);
  const cases = [null, '5022', [5022], [''], ['0a'], ['1'.repeat(25)], Array(61).fill('5022')];
  for (const field of ['excludeMainIds', 'excludeSideIds']) {
    for (const value of cases) {
      const count = client.calls.length;
      await assert.rejects(bridge.context({ storeCode: store.code, [field]: value }), error => error.status === 400);
      assert.equal(client.calls.length, count);
    }
  }
  await assert.rejects(bridge.context({ storeCode: store.code, excludeAnyIds: [] }), /未允许/);
  const boundary = await bridge.context({ storeCode: store.code, excludeMainIds: Array.from({ length: 60 }, (_, i) => String(100000 + i)) });
  assert.deepEqual(boundary.replay, { mainFreshCount: 2, sideFreshCount: 3, exhausted: false });
});
test('Replay searches past ten rejected details instead of claiming false exhaustion', async () => {
  const unavailable = Array.from({ length: 12 }, (_, i) => [String(7000 + i), `巨无霸${String(i).padStart(2, '0')}`]);
  const menuSpecs = [...unavailable, ...specs], client = fakeClient({ menuSpecs, roundsFor: new Set(unavailable.map(([id]) => id)) });
  const { context } = await contextFor(client);
  assert.equal(context.mainOptions.length, 2); assert.equal(context.replay.mainFreshCount, 2);
  assert.ok(client.calls.filter(call => call.tool === 'query-meal-detail').length > 10);
  assert.ok(context.mainOptions.every(item => !unavailable.some(([id]) => id === item.id)));
});
test('Replay stops safely at its detail-check bound and never falls back after upstream errors', async () => {
  const unavailable = Array.from({ length: 81 }, (_, i) => [String(7000 + i), `巨无霸${String(i).padStart(2, '0')}`]);
  const client = fakeClient({ menuSpecs: [...unavailable, ...specs], roundsFor: new Set(unavailable.map(([id]) => id)) }), bridge = createBridge(client);
  await bridge.stores({ city: '上海', keyword: '人民广场' });
  await assert.rejects(bridge.context({ storeCode: store.code }), error => error.status === 409 && /上限/.test(error.message));
  assert.equal(client.calls.filter(call => call.tool === 'query-meal-detail' && unavailable.some(([id]) => id === call.args.code)).length, 80);
  const failed = createBridge(fakeClient({ failDetail: true })); await failed.stores({ city: '上海', keyword: '人民广场' });
  await assert.rejects(failed.context({ storeCode: store.code }), /官方详情读取失败/);
});
test('Quote sends exact single portions without coupon fields and locks main/drink', async () => {
  const client = fakeClient(); const { bridge, context } = await contextFor(client);
  const ids = [context.mainOptions[0].id, context.sideOptions[0].id, context.drink.id];
  const first = await bridge.quote({ sessionId: context.sessionId, itemIds: ids }); assert.equal(first.totalCents, 1234);
  await bridge.quote({ sessionId: context.sessionId, itemIds: [ids[0], context.sideOptions[1].id, ids[2]] });
  await assert.rejects(bridge.quote({ sessionId: context.sessionId, itemIds: [context.mainOptions[1].id, ids[1], ids[2]] }), /锁定/);
  const requests = client.calls.filter(call => call.tool === 'calculate-price');
  assert.equal(requests.length, 2); assert.ok(requests.every(call => call.args.items.every(item => item.quantity === 1 && !('couponCode' in item))));
  await assert.rejects(bridge.quote({ sessionId: context.sessionId, itemIds: ids, rawTool: 'create-order' }), /未允许/);
});
test('Expired sessions and upstream failures never produce a fallback quote', async () => {
  const client = fakeClient({ failQuote: true }); const { bridge, context } = await contextFor(client);
  await assert.rejects(bridge.quote({ sessionId: context.sessionId, itemIds: [context.mainOptions[0].id, context.sideOptions[0].id, context.drink.id] }), /官方测试失败/);
  await assert.rejects(bridge.quote({ sessionId: 'unknown', itemIds: [] }), /过期/);
  let time = 0; const timed = createBridge(fakeClient(), { now: () => time });
  await timed.stores({ city: '上海', keyword: '人民广场' }); const old = await timed.context({ storeCode: store.code }); time = 31 * 60 * 1000;
  await assert.rejects(timed.quote({ sessionId: old.sessionId, itemIds: [old.mainOptions[0].id, old.sideOptions[0].id, old.drink.id] }), /过期/);
});

test('Image proxy only reads verified session images without credentials and caches bytes', async () => {
  const requests = [];
  const bridge = createBridge(fakeClient(), { imageFetch: async (url, init) => { requests.push({ url: String(url), init }); return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }); } });
  await bridge.stores({ city: '上海', keyword: '人民广场' }); const context = await bridge.context({ storeCode: store.code });
  const image = await bridge.image(context.sessionId, '505235'); assert.equal(image.contentType, 'image/png'); assert.equal(image.bytes.length, 3);
  await bridge.image(context.sessionId, '505235'); assert.equal(requests.length, 1); assert.equal(requests[0].init.headers.Authorization, undefined);
  assert.ok(requests[0].url.startsWith('https://menu-img.mcd.cn/'));
  await assert.rejects(bridge.image(context.sessionId, '5022'), /没有该官方远程图片/);
  await assert.rejects(bridge.image(context.sessionId, 'not-in-session'), /没有该官方远程图片/);
});
test('Image proxy rejects executable types and oversized responses', async () => {
  for (const headers of [{ 'content-type': 'image/svg+xml' }, { 'content-type': 'image/png', 'content-length': String(4 * 1024 * 1024) }]) {
    const bridge = createBridge(fakeClient(), { imageFetch: async () => new Response('x', { headers }) }); await bridge.stores({ city: '上海', keyword: '人民广场' }); const context = await bridge.context({ storeCode: store.code });
    await assert.rejects(bridge.image(context.sessionId, '505235'), /类型不受支持|3 MB/);
  }
});

async function httpFixture(t) {
  const server = createTriadServer({ client: fakeClient() }); server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => { server.closeAllConnections(); server.close(); });
  const port = server.address().port;
  const send = (path, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers }, res => { let text = ''; res.setEncoding('utf8'); res.on('data', chunk => text += chunk); res.on('end', () => resolve({ status: res.statusCode, text, headers: res.headers })); }); req.on('error', reject); req.end(body);
  });
  return { send, port };
}
test('Local server rejects foreign Host and cross-origin requests', async t => {
  const { send } = await httpFixture(t);
  assert.equal((await send('/api/health', { headers: { Host: 'evil.example' } })).status, 403);
  assert.equal((await send('/api/health', { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await send('/api/health')).status, 200);
});
test('Local server denies source/secrets/traversal and limits JSON requests', async t => {
  const { send } = await httpFixture(t);
  for (const path of ['/server/mcp-client.mjs', '/.git/config', '/assets/%2e%2e/server/mcp-client.mjs', '/mcp-config-example.json']) assert.equal((await send(path)).status, 404);
  assert.equal((await send('/api/stores', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await send('/api/stores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad}' })).status, 400);
  assert.equal((await send('/api/stores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city: 'a'.repeat(9000) }) })).status, 413);
});
async function publicFixture(t, access) {
  const server = createTriadServer({ client: fakeClient(), access }); server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => { server.closeAllConnections(); server.close(); });
  const port = server.address().port;
  const send = (path, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers }, res => { let text = ''; res.setEncoding('utf8'); res.on('data', chunk => text += chunk); res.on('end', () => resolve({ status: res.statusCode, text, headers: res.headers })); }); req.on('error', reject); req.end(body);
  });
  return { send };
}
test('Public deployment rejects hosts outside the configured allowlist', async t => {
  const { send } = await publicFixture(t, { publicMode: true, allowedHosts: ['triad.example'] });
  assert.equal((await send('/api/health', { headers: { Host: 'evil.example' } })).status, 403);
  assert.equal((await send('/api/health', { headers: { Host: 'triad.example' } })).status, 200);
});
test('Public deployment honours an explicit origin allowlist', async t => {
  const { send } = await publicFixture(t, { publicMode: true, allowedOrigins: ['https://triad.example'], trustProxy: true });
  assert.equal((await send('/api/health', { headers: { Host: '10.0.0.5:8780', Origin: 'https://triad.example' } })).status, 200);
  assert.equal((await send('/api/health', { headers: { Host: '10.0.0.5:8780', Origin: 'https://evil.example' } })).status, 403);
});
test('Public deployment without an allowlist survives a proxy that rewrites Host but still rejects cross-site fetches', async t => {
  const { send } = await publicFixture(t, { publicMode: true, trustProxy: true });
  assert.equal((await send('/api/health', { headers: { Host: '10.0.0.5:8780', Origin: 'https://mcmultiverse-triad.app.workbuddy.host', 'Sec-Fetch-Site': 'same-origin' } })).status, 200);
  assert.equal((await send('/api/health', { headers: { Host: '10.0.0.5:8780', Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
});
test('Public deployment throttles bursts per client IP', async t => {
  const { send } = await publicFixture(t, { publicMode: true, trustProxy: true, rateLimit: { limit: 2, windowMs: 60000 } });
  for (const expected of [200, 200, 429]) assert.equal((await send('/api/health', { headers: { Host: 'triad.example', 'X-Forwarded-For': '203.0.113.9' } })).status, expected);
  assert.equal((await send('/api/health', { headers: { Host: 'triad.example', 'X-Forwarded-For': '198.51.100.7' } })).status, 200);
});
test('Public deployment caps concurrent rounds per client IP', async t => {
  const bridge = createBridge(fakeClient(), { maxSessionsPerIp: 1 });
  await bridge.stores({ city: '上海', keyword: '人民广场' });
  await bridge.context({ storeCode: store.code }, { ip: '203.0.113.9' });
  await assert.rejects(bridge.context({ storeCode: store.code }, { ip: '203.0.113.9' }), /同一网络开过的局过多/);
  assert.ok(await bridge.context({ storeCode: store.code }, { ip: '198.51.100.7' }));
});
