import { readdir } from 'node:fs/promises';

const COMBO = /套餐|组合|件套|双人餐|多人餐|欢享|家庭餐|随心配|全家餐/;
const MAIN = /巨无霸|麦香鸡|麦香鱼|汉堡|鸡腿堡|麦满分|营养卷|炒双蛋堡|厚松饼.*堡|火腿扒堡/;
const SIDE = /薯条|脆薯饼|麦乐鸡|玉米杯|鸡翅|香肠|油条|派$/;
const DRINK = /咖啡|可乐|雪碧|牛奶|豆浆|红茶|柠檬茶|纯悦|苹果汁|黄金橙橙/;
const PRIORITY = { main: ['巨无霸', '板烧鸡腿堡', '麦辣鸡腿汉堡', '猪柳蛋麦满分', '大脆鸡扒麦满分'], side: ['薯条', '脆薯饼', '玉米杯', '麦乐鸡', '德式图林根香肠', '脆香油条'], drink: ['鲜萃咖啡', '纯牛奶(盒装)', '优品豆浆', '可乐', '雪碧', '纯悦'] };

function text(value, max = 160) { return typeof value === 'string' ? value.slice(0, max) : ''; }
export function normalizeStores(payload) {
  if (!Array.isArray(payload?.data)) throw Error('门店查询结果格式变化：缺少门店列表。');
  return payload.data.filter(store => /^\d{1,16}$/.test(store.storeCode) && store.storeName && store.businessStatus !== false).map(store => ({
    code: store.storeCode, name: text(store.storeName), address: text(store.address, 240),
    ...(typeof store.businessStatus === 'boolean' ? { open: store.businessStatus } : {}),
    ...(typeof store.businessStartTime === 'string' ? { opensAt: text(store.businessStartTime, 10) } : {}),
    ...(typeof store.businessEndTime === 'string' ? { closesAt: text(store.businessEndTime, 10) } : {})
  }));
}

export function menuCandidates(payload) {
  const meals = payload?.data?.meals;
  if (!meals || Array.isArray(meals) || typeof meals !== 'object') throw Error('官方菜单格式变化：缺少商品编码映射。');
  const pools = { main: [], side: [], drink: [] };
  for (const [id, meal] of Object.entries(meals)) {
    if (!/^\d{1,24}$/.test(id) || !meal?.name || COMBO.test(meal.name) || meal.withOrder || meal.canWithOrder === true) continue;
    const category = MAIN.test(meal.name) ? 'main' : SIDE.test(meal.name) ? 'side' : DRINK.test(meal.name) ? 'drink' : '';
    if (category) pools[category].push({ id, ...meal, category });
  }
  for (const category of Object.keys(pools)) pools[category].sort((a, b) => {
    const rank = name => { const index = PRIORITY[category].findIndex(part => name.includes(part)); return index < 0 ? 99 : index; };
    return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, 'zh-CN');
  });
  return pools;
}

export function defaultModification(detail) {
  if (!detail?.supportModify) return undefined;
  const groups = detail?.modification?.items;
  if (!Array.isArray(groups)) throw Error('餐品支持特调，但缺少默认特调详情，无法安全报价。');
  const values = [];
  for (const group of groups) {
    if (!Array.isArray(group.values)) throw Error('默认特调选项缺失。');
    let selectedCount = 0;
    for (const value of group.values) {
      const quantity = value.selectedQuantity;
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 20) throw Error('默认特调数量无效。');
      if (quantity > 0) {
        if (!value.code || !value.selectedKey || (Number.isInteger(value.maxQuantity) && quantity > value.maxQuantity) || (Number.isInteger(value.minQuantity) && quantity < value.minQuantity)) throw Error('默认特调字段不完整。');
        values.push({ code: String(value.code), key: String(value.selectedKey), quantity }); selectedCount += 1;
      } else if (value.unselectedKey) values.push({ code: String(value.code), key: String(value.unselectedKey), quantity: 0 });
    }
    if ((Number.isInteger(group.minValues) && selectedCount < group.minValues) || (Number.isInteger(group.maxValues) && selectedCount > group.maxValues)) throw Error('默认特调未满足官方数量条件。');
  }
  return values.length ? { values } : undefined;
}

export async function localImages(root) {
  const files = await readdir(`${root}/assets/menu`);
  return new Map(files.filter(file => /\.png$/i.test(file)).map(file => [file.replace(/\.png$/i, ''), `assets/menu/${file}`]));
}

