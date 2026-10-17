import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSession, choose, getOriginalIds, setOriginalQuote, setEstimate, replaceSide,
  getReplacementIds, setComparison, buildVerdict, money, validateVerdict
} from '../assets/triad-core.mjs';

// Synthetic contracts only: these are deliberately never imported into the page.
const time = '2026-10-17T03:00:00.000Z';
const product = (id, name) => ({ id, name, image: `assets/menu/${name}.png` });
const context = () => ({
  sessionId: 'fixture-session', store: { code: 'fixture-store', name: '合成测试门店', address: '不应公开的地址' },
  mainOptions: [product('main-a', '测试主食甲'), product('main-b', '测试主食乙')],
  sideOptions: [product('side-a', '测试配餐甲'), product('side-b', '测试配餐乙'), product('side-c', '测试配餐丙')],
  drink: product('drink', '测试饮品'), offers: [{ title: '合成优惠证据', conditionsText: '仅供契约测试' }],
  source: { kind: 'mcp', fetchedAt: time }, token: 'must-not-leak'
});
const selected = () => choose(choose(createSession(context()), 'main', 'main-a'), 'side', 'side-a');
function quote(ids, totalCents = 3000, extra = {}) {
  return { source: { kind: 'mcp', tool: 'calculate-price' }, store: { code: 'fixture-store', name: '合成测试门店' },
    totalCents, quotedAt: time, items: ids.map(id => ({ id, quantity: 1 })), ...extra };
}
function revealed() {
  const state = selected();
  return setOriginalQuote(state, quote(getOriginalIds(state)));
}
function compared(initial = 3000, refresh = 3000, next = 2500) {
  let state = selected();
  state = setOriginalQuote(state, quote(getOriginalIds(state), initial));
  state = replaceSide(state, 'side-b');
  return setComparison(state, quote(getOriginalIds(state), refresh), quote(getReplacementIds(state), next));
}
const clone = value => JSON.parse(JSON.stringify(value));

test('blind context projects public fields without prices, address or credential', () => {
  const value = context();
  value.mainOptions[0].price = 999;
  const state = createSession(value);
  assert.equal(JSON.stringify(state).includes('must-not-leak'), false);
  assert.equal('address' in state.context.store, false);
  assert.equal('price' in state.context.mainOptions[0], false);
  assert.equal(state.originalQuote, null);
  assert.ok(Object.isFrozen(state.context.mainOptions[0]));
  value.mainOptions[0].name = '外部改名';
  assert.equal(state.context.mainOptions[0].name, '测试主食甲');
});

test('two rounds require main first, allowed IDs and one fixed drink', () => {
  const first = createSession(context());
  assert.throws(() => choose(first, 'side', 'side-a'), /先选/);
  assert.throws(() => choose(first, 'main', 'side-a'), /可选菜单/);
  assert.throws(() => choose(first, 'drink', 'drink'), /只能盲选/);
  assert.throws(() => getOriginalIds(first), /两轮/);
  assert.deepEqual(getOriginalIds(selected()), ['main-a', 'side-a', 'drink']);
  assert.deepEqual(first.selection, { mainId: null, sideId: null });
});

test('choice redo explicitly invalidates reveal, replacement and comparison', () => {
  const first = compared();
  const next = choose(first, 'main', 'main-b');
  assert.deepEqual(next.selection, { mainId: 'main-b', sideId: null });
  assert.throws(() => getOriginalIds(next), /两轮/);
  assert.throws(() => setOriginalQuote(next, quote(['main-b', 'side-a', 'drink'])), /两轮/);
  const completedAgain = choose(next, 'side', 'side-b');
  assert.deepEqual(getOriginalIds(completedAgain), ['main-b', 'side-b', 'drink']);
  assert.equal(next.originalQuote, null);
  assert.equal(next.replacementSideId, null);
  assert.equal(next.comparison, null);
  assert.equal(first.originalQuote.totalCents, 3000);
});

