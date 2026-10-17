import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { McpClient, loadToken, publicMessage } from './mcp-client.mjs';
import { normalizeStores, menuCandidates, localImages, adaptMeal, normalizeOffers, normalizeQuote } from './menu-adapter.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BODY = 8192;
const SESSION_TTL = 30 * 60 * 1000;
const MAX_EXCLUDED_ITEMS = 60;
const MAX_DETAIL_CHECKS = 80;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
function exactKeys(body, allowed) { if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(key => !allowed.includes(key))) throw new HttpError(400, '请求包含未允许的字段。'); }
function searchText(value, label) { if (typeof value !== 'string' || !value.trim() || value.trim().length > 60 || /[\x00-\x1f]/.test(value)) throw new HttpError(400, `${label}应为 1 至 60 个字符。`); return value.trim(); }
function storeCode(value) { if (typeof value !== 'string' || !/^\d{1,16}$/.test(value)) throw new HttpError(400, '门店编码无效。'); return value; }
function excludedIds(value, label) {
  if (value === undefined) return new Set();
  if (!Array.isArray(value) || value.length > MAX_EXCLUDED_ITEMS || value.some(id => typeof id !== 'string' || !/^\d{1,24}$/.test(id))) throw new HttpError(400, `${label}须为最多 60 个数字商品编码组成的数组。`);
  return new Set(value);
}

export function createBridge(client, { root = PROJECT_ROOT, now = Date.now, imageFetch = fetch, maxSessionsPerIp = 0 } = {}) {
  const stores = new Map(), sessions = new Map();
  const imagesPromise = localImages(root);
  function clean() { for (const [id, session] of sessions) if (now() - session.createdAt > SESSION_TTL) sessions.delete(id); }
  return {
    health: () => client.connect(),
    async stores(body) {
      exactKeys(body, ['city', 'keyword']);
      const city = searchText(body.city, '城市'), keyword = searchText(body.keyword, '门店关键词');
      const list = normalizeStores(await client.call('query-nearby-stores', { beType: 1, searchType: 2, city, keyword }));
      for (const store of list) stores.set(store.code, store);
      return { stores: list, source: { kind: 'mcp', tool: 'query-nearby-stores', fetchedAt: new Date(now()).toISOString() } };
    },
    async context(body, meta = {}) {
      exactKeys(body, ['storeCode', 'excludeMainIds', 'excludeSideIds']);
      const excluded = { main: excludedIds(body.excludeMainIds, '已见主食'), side: excludedIds(body.excludeSideIds, '已见配餐'), drink: new Set() };
      const code = storeCode(body.storeCode), store = stores.get(code);
      if (!store) throw new HttpError(400, '请先搜索并选择官方返回的门店。');
      clean(); if (sessions.size >= 64) throw new HttpError(429, '同时试玩的局数过多，请稍后重试。');
      if (maxSessionsPerIp > 0) { let owned = 0; for (const existing of sessions.values()) if (existing.ip && existing.ip === meta.ip) owned += 1; if (owned >= maxSessionsPerIp) throw new HttpError(429, '同一网络开过的局过多，请稍后再试。'); }
      const base = { storeCode: code, orderType: 1, beType: 1 };
      const pools = menuCandidates(await client.call('query-meals', base));
      const images = await imagesPromise;
      async function select(category, count) {
        const result = [], candidates = [...pools[category].filter(item => !excluded[category].has(item.id)), ...pools[category].filter(item => excluded[category].has(item.id))];
        let checked = 0;
        for (const candidate of candidates) {
          if (checked++ >= MAX_DETAIL_CHECKS) throw new HttpError(409, '本局餐品详情核验达到上限，无法确认足够的独立单品，请更换门店后重试。');
          const item = adaptMeal(candidate, await client.call('query-meal-detail', { ...base, code: candidate.id }), images);
          if (item) result.push(item);
          if (result.length === count) break;
        }
        return result;
      }
      const [mains, sides, drinks, offersPayload] = await Promise.all([select('main', 2), select('side', 3), select('drink', 1), client.call('query-store-coupons', base)]);
      if (mains.length < 2 || sides.length < 2 || drinks.length < 1) throw new HttpError(409, '这家门店当前时段缺少足够的可核验单品，请更换门店后再开局。');
      const all = [...mains, ...sides, ...drinks];
      const sessionId = randomUUID();
      sessions.set(sessionId, { createdAt: now(), ip: meta.ip || '', store, base, items: new Map(all.map(item => [item.public.id, item])), mains: mains.map(item => item.public.id), sides: sides.map(item => item.public.id), drink: drinks[0].public.id, lock: null, pending: Promise.resolve(), imageCache: new Map() });
      const mainFreshCount = mains.filter(item => !excluded.main.has(item.public.id)).length, sideFreshCount = sides.filter(item => !excluded.side.has(item.public.id)).length;
      return { sessionId, store: { code: store.code, name: store.name, address: store.address }, mainOptions: mains.map(item => item.public), sideOptions: sides.map(item => item.public), drink: drinks[0].public, replay: { mainFreshCount, sideFreshCount, exhausted: mainFreshCount === 0 && sideFreshCount === 0 }, offers: normalizeOffers(offersPayload), source: { kind: 'mcp', fetchedAt: new Date(now()).toISOString() } };
    },
    async image(sessionId, itemId) {
      clean(); const session = sessions.get(sessionId), item = session?.items.get(itemId);
      if (!session) throw new HttpError(410, '本局图片已过期，请重新开局。');
      if (!item || !item.public.image.startsWith('https://')) throw new HttpError(404, '本局没有该官方远程图片。');
      const url = new URL(item.public.image);
      if (url.hostname !== 'menu-img.mcd.cn' || url.username || url.password) throw new HttpError(404, '图片来源不在官方菜单白名单中。');
      if (session.imageCache.has(itemId)) return session.imageCache.get(itemId);
      const response = await imageFetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error', headers: { Accept: 'image/png,image/jpeg,image/webp,image/gif' } });
      if (!response.ok) throw Error(`官方餐品图片 HTTP ${response.status}，请重试。`);
      const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(contentType)) throw Error('官方餐品图片类型不受支持。');
      if (Number(response.headers.get('content-length')) > 3 * 1024 * 1024) throw Error('官方餐品图片超过 3 MB 限制。');
      const reader = response.body?.getReader(); if (!reader) throw Error('官方餐品图片没有内容。');
      const chunks = []; let size = 0;
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 3 * 1024 * 1024) { await reader.cancel(); throw Error('官方餐品图片超过 3 MB 限制。'); } chunks.push(part.value); }
      const image = { contentType, bytes: Buffer.concat(chunks, size) }; session.imageCache.set(itemId, image); return image;
    },
    async quote(body) {
      exactKeys(body, ['sessionId', 'itemIds']); clean();
      const session = typeof body.sessionId === 'string' ? sessions.get(body.sessionId) : null;
      if (!session) throw new HttpError(410, '本局已过期或不存在，请重新开局。');
      const ids = body.itemIds;
      if (!Array.isArray(ids) || ids.length !== 3 || ids.some(id => typeof id !== 'string') || new Set(ids).size !== 3 || !session.mains.includes(ids[0]) || !session.sides.includes(ids[1]) || ids[2] !== session.drink) throw new HttpError(400, '餐盘必须是一份已选主食、一份配餐和固定饮品。');
      const perform = async () => {
        if (session.lock && (ids[0] !== session.lock.main || ids[2] !== session.lock.drink)) throw new HttpError(400, '轮回司只允许换一份配餐，主食和饮品已经锁定。');
        const requested = ids.map(id => session.items.get(id));
        const payload = await client.call('calculate-price', { ...session.base, items: requested.map(item => item.request), needTableware: false });
        const result = normalizeQuote(payload, requested, session.store);
        if (!session.lock) session.lock = { main: ids[0], drink: ids[2] };
        return { quoteId: randomUUID(), ...result };
      };
      const pending = session.pending.then(perform); session.pending = pending.catch(() => {}); return pending;
    }
  };
}

