import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSession, choose, getOriginalIds, setEstimate, setOriginalQuote,
  replaceSide, getReplacementIds, setComparison, buildVerdict, money
} from '../assets/triad-core.mjs';
import { verdictPresentation } from '../assets/triad-experience.mjs';
import { buildShareText, renderVerdictPng } from '../assets/triad-share.mjs';

// Synthetic evidence is confined to tests and cannot enter a playable round.
function fixture({ decision = 'keep', deltaCents = -50, driftCents = 0, guessCents = null,
  reason = '  我就想吃这一份，便宜也不换。　', originalName = '合成中薯条', replacementName = '合成玉米杯', fees = {} } = {}) {
  const item = (id, name) => ({ id, name, image: `assets/menu/${id}.png` });
  const firstTime = '2026-10-17T03:00:00.000Z';
  const timeA = '2026-10-17T03:05:00.000Z';
  const timeB = '2026-10-17T03:06:00.000Z';
  const store = { code: 'share-fixture-store', name: '合成分享测试门店' };
  let session = createSession({
    sessionId: 'share-fixture', store,
    mainOptions: [item('main-a', '合成汉堡甲'), item('main-b', '合成汉堡乙')],
    sideOptions: [item('side-a', originalName), item('side-b', replacementName)],
    drink: item('drink', '合成咖啡'), source: { kind: 'mcp', fetchedAt: firstTime }
  });
  const quote = (ids, totalCents, quotedAt) => ({
    source: { kind: 'mcp', tool: 'calculate-price' }, store,
    totalCents, quotedAt, items: ids.map(id => ({ id, quantity: 1 })), fees
  });
  session = choose(choose(session, 'main', 'main-a'), 'side', 'side-a');
  session = setEstimate(session, guessCents);
  session = setOriginalQuote(session, quote(getOriginalIds(session), 3000, firstTime));
  session = replaceSide(session, 'side-b');
  session = setComparison(session,
    quote(getOriginalIds(session), 3000 + driftCents, timeA),
    quote(getReplacementIds(session), 3000 + driftCents + deltaCents, timeB));
  return buildVerdict(session, { decision, reason });
}

for (const decision of ['keep', 'swap']) {
  for (const deltaCents of [-50, 0, 500]) {
    test(`share keeps the selected plate separate from price direction: ${decision}, B-A=${deltaCents}`, () => {
      const verdict = fixture({ decision, deltaCents });
      const p = verdictPresentation(verdict);
      const share = buildShareText(verdict);
      assert.ok(share.startsWith(`我的这一口判决：${p.attitude}\n`));
      const lines = share.split('\n');
      const selected = lines.filter(line => line.startsWith('✓ '));
      assert.equal(selected.length, 1);
      assert.ok(selected[0].startsWith(decision === 'keep' ? '✓ A 原盘：' : '✓ B 新盘：'));
      assert.ok(share.includes(`A 原盘：合成中薯条 / 整盘总价 ${money(3000)}`));
      assert.ok(share.includes(`B 新盘：合成玉米杯 / 整盘总价 ${money(3000 + deltaCents)}`));
      assert.equal(lines.filter(line => line === p.question).length, 1);
      assert.equal(lines.filter(line => line === p.direction).length, 0);
      assert.equal(share.includes(p.chosenExplanation), false);
      assert.ok(share.includes('三份餐品各 1 份，只换配餐'));
      assert.ok(share.includes('历史报价记录，非订单'));
      assert.equal(/我(?:花了|付了|买了|省下)/u.test(share), false);
    });
  }
}

test('share preserves the complete handwritten reason including its outer spaces', () => {
  const reason = '  我选的是此刻的胃口，不是推荐答案。　';
  const share = buildShareText(fixture({ reason, decision: 'swap', deltaCents: 500 }));
  assert.ok(share.includes(`我的判词原文：\n${reason}\n`));
  assert.equal(share.split(reason).length - 1, 1);
  assert.equal(share.includes('我的判词原文：\n我选'), false);
});

test('share keeps complete long official names and 80 characters of original writing', () => {
  const originalName = `合成（${'长原配餐名称'.repeat(20)}）`;
  const replacementName = `合成「${'长新配餐名称'.repeat(20)}」`;
  const reason = '字'.repeat(80);
  const share = buildShareText(fixture({ originalName, replacementName, reason }));
  assert.ok(share.includes(originalName));
  assert.ok(share.includes(replacementName));
  assert.ok(share.includes(`我的判词原文：\n${reason}\n`));
});

test('share records first estimate independently of later price drift and optional fees', () => {
  const share = buildShareText(fixture({ guessCents: 2800, driftCents: 200, deltaCents: -50, fees: { packingCents: 100, deliveryCents: 0 } }));
  assert.ok(share.includes('首次官方报价 ¥30.00'));
  assert.ok(share.includes('比我猜的高 ¥2.00'));
  assert.ok(share.includes('整盘总价 ¥32.00'));
  assert.ok(share.includes('整盘总价 ¥31.50'));
  assert.ok(share.includes('原盘时价：本次比首次贵 ¥2.00'));
  assert.ok(share.includes('此项与改单差额分开记录'));
  assert.ok(share.includes('非零费用已计入各盘总额：A 包装费 ¥1.00；B 包装费 ¥1.00'));
  assert.ok(share.includes('A 查询：2026/10/17 11:05:00；B 查询：2026/10/17 11:06:00（北京时间）'));
  assert.ok(share.includes('合成分享测试门店 · 到店取餐 · 未使用私人券'));
  assert.ok(share.includes('麦当劳 MCP / calculate-price'));
});

test('share omits empty estimate, zero fees, and zero market drift without weakening price disclosure', () => {
  const share = buildShareText(fixture({ fees: { packingCents: 0 } }));
  assert.equal(share.includes('揭价前我猜'), false);
  assert.equal(share.includes('原盘时价'), false);
  assert.equal(share.includes('非零费用'), false);
  assert.ok(share.includes('当前价格与库存以实际点餐时为准'));
});

test('invalid snapshots fail before text or image generation and never leak extra fields', async () => {
  const forged = { ...fixture(), deltaCents: 123 };
  assert.throws(() => buildShareText(forged), /差额/u);
  await assert.rejects(renderVerdictPng(forged, { imageUrl() { throw new Error('must not load'); } }), /差额/u);
  assert.throws(() => buildShareText({ ...fixture(), token: 'synthetic-secret' }), /未允许字段/u);
});

test('image export requires an explicit image resolver and browser instead of claiming a silent fallback', async () => {
  await assert.rejects(renderVerdictPng(fixture()), /imageUrl/u);
  await assert.rejects(renderVerdictPng(fixture(), { imageUrl: item => item.image }), /浏览器/u);
});