test('changing main before reveal also requires a fresh second blind choice', () => {
  const first = selected();
  const next = choose(first, 'main', 'main-b');
  assert.deepEqual(next.selection, { mainId: 'main-b', sideId: null });
  assert.throws(() => getOriginalIds(next), /两轮/);
  assert.equal(first.selection.sideId, 'side-a');
  assert.deepEqual(getOriginalIds(choose(next, 'side', 'side-a')), ['main-b', 'side-a', 'drink']);
});

test('quote accepts actual-source integer cents and either quantity spelling', () => {
  const state = selected();
  const ids = getOriginalIds(state);
  const value = quote(ids, 0, { originalCents: 0, discountCents: 0, quoteId: 'quote-001' });
  value.items = ids.reverse().map(id => ({ id, qty: 1, subtotalCents: 0 }));
  const result = setOriginalQuote(state, value);
  assert.deepEqual(result.originalQuote.items.map(row => row.id), getOriginalIds(state));
  assert.equal(result.originalQuote.items[0].quantity, 1);
  assert.equal('qty' in result.originalQuote.items[0], false);
  assert.equal(result.originalQuote.totalCents, 0);
  assert.throws(() => setOriginalQuote(result, value), /已经封存/);
});

test('quote rejects local estimates, wrong store, forged selection and quantities', () => {
  const state = selected();
  const ids = getOriginalIds(state);
  const mutations = [
    value => { value.source.kind = 'demo'; },
    value => { value.source.tool = 'quoteOrder'; },
    value => { value.store.code = 'other-store'; },
    value => { value.items[1].id = 'side-b'; },
    value => { value.items[2].id = value.items[0].id; },
    value => { value.items[0].quantity = 2; },
    value => { value.items[0].qty = 2; },
    value => { value.items.pop(); },
    value => { value.totalCents = -1; },
    value => { value.totalCents = 10.5; },
    value => { value.totalCents = Number.MAX_SAFE_INTEGER + 1; },
    value => { value.items[0].subtotalCents = NaN; },
    value => { value.quotedAt = 'unknown'; }
  ];
  for (const mutate of mutations) {
    const value = quote(ids);
    mutate(value);
    assert.throws(() => setOriginalQuote(state, value));
  }
});

test('replacement preserves main, drink and quantity and requires another side', () => {
  assert.throws(() => replaceSide(selected(), 'side-b'), /先揭晓/);
  const first = revealed();
  assert.throws(() => replaceSide(first, 'side-a'), /不同/);
  assert.throws(() => replaceSide(first, 'main-b'), /只能替换/);
  const next = replaceSide(first, 'side-b');
  assert.deepEqual(getOriginalIds(next), ['main-a', 'side-a', 'drink']);
  assert.deepEqual(getReplacementIds(next), ['main-a', 'side-b', 'drink']);
  assert.equal(first.replacementSideId, null);
});

test('comparison isolates market drift from the actual replacement difference', () => {
  const state = compared(3000, 3100, 2600);
  assert.equal(state.originalQuote.totalCents, 3000);
  assert.equal(state.comparison.originalRefresh.totalCents, 3100);
  assert.equal(state.comparison.baselineChangedCents, 100);
  assert.equal(state.comparison.deltaCents, -500);
  assert.equal(state.comparison.newQuote.totalCents - state.originalQuote.totalCents, -400);
  const next = replaceSide(state, 'side-c');
  assert.equal(next.comparison, null);
  assert.equal(next.originalQuote.totalCents, 3000);
});

test('failed comparison cannot mutate prior evidence or sneak changes to main/drink', () => {
  const state = replaceSide(revealed(), 'side-b');
  const wrong = quote(['main-b', 'side-b', 'drink'], 2500);
  assert.throws(() => setComparison(state, quote(getOriginalIds(state)), wrong));
  assert.equal(state.comparison, null);
  assert.equal(state.originalQuote.totalCents, 3000);
  assert.throws(() => buildVerdict(state, { decision: 'swap', reason: '想试另一口' }), /先完成/);
});