function localImage(name, images) {
  if (images.has(name)) return images.get(name);
  // Only explicitly verified same-product aliases; never fuzzy-match unlike meals.
  const aliases = { '小杯玉米杯': '玉米杯', '小杯鲜萃咖啡': '鲜萃咖啡', '中杯鲜萃咖啡': '鲜萃咖啡' };
  return aliases[name] ? images.get(aliases[name]) : undefined;
}
function remoteImage(value) { try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'mcd.cn' || url.hostname.endsWith('.mcd.cn')) ? url.href : ''; } catch { return ''; } }

export function adaptMeal(candidate, payload, images = new Map()) {
  const detail = payload?.data;
  if (!detail || String(detail.code) !== candidate.id || !detail.name || !Array.isArray(detail.rounds)) throw Error('餐品详情身份或选配结构无法核验。');
  if (detail.rounds.length || COMBO.test(detail.name)) return null;
  const modification = defaultModification(detail);
  const image = localImage(detail.name, images) || localImage(candidate.name, images) || remoteImage(detail.image) || remoteImage(candidate.image);
  if (!image) return null;
  return { public: { id: candidate.id, name: text(detail.name), image, category: candidate.category, customized: !!modification }, request: { productCode: candidate.id, quantity: 1, ...(modification ? { modification } : {}) } };
}

export function normalizeOffers(payload) {
  const data = payload?.data;
  const coupons = Array.isArray(data) ? data : Array.isArray(data?.coupons) ? data.coupons : null;
  if (!coupons) throw Error('门店优惠返回结构变化，无法核验。');
  return coupons.map(coupon => {
    const conditions = [coupon.subtitle, coupon.datetimeText, coupon.discountInfo?.discountDesc].filter(value => typeof value === 'string' && value.trim());
    if (typeof coupon.tradeDateTime === 'string' && coupon.tradeDateTime.trim()) conditions.push(`有效期：${coupon.tradeDateTime}`);
    const products = Array.isArray(coupon.products) ? coupon.products.map(product => text(product.productName)).filter(Boolean) : [];
    if (products.length) conditions.push(`接口返回适用商品：${products.join('、')}`);
    return { title: text(coupon.title || coupon.couponName || coupon.name), conditionsText: conditions.join('；').slice(0, 400) || '官方未提供完整使用条件；本局不使用此券。' };
  }).filter(coupon => coupon.title).slice(0, 30);
}

export function normalizeQuote(payload, requested, store) {
  const data = payload?.data;
  if (!Number.isSafeInteger(data?.price) || data.price < 0 || !Array.isArray(data.productList)) throw Error('官方报价缺少有效的整数分总额或商品明细。');
  if (data.productList.length !== requested.length) throw Error('官方报价的商品数量与本次餐盘不符。');
  const items = requested.map(item => {
    const matches = data.productList.filter(line => String(line.productCode) === item.public.id);
    const line = matches[0];
    if (matches.length !== 1 || line.quantity !== 1) throw Error('官方报价的商品编码或份数与本次餐盘不符。');
    if (line.subtotal !== undefined && (!Number.isSafeInteger(line.subtotal) || line.subtotal < 0)) throw Error('官方报价的商品小计无效。');
    return { id: item.public.id, name: text(line.productName || item.public.name), quantity: 1, ...(line.subtotal !== undefined ? { subtotalCents: line.subtotal } : {}) };
  });
  const result = { items, totalCents: data.price, store: { code: store.code, name: store.name }, quotedAt: new Date().toISOString(), source: { kind: 'mcp', tool: 'calculate-price' }, fees: {} };
  for (const [source, target] of [['originalPrice', 'originalCents'], ['discount', 'discountCents']]) {
    if (data[source] !== undefined) { if (!Number.isSafeInteger(data[source]) || data[source] < 0) throw Error('官方报价的金额字段无效。'); result[target] = data[source]; }
  }
  for (const [source, target] of [['deliveryPrice', 'deliveryCents'], ['packingPrice', 'packingCents'], ['tablewarePrice', 'tablewareCents']]) {
    if (data[source] !== undefined) { if (!Number.isSafeInteger(data[source]) || data[source] < 0) throw Error('官方报价费用字段无效。'); result.fees[target] = data[source]; }
  }
  return result;
}