async function readJson(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new HttpError(415, '接口只接受 application/json。');
  if (Number(req.headers['content-length']) > MAX_BODY) throw new HttpError(413, '请求体超过 8 KB 限制。');
  const chunks = []; let length = 0;
  for await (const chunk of req) { length += chunk.length; if (length > MAX_BODY) throw new HttpError(413, '请求体超过 8 KB 限制。'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, '请求体不是有效 JSON。'); }
}
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }

function splitList(value) { return String(value || '').split(',').map(item => item.trim()).filter(Boolean); }
function clientIp(req, trustProxy) {
  if (trustProxy) { const forwarded = req.headers['x-forwarded-for']; if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim(); }
  return req.socket.remoteAddress || 'unknown';
}
function createRateLimiter({ limit = 0, windowMs = 60000 } = {}) {
  const hits = new Map();
  return function allow(key, nowMs) {
    if (!limit) return true;
    if (hits.size > 5000) for (const [key2, bucket] of hits) if (nowMs - bucket.start > windowMs) hits.delete(key2);
    const bucket = hits.get(key);
    if (!bucket || nowMs - bucket.start > windowMs) { hits.set(key, { start: nowMs, count: 1 }); return true; }
    if (bucket.count >= limit) return false;
    bucket.count += 1; return true;
  };
}