test('verdict is a frozen, serializable pair of real historical quote snapshots', () => {
  const state = compared(3000, 3100, 2600);
  const verdict = buildVerdict(state, { decision: 'swap', reason: '玉米更合我这一口' });
  assert.deepEqual(validateVerdict(clone(verdict)), { ok: true, errors: [] });
  assert.equal(verdict.baseline.changedCents, 100);
  assert.equal(verdict.deltaCents, -500);
  assert.equal(verdict.original.quote.totalCents, 3100);
  assert.equal(verdict.replacement.quote.totalCents, 2600);
  assert.equal(verdict.original.items[0].id, verdict.replacement.items[0].id);
  assert.equal('sessionId' in verdict, false);
  assert.equal('address' in verdict.store, false);
  assert.equal(JSON.stringify(verdict).includes('must-not-leak'), false);
  assert.ok(Object.isFrozen(verdict.original.items[0]));
  const keep = buildVerdict(state, { decision: 'keep', reason: '愿为偏爱留这一口' });
  assert.equal(keep.decision, 'keep');
});

test('unknown subtotal and discount stay absent rather than being synthesized', () => {
  const verdict = buildVerdict(compared(), { decision: 'keep', reason: '我喜欢原盘' });
  assert.equal('subtotalCents' in verdict.original.items[0], false);
  assert.equal('originalCents' in verdict.original.quote, false);
  assert.equal('discountCents' in verdict.original.quote, false);
  assert.equal('fees' in verdict.original.quote, false);
});

test('returned nonzero official fees remain in quote and share without filling missing fields', () => {
  let state = replaceSide(revealed(), 'side-b');
  const original = quote(getOriginalIds(state), 3200, { fees: { packingCents: 200, tablewareCents: 0 } });
  const replacement = quote(getReplacementIds(state), 2700, { fees: { deliveryCents: 100, packingCents: 100 } });
  state = setComparison(state, original, replacement);
  const verdict = buildVerdict(state, { decision: 'swap', reason: '这一份更合适' });
  assert.deepEqual(state.comparison.originalRefresh.fees, { packingCents: 200, tablewareCents: 0 });
  assert.deepEqual(verdict.replacement.quote.fees, { deliveryCents: 100, packingCents: 100 });
  assert.equal('deliveryCents' in verdict.original.quote.fees, false);
  assert.equal('tablewareCents' in verdict.replacement.quote.fees, false);
  assert.equal(validateVerdict(clone(verdict)).ok, true);
  original.fees.packingCents = 999;
  assert.equal(verdict.original.quote.fees.packingCents, 200);
});

test('official fee contracts reject invalid amounts and unknown fee fields on receipt and share', () => {
  const state = selected();
  for (const invalid of [
    null, { packingCents: -1 }, { deliveryCents: 1.5 }, { tablewareCents: '100' },
    { packingCents: Number.MAX_SAFE_INTEGER + 1 }, { serviceCents: 100 }
  ]) {
    assert.throws(() => setOriginalQuote(state, quote(getOriginalIds(state), 3000, { fees: invalid })));
    const verdict = clone(buildVerdict(compared(), { decision: 'keep', reason: '喜欢原来的搭配' }));
    verdict.original.quote.fees = invalid;
    assert.equal(validateVerdict(verdict).ok, false);
  }
});

test('returned actual subtotals are retained and linked to their evidence', () => {
  let state = replaceSide(revealed(), 'side-b');
  const first = quote(getOriginalIds(state));
  const second = quote(getReplacementIds(state), 2500);
  first.items[1].subtotalCents = 1000;
  second.items[1].subtotalCents = 500;
  state = setComparison(state, first, second);
  const verdict = buildVerdict(state, { decision: 'swap', reason: '这份更合适' });
  assert.equal(verdict.original.items[1].subtotalCents, 1000);
  assert.equal(verdict.replacement.items[1].subtotalCents, 500);
  const forged = clone(verdict);
  forged.original.items[1].subtotalCents = 1;
  assert.equal(validateVerdict(forged).ok, false);
});

