// 线上冒烟：用真实公开 URL 走一遍只读链路，确认查价、图片代理可用且没有凭证泄漏。
// 用法：TRIAD_BASE=https://你的域名 node tools/online-smoke.mjs
const BASE = (process.env.TRIAD_BASE || 'https://mcmultiverse-triad.app.workbuddy.host').replace(/\/+$/, '');
const secrets = ['MCD_MCP_TOKEN', 'Bearer ', 'mcp-session-id', 'couponCode'];

async function post(path, body) {
  const response = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
}
async function get(path) {
  const response = await fetch(`${BASE}${path}`, { headers: { Origin: BASE } });
  const buffer = Buffer.from(await response.arrayBuffer());
  return { status: response.status, buffer, headers: response.headers };
}
function check(label, ok, detail = '') { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`); return ok; }
function noLeak(label, text) {
  const leaked = secrets.filter(secret => text.includes(secret));
  return check(`${label}（无凭证泄漏）`, leaked.length === 0, leaked.length ? `命中 ${leaked.join(',')}` : '');
}

const results = [];
const health = await get('/api/health');
const healthJson = (() => { try { return JSON.parse(health.buffer.toString('utf8')); } catch { return null; } })();
results.push(check('/api/health 连通', health.status === 200 && healthJson?.connected === true, `HTTP ${health.status} / ${healthJson?.tools?.length || 0} 个只读工具`));
results.push(noLeak('/api/health', health.buffer.toString('utf8')));

const stores = await post('/api/stores', { city: '上海', keyword: '人民广场' });
const store = stores.json?.stores?.[0];
results.push(check('/api/stores 返回官方门店', stores.status === 200 && !!store, `${stores.json?.stores?.length || 0} 家`));
results.push(noLeak('/api/stores', stores.text));

const context = await post('/api/context', { storeCode: store.code });
const ctx = context.json;
results.push(check('/api/context 开局', context.status === 200 && ctx?.mainOptions?.length >= 2 && ctx?.sideOptions?.length >= 2, `主食 ${ctx?.mainOptions?.length || 0} / 配餐 ${ctx?.sideOptions?.length || 0}`));
results.push(noLeak('/api/context', context.text));
results.push(check('/api/context 不预先泄露价格', !/currentPrice|price["']?\s*[:=]\s*\d/.test(context.text)));

const itemIds = [ctx.mainOptions[0].id, ctx.sideOptions[0].id, ctx.drink.id];
const quote = await post('/api/quote', { sessionId: ctx.sessionId, itemIds });
const total = quote.json?.totalCents;
results.push(check('/api/quote 真实报价', quote.status === 200 && Number.isInteger(total), total ? `整盘 ¥${(total / 100).toFixed(2)}` : `HTTP ${quote.status}`));
results.push(check('/api/quote 整数分', Number.isInteger(total) && total > 0));
results.push(noLeak('/api/quote', quote.text));

// 有本地核验图时前端直接用本地资源，只有远程官方图才走图片代理；两条路都要在线上可用。
const remoteItem = [...ctx.mainOptions, ...ctx.sideOptions, ctx.drink].find(item => item.image.startsWith('https://'));
if (remoteItem) {
  const image = await get(`/api/menu-image/${ctx.sessionId}/${remoteItem.id}`);
  const type = image.headers.get('content-type') || '';
  const ok = image.status === 200 && type.startsWith('image/') && image.buffer.length > 1000;
  results.push(check('/api/menu-image 图片代理', ok, ok ? `${type} ${image.buffer.length}B` : `HTTP ${image.status} ${image.buffer.toString('utf8').slice(0, 160)}`));
} else {
  results.push(check('本局餐品全部使用本地核验图（无需代理）', true, '跳过代理测试'));
}
for (const item of [ctx.mainOptions[0], ctx.sideOptions[0], ctx.drink]) {
  if (item.image.startsWith('assets/')) {
    const local = await get(`/${item.image}`);
    results.push(check(`本地餐品图可访问 ${item.name}`, local.status === 200 && local.buffer.length > 1000, `HTTP ${local.status} ${local.buffer.length}B`));
  }
}

console.log(`\n门店：${store?.name}（${store?.code}）`);
console.log(`餐盘：${ctx.mainOptions?.[0]?.name} ＋ ${ctx.sideOptions?.[0]?.name} ＋ ${ctx.drink?.name}`);
console.log(`\n${results.every(Boolean) ? '全部通过' : '存在失败项'}：${results.filter(Boolean).length}/${results.length}`);
process.exitCode = results.every(Boolean) ? 0 : 1;
