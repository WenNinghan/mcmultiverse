/**
 * The three-temple session is an immutable, dependency-free value.
 * Every mutator returns a new, deeply frozen session; callers assign the return
 * value. No request, storage, clock, DOM, random value or local price calculation
 * lives here. Monetary evidence is accepted only from calculate-price responses.
 */

const VERSION = 1;
const SOURCE = Object.freeze({ kind: 'mcp', tool: 'calculate-price' });
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function fail(message) { throw new TypeError(message); }
function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} 必须是对象`);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail(`${label} 不接受自定义原型`);
  for (const key of Object.keys(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) fail(`${label} 含不安全字段`);
  }
  return value;
}
function exactKeys(value, required, optional, label) {
  record(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${label} 含未允许字段 ${key}`);
  for (const key of required) if (!has(value, key)) fail(`${label} 缺少 ${key}`);
}
function text(value, label, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(`${label} 必须是 1–${max} 字的文本`);
  }
  return value.trim();
}
function reasonText(value, label = '我的判词') {
  // Validate the same public-text boundary without changing a player's writing.
  text(value, label, 180);
  return value;
}
function estimateCents(value) {
  cents(value, '我的估价');
  if (value > 100000) fail('我的估价必须在 0–100000 整数分之间');
  return value;
}
function id(value, label = '餐品编号') {
  const result = text(value, label, 80);
  if (!/^[A-Za-z0-9_-]+$/u.test(result)) fail(`${label} 格式不正确`);
  return result;
}
function cents(value, label = '金额') {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${label} 必须是非负安全整数分`);
  return value;
}
function signedCents(value, label) {
  if (!Number.isSafeInteger(value)) fail(`${label} 必须是安全整数分`);
  return value;
}
function instant(value, label = '报价时间') {
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || !Number.isFinite(Date.parse(value))) {
    fail(`${label} 必须是带时区的 ISO 时间`);
  }
  return value;
}
function image(value) {
  const result = text(value, '餐品图片', 600);
  if (/^(?:\.\/)?assets\/menu\/[^/\\?#]+\.(?:png|jpe?g|webp)$/iu.test(result)) {
    const filename = result.slice(result.lastIndexOf('/') + 1);
    let decoded;
    try { decoded = decodeURIComponent(filename); } catch { fail('餐品图片路径不安全'); }
    if (decoded.startsWith('.') || /[/\\]/u.test(decoded)) fail('餐品图片路径不安全');
    return result.replace(/^\.\//u, '');
  }
  let url;
  try { url = new URL(result); } catch { fail('餐品图片地址不正确'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
    !(url.hostname === 'mcd.cn' || url.hostname.endsWith('.mcd.cn'))) {
    fail('餐品图片仅接受本地菜单图或麦当劳 HTTPS 图片');
  }
  for (const key of url.searchParams.keys()) {
    if (/(?:token|auth|credential|signature|api[-_]?key)/iu.test(key)) fail('餐品图片不得携带凭证');
  }
  return url.href;
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function store(value) {
  record(value, '门店');
  return { code: id(value.code, '门店编号'), name: text(value.name, '门店名称', 120) };
}
function fees(value) {
  const allowed = ['deliveryCents', 'packingCents', 'tablewareCents'];
  exactKeys(value, [], allowed, '官方费用');
  const result = {};
  for (const key of allowed) if (has(value, key)) result[key] = cents(value[key], '官方费用');
  return result;
}
function item(value, category) {
  record(value, '餐品');
  return { id: id(value.id), name: text(value.name, '餐品名称', 160), image: image(value.image), category, ...(value.customized === true ? { customized: true } : {}) };
}
function options(values, category) {
  if (!Array.isArray(values) || values.length < 2 || values.length > 30) fail(`${category} 需要 2–30 个可选餐品`);
  return values.map(value => item(value, category));
}
function assertSession(session) {
  record(session, '三殿进度');
  if (session.version !== VERSION || !session.context || !session.selection) fail('三殿进度版本不正确');
}
function findItem(session, itemId) {
  return [...session.context.mainOptions, ...session.context.sideOptions, session.context.drink].find(value => value.id === itemId);
}
function quote(value, expectedIds, expectedStore) {
  record(value, '官方报价');
  record(value.source, '报价来源');
  if (value.source.kind !== 'mcp' || value.source.tool !== 'calculate-price') fail('仅接受 MCP calculate-price 的真实报价');
  const quotedStore = store(value.store);
  if (quotedStore.code !== expectedStore.code) fail('报价门店与本局门店不一致');
  if (!Array.isArray(value.items) || value.items.length !== expectedIds.length) fail('报价必须与本盘餐品完全一致');
  const byId = new Map();
  for (const row of value.items) {
    record(row, '报价餐品');
    const productId = id(row.id);
    if (byId.has(productId) || !expectedIds.includes(productId)) fail('报价餐品重复或不属于本盘');
    const quantity = has(row, 'quantity') ? row.quantity : row.qty;
    if (quantity !== 1 || (has(row, 'quantity') && has(row, 'qty') && row.quantity !== row.qty)) fail('每项餐品必须恰好一份');
    const result = { id: productId, quantity: 1 };
    if (has(row, 'subtotalCents')) result.subtotalCents = cents(row.subtotalCents, '单项小计');
    byId.set(productId, result);
  }
  const result = {
    source: { ...SOURCE }, store: { ...expectedStore }, totalCents: cents(value.totalCents),
    quotedAt: instant(value.quotedAt), items: expectedIds.map(productId => byId.get(productId))
  };
  if (has(value, 'quoteId')) result.quoteId = id(value.quoteId, '报价编号');
  if (has(value, 'originalCents')) result.originalCents = cents(value.originalCents, '官方原价');
  if (has(value, 'discountCents')) result.discountCents = cents(value.discountCents, '官方优惠');
  if (has(value, 'fees')) result.fees = fees(value.fees);
  return result;
}

/** Public context is projected: no address, credentials, private coupon or price enters blind selection. */
export function createSession(context) {
  record(context, '门店菜单');
  record(context.source, '菜单来源');
  if (context.source.kind !== 'mcp') fail('本局需要实际 MCP 菜单');
  const mainOptions = options(context.mainOptions, 'main');
  const sideOptions = options(context.sideOptions, 'side');
  const drink = item(context.drink, 'drink');
  const ids = [...mainOptions, ...sideOptions, drink].map(value => value.id);
  if (new Set(ids).size !== ids.length) fail('主食、配餐与饮品编号不得重复');
  const safeContext = {
    sessionId: id(context.sessionId, '菜单会话编号'), store: store(context.store),
    mainOptions, sideOptions, drink, offers: [],
    source: { kind: 'mcp', fetchedAt: instant(context.source.fetchedAt, '菜单获取时间') }
  };
  if (has(context, 'offers')) {
    if (!Array.isArray(context.offers) || context.offers.length > 100) fail('优惠证据格式不正确');
    safeContext.offers = context.offers.map(value => {
      record(value, '优惠证据');
      return { title: text(value.title, '优惠名称', 200), conditionsText: text(value.conditionsText, '优惠条件', 1000) };
    });
  }
  return freeze({ version: VERSION, context: safeContext, selection: { mainId: null, sideId: null }, estimateCents: null, originalQuote: null, replacementSideId: null, comparison: null });
}

/** Choosing again intentionally clears every quote and replacement; no old evidence is reused. */
export function choose(session, kind, itemId) {
  assertSession(session);
  if (kind !== 'main' && kind !== 'side') fail('只能盲选主食或配餐');
  const choices = kind === 'main' ? session.context.mainOptions : session.context.sideOptions;
  if (!choices.some(value => value.id === itemId)) fail('餐品不在这一轮的可选菜单内');
  if (kind === 'side' && !session.selection.mainId) fail('请先选一份主食');
  const selection = kind === 'main'
    ? { mainId: itemId, sideId: null }
    : { ...session.selection, sideId: itemId };
  return freeze({ ...session, selection, estimateCents: null, originalQuote: null, replacementSideId: null, comparison: null });
}

/** A skipped estimate stays absent from the public verdict; the first quote seals any guess. */
export function setEstimate(session, guessCents) {
  assertSession(session);
  if (session.originalQuote) fail('首次揭价已经封存，不能修改估价');
  if (guessCents !== null) estimateCents(guessCents);
  return freeze({ ...session, estimateCents: guessCents });
}

export function getOriginalIds(session) {
  assertSession(session);
  if (!session.selection.mainId || !session.selection.sideId) fail('请完成两轮盲选');
  return [session.selection.mainId, session.selection.sideId, session.context.drink.id];
}

/** Captures the first reveal as historical evidence, even if the market price later changes. */
export function setOriginalQuote(session, value) {
  const expected = getOriginalIds(session);
  if (session.originalQuote) fail('首次揭价已经封存；要重选请重新 choose');
  return freeze({ ...session, originalQuote: quote(value, expected, session.context.store), replacementSideId: null, comparison: null });
}

export function replaceSide(session, itemId) {
  assertSession(session);
  if (!session.originalQuote) fail('请先揭晓官方报价');
  if (itemId === session.selection.sideId) fail('换一份需要选择不同的配餐');
  if (!session.context.sideOptions.some(value => value.id === itemId)) fail('只能替换为本局另一份配餐');
  return freeze({ ...session, replacementSideId: itemId, comparison: null });
}

export function getReplacementIds(session) {
  const original = getOriginalIds(session);
  if (!session.replacementSideId) fail('请先选择要换的配餐');
  return [original[0], session.replacementSideId, original[2]];
}

/** deltaCents is candidate minus refreshed original; first-reveal drift is separate. */
export function setComparison(session, originalRefresh, newQuote) {
  const originalIds = getOriginalIds(session);
  const replacementIds = getReplacementIds(session);
  if (!session.originalQuote) fail('缺少首次揭价证据');
  const refreshed = quote(originalRefresh, originalIds, session.context.store);
  const replacement = quote(newQuote, replacementIds, session.context.store);
  return freeze({ ...session, comparison: {
    originalRefresh: refreshed, newQuote: replacement,
    baselineChangedCents: refreshed.totalCents - session.originalQuote.totalCents,
    deltaCents: replacement.totalCents - refreshed.totalCents
  } });
}

function publicPlate(session, productIds, evidence) {
  return {
    items: productIds.map(productId => {
      const product = findItem(session, productId);
      const row = evidence.items.find(value => value.id === productId);
      const result = { id: product.id, name: product.name, image: product.image, quantity: 1 };
      if (has(row, 'subtotalCents')) result.subtotalCents = row.subtotalCents;
      return result;
    }),
    quote: { ...evidence, items: evidence.items.map(value => ({ ...value })), source: { ...SOURCE }, store: { ...evidence.store } }
  };
}

export function buildVerdict(session, { decision, reason } = {}) {
  assertSession(session);
  if (!session.originalQuote || !session.comparison) fail('请先完成同门店两盘真实报价，再签判决书');
  if (decision !== 'keep' && decision !== 'swap') fail('判决只能是保留原盘或换这一份');
  const payload = {
    version: VERSION, type: 'mcmultiverse-verdict', store: { ...session.context.store },
    original: publicPlate(session, getOriginalIds(session), session.comparison.originalRefresh),
    replacement: publicPlate(session, getReplacementIds(session), session.comparison.newQuote),
    baseline: { initialTotalCents: session.originalQuote.totalCents, initialQuotedAt: session.originalQuote.quotedAt, changedCents: session.comparison.baselineChangedCents },
    decision, reason: reasonText(reason), deltaCents: session.comparison.deltaCents, source: { ...SOURCE }
  };
  if (session.estimateCents != null) {
    payload.estimate = {
      guessCents: estimateCents(session.estimateCents),
      actualCents: session.originalQuote.totalCents,
      differenceCents: session.originalQuote.totalCents - session.estimateCents
    };
  }
  const validation = validateVerdict(payload);
  if (!validation.ok) fail(validation.errors.join('；'));
  return freeze(payload);
}

export function money(value) {
  signedCents(value, '显示金额');
  const abs = Math.abs(value);
  return `${value < 0 ? '-' : ''}¥${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

function validateStore(value) {
  exactKeys(value, ['code', 'name'], [], '公开门店');
  store(value);
}
function validateSource(value) {
  exactKeys(value, ['kind', 'tool'], [], '公开来源');
  if (value.kind !== SOURCE.kind || value.tool !== SOURCE.tool) fail('公开来源必须是 MCP calculate-price');
}
function validatePublicQuote(value, expectedIds, expectedStore) {
  exactKeys(value, ['source', 'store', 'totalCents', 'quotedAt', 'items'], ['quoteId', 'originalCents', 'discountCents', 'fees'], '公开报价');
  validateSource(value.source);
  validateStore(value.store);
  if (!Array.isArray(value.items)) fail('公开报价餐品格式不正确');
  for (const row of value.items) exactKeys(row, ['id', 'quantity'], ['subtotalCents'], '公开报价餐品');
  quote(value, expectedIds, expectedStore);
}
function validatePlate(value, expectedStore, label) {
  exactKeys(value, ['items', 'quote'], [], label);
  if (!Array.isArray(value.items) || value.items.length !== 3) fail(`${label} 必须是主食、配餐、饮品各一份`);
  const ids = [];
  for (const product of value.items) {
    exactKeys(product, ['id', 'name', 'image', 'quantity'], ['subtotalCents'], `${label}餐品`);
    ids.push(id(product.id));
    text(product.name, '公开餐品名称', 160);
    image(product.image);
    if (product.quantity !== 1) fail('公开餐盘每项必须恰好一份');
    if (has(product, 'subtotalCents')) cents(product.subtotalCents, '公开餐品小计');
  }
  if (new Set(ids).size !== ids.length) fail('公开餐盘不得重复餐品');
  validatePublicQuote(value.quote, ids, expectedStore);
  for (const product of value.items) {
    const row = value.quote.items.find(entry => entry.id === product.id);
    if (has(product, 'subtotalCents') !== has(row, 'subtotalCents') || (has(row, 'subtotalCents') && product.subtotalCents !== row.subtotalCents)) fail('公开餐品小计与官方证据不一致');
  }
}

/** Strict public-import boundary; unknown keys (including credentials) are rejected, not silently kept. */
export function validateVerdict(payload) {
  try {
    exactKeys(payload, ['version', 'type', 'store', 'original', 'replacement', 'baseline', 'decision', 'reason', 'deltaCents', 'source'], ['estimate'], '判决书');
    if (payload.version !== VERSION || payload.type !== 'mcmultiverse-verdict') fail('判决书版本不支持');
    validateStore(payload.store);
    validateSource(payload.source);
    validatePlate(payload.original, payload.store, '原盘');
    validatePlate(payload.replacement, payload.store, '换后餐盘');
    const before = payload.original.items;
    const after = payload.replacement.items;
    // Main, drink, their public presentation and quantities remain identical.
    for (const index of [0, 2]) {
      for (const key of ['id', 'name', 'image', 'quantity']) {
        if (before[index][key] !== after[index][key]) fail('判决书只能更换一份配餐');
      }
    }
    if (before[1].id === after[1].id) fail('判决书需要记录实际替换的一份');
    exactKeys(payload.baseline, ['initialTotalCents', 'initialQuotedAt', 'changedCents'], [], '首次揭价');
    cents(payload.baseline.initialTotalCents, '首次揭价金额');
    instant(payload.baseline.initialQuotedAt, '首次揭价时间');
    signedCents(payload.baseline.changedCents, '原盘价变');
    signedCents(payload.deltaCents, '两盘差额');
    if (payload.baseline.changedCents !== payload.original.quote.totalCents - payload.baseline.initialTotalCents) fail('原盘价变计算不一致');
    if (payload.deltaCents !== payload.replacement.quote.totalCents - payload.original.quote.totalCents) fail('两盘差额计算不一致');
    if (payload.decision !== 'keep' && payload.decision !== 'swap') fail('判决类型不正确');
    reasonText(payload.reason, '公开判词');
    if (has(payload, 'estimate')) {
      exactKeys(payload.estimate, ['guessCents', 'actualCents', 'differenceCents'], [], '揭价前估价');
      estimateCents(payload.estimate.guessCents);
      cents(payload.estimate.actualCents, '估价对应的首次官方报价');
      signedCents(payload.estimate.differenceCents, '估价差额');
      if (payload.estimate.actualCents !== payload.baseline.initialTotalCents) fail('估价只能对应首次官方报价');
      if (payload.estimate.differenceCents !== payload.estimate.actualCents - payload.estimate.guessCents) fail('估价差额计算不一致');
    }
    return { ok: true, errors: [] };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : '判决书格式不正确'] };
  }
}