test('share boundary rejects credential keys, unknown shapes and prototype injection', () => {
  const clean = buildVerdict(compared(), { decision: 'swap', reason: '另一份更合口味' });
  const mutations = [
    value => { value.token = 'secret'; },
    value => { value.store.address = 'private address'; },
    value => { value.original.quote.source.Authorization = 'secret'; },
    value => { value.replacement.items[0].couponCode = 'private'; },
    value => { value.original.quote.items[0].qty = 1; },
    value => { value.original.quote.items[0].quantity = 2; },
    value => { value.reason = '长'.repeat(181); },
    value => { value.original.items[0].name = '长'.repeat(161); },
    value => { value.baseline.changedCents = 100; },
    value => { value.deltaCents = 42; },
    value => { value.replacement.items[0].id = 'main-b'; value.replacement.quote.items[0].id = 'main-b'; },
    value => { value.original.items[0].image = 'javascript:alert(1)'; },
    value => { value.original.items[0].image = 'https://localhost/image.png'; },
    value => { value.original.items[0].image = 'file:///private.png'; },
    value => { value.original.items[0].image = 'assets/menu/../secret.png'; },
    value => { value.original.items[0].image = 'https://mcd.cn.evil.example/image.png'; },
    value => { value.original.items[0].image = 'https://secret@mcd.cn/image.png'; },
    value => { value.original.items[0].image = 'assets/menu/%2e%2e%2fsecret.png'; },
    value => { value.original.items[0].image = 'https://menu-img.mcd.cn/image.png?token=secret'; }
  ];
  for (const mutate of mutations) {
    const value = clone(clean);
    mutate(value);
    assert.equal(validateVerdict(value).ok, false);
  }
  const injection = JSON.parse(JSON.stringify(clean).replace('"version":1', '"__proto__":{"token":"secret"},"version":1'));
  assert.equal(validateVerdict(injection).ok, false);
  assert.equal(validateVerdict(Object.create(clean)).ok, false);
});

test('safe menu images include verified official CDN but exclude unknown hosts', () => {
  const value = context();
  value.mainOptions[0].image = 'https://menu-img.mcd.cn/product/a.png';
  assert.equal(createSession(value).context.mainOptions[0].image, value.mainOptions[0].image);
  value.mainOptions[0].image = 'https://unknown.example/a.png';
  assert.throws(() => createSession(value), /图片/);
});

test('strict context rejects ambiguous categories, missing evidence and unsafe identifiers', () => {
  const duplicate = context();
  duplicate.drink.id = duplicate.mainOptions[0].id;
  assert.throws(() => createSession(duplicate), /重复/);
  const demo = context();
  demo.source.kind = 'demo';
  assert.throws(() => createSession(demo), /实际 MCP/);
  const badId = context();
  badId.mainOptions[0].id = '../secret';
  assert.throws(() => createSession(badId), /格式/);
  const one = context();
  one.sideOptions.pop(); one.sideOptions.pop();
  assert.throws(() => createSession(one), /2–30/);
});

test('money formats integer cents exactly without floating rounding or implicit coercion', () => {
  assert.equal(money(0), '¥0.00');
  assert.equal(money(1), '¥0.01');
  assert.equal(money(2505), '¥25.05');
  assert.equal(money(-505), '-¥5.05');
  assert.equal(money(Number.MAX_SAFE_INTEGER), '¥90071992547409.91');
  assert.throws(() => money('100'));
  assert.throws(() => money(0.1));
});

test('estimate defaults to skipped and validates integer cents without coercion', () => {
  const first = selected();
  assert.equal(first.estimateCents, null);
  for (const value of [0, 1, 99999, 100000]) {
    const next = setEstimate(first, value);
    assert.equal(next.estimateCents, value);
    assert.equal(first.estimateCents, null);
    assert.ok(Object.isFrozen(next));
  }
  for (const invalid of [-1, 100001, 0.1, '3000', NaN, Infinity, undefined, {}, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => setEstimate(first, invalid));
  }
  assert.equal(setEstimate(setEstimate(first, 3000), null).estimateCents, null);
});