export function createTriadServer({ client, root = PROJECT_ROOT, imageFetch = fetch, access = {} } = {}) {
  if (!client) throw Error('需要本机 MCP Client。');
  const { publicMode = false, allowedHosts = [], allowedOrigins = [], trustProxy = false, rateLimit = { limit: 0, windowMs: 60000 }, maxSessionsPerIp = 0 } = access;
  const hostWhitelist = splitList(Array.isArray(allowedHosts) ? allowedHosts.join(',') : allowedHosts), originWhitelist = splitList(Array.isArray(allowedOrigins) ? allowedOrigins.join(',') : allowedOrigins);
  const bridge = createBridge(client, { root, imageFetch, maxSessionsPerIp });
  const allowRequest = createRateLimiter(rateLimit);
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    try {
      const port = server.address()?.port;
      const host = req.headers.host || '';
      const localHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      const hosts = publicMode ? (hostWhitelist.length ? [...hostWhitelist, ...localHosts] : []) : localHosts;
      if (hosts.length && !hosts.includes(host)) throw new HttpError(403, publicMode ? '当前访问域名不在允许列表中。' : '仅允许本机 Host 访问。');
      const forwardedHost = trustProxy ? String(req.headers['x-forwarded-host'] || '').split(',')[0].trim() : '';
      const effectiveHost = forwardedHost || host;
      const scheme = (trustProxy && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()) || (publicMode ? 'https' : 'http');
      if (req.headers.origin) {
        // 公网反代可能改写 Host 且不透传 x-forwarded-host，此时无法可靠还原自域名：
        // 未显式配置白名单就交给 Sec-Fetch-Site 与限流把关，配置白名单后严格按白名单校验。
        let origins = originWhitelist;
        if (!origins.length) {
          if (publicMode) origins = [];
          else origins = [`${scheme}://${host}`];
        }
        if (origins.length && !origins.includes(req.headers.origin)) throw new HttpError(403, '仅允许同源请求。');
      }
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, '仅允许同源请求。');
      const path = new URL(req.url, `http://${host}`).pathname;
      if (path.startsWith('/api/')) {
        const ip = clientIp(req, trustProxy);
        if (!allowRequest(`api:${ip}`, Date.now())) throw new HttpError(429, '请求过于频繁，请稍后再试。');
        if (req.method === 'GET' && path === '/api/health') return json(res, 200, await bridge.health());
        const imagePath = /^\/api\/menu-image\/([a-f0-9-]{36})\/(\d{1,24})$/.exec(path);
        if (req.method === 'GET' && imagePath) {
          const image = await bridge.image(imagePath[1], imagePath[2]);
          res.writeHead(200, { 'Content-Type': image.contentType, 'Cache-Control': 'private, max-age=300', 'Content-Length': image.bytes.byteLength }); return res.end(image.bytes);
        }
        const handler = { '/api/stores': 'stores', '/api/context': 'context', '/api/quote': 'quote' }[path];
        if (req.method !== 'POST' || !handler) throw new HttpError(404, '接口不存在。');
        return json(res, 200, await bridge[handler](await readJson(req), handler === 'context' ? { ip } : undefined));
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw new HttpError(405, '静态资源只允许读取。');
      let decoded; try { decoded = decodeURIComponent(path); } catch { throw new HttpError(400, '资源路径无效。'); }
      if (decoded.includes('\\') || decoded.split('/').some(segment => segment.startsWith('.'))) throw new HttpError(404, '资源不存在。');
      const relative = decoded === '/' || decoded === '/index.html' ? 'index.html' : decoded.startsWith('/assets/') ? decoded.slice(1) : null;
      if (!relative || !MIME[extname(relative).toLowerCase()]) throw new HttpError(404, '资源不存在。');
      const file = resolve(root, relative), rootResolved = await realpath(root);
      let actual; try { actual = await realpath(file); } catch { throw new HttpError(404, '资源不存在。'); }
      if (actual !== rootResolved && !actual.startsWith(rootResolved + sep)) throw new HttpError(404, '资源不存在。');
      const info = await stat(actual); if (!info.isFile()) throw new HttpError(404, '资源不存在。');
      res.writeHead(200, { 'Content-Type': MIME[extname(relative).toLowerCase()], 'Cache-Control': 'no-store', 'Content-Length': info.size });
      res.end(req.method === 'HEAD' ? undefined : await readFile(actual));
    } catch (error) { if (!res.headersSent) json(res, error.status || 502, { error: { message: publicMessage(error, client.token || '') } }); else res.destroy(); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const client = new McpClient({ token: await loadToken(process.env.MCD_MCP_ENV_FILE || undefined) });
    const port = Number(process.env.PORT || process.env.TRIAD_PORT || 8780);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('PORT 必须在 1024–65535 之间。');
    const host = process.env.TRIAD_HOST || '127.0.0.1';
    const publicMode = process.env.TRIAD_PUBLIC === '1' || !['127.0.0.1', 'localhost', '::1'].includes(host);
    const server = createTriadServer({ client, access: {
      publicMode,
      allowedHosts: splitList(process.env.TRIAD_ALLOWED_HOSTS),
      allowedOrigins: splitList(process.env.TRIAD_ALLOWED_ORIGINS),
      trustProxy: publicMode,
      rateLimit: { limit: Number(process.env.TRIAD_RATE_LIMIT || (publicMode ? 180 : 0)), windowMs: 60000 },
      maxSessionsPerIp: Number(process.env.TRIAD_SESSIONS_PER_IP || (publicMode ? 8 : 0))
    } });
    server.listen(port, host, () => console.log(publicMode ? `三殿线上服务已启动：端口 ${port}` : `三殿本机试玩：http://127.0.0.1:${port}/index.html`));
    server.on('error', error => { console.error(publicMessage(error)); process.exitCode = 1; });
  } catch (error) { console.error(publicMessage(error)); process.exitCode = 1; }
}