test('first reveal freezes the estimate but only a blind-choice redo clears it', () => {
  const guessed = setEstimate(selected(), 2800);
  const sealed = setOriginalQuote(guessed, quote(getOriginalIds(guessed), 3000));
  assert.equal(sealed.estimateCents, 2800);
  assert.throws(() => setEstimate(sealed, 2900), /不能修改估价/);
  assert.throws(() => setEstimate(sealed, null), /不能修改估价/);
  const replaced = replaceSide(sealed, 'side-b');
  assert.equal(replaced.estimateCents, 2800);
  assert.equal(choose(sealed, 'main', 'main-b').estimateCents, null);
  assert.equal(choose(sealed, 'side', 'side-b').estimateCents, null);
  assert.equal(choose(guessed, 'side', 'side-b').estimateCents, null);
});

test('a skipped guess is not synthesized into a verdict and old snapshots remain valid', () => {
  const verdict = buildVerdict(compared(), { decision: 'keep', reason: '我喜欢原配餐' });
  assert.equal('estimate' in verdict, false);
  assert.deepEqual(validateVerdict(clone(verdict)), { ok: true, errors: [] });
});

test('estimate evidence binds to the first reveal instead of a refreshed or replacement price', () => {
  let state = setEstimate(selected(), 2800);
  state = setOriginalQuote(state, quote(getOriginalIds(state), 3000));
  state = replaceSide(state, 'side-b');
  state = setComparison(state, quote(getOriginalIds(state), 3100), quote(getReplacementIds(state), 2600));
  const verdict = buildVerdict(state, { decision: 'swap', reason: '  我想换这一份。  ' });
  assert.deepEqual(verdict.estimate, { guessCents: 2800, actualCents: 3000, differenceCents: 200 });
  assert.equal(verdict.baseline.changedCents, 100);
  assert.equal(verdict.deltaCents, -500);
  assert.equal(verdict.reason, '  我想换这一份。  ');
  assert.equal(validateVerdict(clone(verdict)).ok, true);
  assert.ok(Object.isFrozen(verdict.estimate));
});

test('estimate public boundary rejects unknown, malformed and price-drift forgery', () => {
  const base = buildVerdict(compared(3000, 3100, 2600), { decision: 'keep', reason: '保留这一口' });
  const mutations = [
    value => { value.estimate = null; },
    value => { value.estimate = { guessCents: 3000, actualCents: 3000 }; },
    value => { value.estimate = { guessCents: 3000, actualCents: 3000, differenceCents: 0, token: 'private' }; },
    value => { value.estimate = { guessCents: '3000', actualCents: 3000, differenceCents: 0 }; },
    value => { value.estimate = { guessCents: 100001, actualCents: 3000, differenceCents: -97001 }; },
    value => { value.estimate = { guessCents: -1, actualCents: 3000, differenceCents: 3001 }; },
    value => { value.estimate = { guessCents: 2800, actualCents: 3100, differenceCents: 300 }; },
    value => { value.estimate = { guessCents: 2800, actualCents: 2600, differenceCents: -200 }; },
    value => { value.estimate = { guessCents: 2800, actualCents: 3000, differenceCents: 300 }; },
    value => { value.estimate = { guessCents: 2800, actualCents: 3000, differenceCents: NaN }; }
  ];
  for (const mutate of mutations) {
    const verdict = clone(base);
    mutate(verdict);
    assert.equal(validateVerdict(verdict).ok, false);
  }
  const complete = clone(base);
  complete.estimate = { guessCents: 3100, actualCents: 3000, differenceCents: -100 };
  assert.equal(validateVerdict(complete).ok, true);
});

test('handwritten verdict text is kept verbatim while unsafe or empty text is rejected', () => {
  const reason = '  我就是想吃原来的那一份。　';
  const state = compared();
  const before = buildVerdict(state, { decision: 'keep', reason });
  const after = buildVerdict(state, { decision: 'swap', reason });
  assert.equal(before.reason, reason);
  assert.equal(after.reason, reason);
  assert.equal(validateVerdict(clone(before)).ok, true);
  for (const invalid of ['', '   ', '\u3000', '有\n换行', '\u0000', '长'.repeat(181)]) {
    assert.throws(() => buildVerdict(state, { decision: 'keep', reason: invalid }));
  }
});
