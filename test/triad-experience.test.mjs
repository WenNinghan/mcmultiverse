import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSession, choose, getOriginalIds, setEstimate, setOriginalQuote,
  replaceSide, getReplacementIds, setComparison, buildVerdict, money
} from '../assets/triad-core.mjs';
import {
  comparisonCopy, choiceAttitude, reasonOptions, chooseReason, handwriteReason,
  syncReasonDraft, verdictPresentation, estimateFeedback, replayGoal
} from '../assets/triad-experience.mjs';

// These deliberately synthetic prices and items never enter a production page.
const time = '2026-10-17T03:00:00.000Z';
const item = (id, name) => ({ id, name, image: `assets/menu/${name}.png` });
const details = (decision = 'keep', deltaCents = -50) => ({
  decision, originalSide: '合成中薯条', replacementSide: '合成玉米杯', deltaCents
});
function verdict(decision, deltaCents, guessCents = null, driftCents = 0) {
  let session = createSession({
    sessionId: 'experience-fixture', store: { code: 'fixture-store', name: '合成展示测试门店' },
    mainOptions: [item('main-a', '合成汉堡甲'), item('main-b', '合成汉堡乙')],
    sideOptions: [item('side-a', '合成中薯条'), item('side-b', '合成玉米杯')],
    drink: item('drink', '合成咖啡'), source: { kind: 'mcp', fetchedAt: time }
  });
  session = choose(choose(session, 'main', 'main-a'), 'side', 'side-a');
  session = setEstimate(session, guessCents);
  const quote = (ids, totalCents) => ({
    source: { kind: 'mcp', tool: 'calculate-price' },
    store: { code: 'fixture-store', name: '合成展示测试门店' },
    totalCents, quotedAt: time, items: ids.map(id => ({ id, quantity: 1 }))
  });
  session = setOriginalQuote(session, quote(getOriginalIds(session), 3000));
  session = replaceSide(session, 'side-b');
  session = setComparison(session, quote(getOriginalIds(session), 3000 + driftCents), quote(getReplacementIds(session), 3000 + driftCents + deltaCents));
  return buildVerdict(session, { decision, reason: chooseReason(details(decision, deltaCents)).text });
}

test('comparison direction is B relative to A and never a free-floating more/less amount', () => {
  assert.equal(comparisonCopy(500), 'B 比 A 贵 ¥5.00');
  assert.equal(comparisonCopy(-50), 'B 比 A 便宜 ¥0.50');
  assert.equal(comparisonCopy(0), 'A、B 两盘同价');
  for (const invalid of [1.1, '50', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => comparisonCopy(invalid));
  }
});

for (const decision of ['keep', 'swap']) {
  for (const deltaCents of [-50, 0, 500]) {
    test(`presentation keeps choice and direction consistent: ${decision}, B-A=${deltaCents}`, () => {
      const data = verdict(decision, deltaCents);
      const result = verdictPresentation(data);
      const chosen = decision === 'keep' ? 'A' : 'B';
      assert.equal(result.chosen, chosen);
      assert.equal(result.chosenLabel, decision === 'keep' ? '保留 A 原盘' : '换成 B 新盘');
      assert.equal(result.direction, comparisonCopy(deltaCents));
      assert.ok(result.chosenExplanation.includes(`我选 ${chosen} `));
      assert.ok(result.chosenExplanation.includes(result.direction));
      assert.equal(result.chosenTotalCents, 3000 + (decision === 'keep' ? 0 : deltaCents));
      assert.equal(result.originalSide, data.original.items[1]);
      assert.equal(result.replacementSide, data.replacement.items[1]);
      assert.ok(result.question.includes('合成中薯条'));
      assert.ok(result.question.includes('合成玉米杯'));
      assert.equal(result.attitude, choiceAttitude(details(decision, deltaCents)));
      if (deltaCents === 0) assert.ok(result.question.startsWith('两盘同价'));
      else assert.ok(result.question.startsWith(`${deltaCents < 0 ? '少' : '多'} ${money(Math.abs(deltaCents))}`));
      assert.equal('estimateNote' in result, false);
      assert.ok(Object.isFrozen(result));
    });
  }
}

test('suggested reasons follow an actual reversal and a changed side or quote', () => {
  const initial = chooseReason(details('swap', -50));
  assert.equal(initial.kind, 'suggested');
  assert.equal(initial.text, '少 ¥0.50，我选合成玉米杯。');
  const reversed = syncReasonDraft(initial, details('keep', -50));
  assert.equal(reversed.text, '省 ¥0.50 也不换，我站合成中薯条。');
  assert.equal(reversed.text.includes('我把'), false);
  const changed = syncReasonDraft(reversed, { ...details('keep', 300), replacementSide: '合成新配餐' });
  assert.equal(changed.text, '多 ¥3.00？我还是站合成中薯条。');
  const template2 = chooseReason(details('swap', -50), 2);
  const synced = syncReasonDraft(template2, { ...details('swap', 100), replacementSide: '合成新配餐' });
  assert.equal(synced.template, 2);
  assert.ok(synced.text.includes('合成新配餐'));
  assert.equal(synced.text.includes('合成玉米杯'), false);
  assert.equal(initial.text.includes('我站'), false);
});

test('three genuine choice-aware reason candidates are offered for each direction', () => {
  for (const decision of ['keep', 'swap']) {
    for (const deltaCents of [-50, 0, 500]) {
      const options = reasonOptions(details(decision, deltaCents));
      assert.equal(options.length, 3);
      assert.equal(new Set(options).size, 3);
      assert.equal(options[0], choiceAttitude(details(decision, deltaCents)));
      for (let index = 0; index < options.length; index++) {
        const draft = chooseReason(details(decision, deltaCents), index);
        assert.equal(draft.text, options[index]);
        assert.ok(draft.text.includes(decision === 'keep' ? '合成中薯条' : '合成玉米杯'));
        assert.ok(draft.text.length <= 180);
      }
    }
  }
});

test('handwritten draft stays byte-for-byte identical through reversal and changed candidates', () => {
  const text = '  我就是想吃这一份，五毛也不换。　';
  const first = handwriteReason(text);
  assert.deepEqual(first, { kind: 'handwritten', text });
  let next = first;
  for (const current of [details('keep', -50), details('swap', 500), { ...details('keep', 0), replacementSide: '合成新配餐' }]) {
    next = syncReasonDraft(next, current);
    assert.equal(next.text, text);
    assert.equal(next.kind, 'handwritten');
  }
  assert.ok(Object.isFrozen(first));
  assert.equal(syncReasonDraft(null, details()).kind, 'suggested');
});

test('suggestions stay signable with long official names without touching complete item names', () => {
  const long = { ...details('swap', Number.MAX_SAFE_INTEGER), originalSide: '原'.repeat(160), replacementSide: '新'.repeat(160) };
  const reasons = reasonOptions(long);
  assert.ok(reasons.every(reason => reason.length <= 180));
  assert.ok(reasons[0].includes('…'));
  assert.equal(long.originalSide.length, 160);
});

test('reason helper rejects unsafe/empty drafts and invalid choice details', () => {
  for (const text of ['', '  ', '多\n行', '\u007f', '长'.repeat(181), null]) assert.throws(() => handwriteReason(text));
  for (const index of [-1, 3, 0.5, '0']) assert.throws(() => chooseReason(details(), index));
  assert.throws(() => reasonOptions({ ...details(), decision: 'unknown' }));
  assert.throws(() => reasonOptions({ ...details(), deltaCents: '50' }));
  assert.throws(() => syncReasonDraft({ kind: 'unknown', text: '待验证' }, details()));
});

for (const [guessCents, expected] of [[2800, '高 ¥2.00'], [3000, '刚好猜中'], [3200, '低 ¥2.00']]) {
  test(`estimate note uses first reveal after price drift: guess=${guessCents}`, () => {
    const data = verdict('keep', -50, guessCents, 200);
    const presentation = verdictPresentation(data);
    assert.ok(presentation.estimateNote.includes(`我猜 ${money(guessCents)}`));
    assert.ok(presentation.estimateNote.includes('首次官方报价 ¥30.00'));
    assert.ok(presentation.estimateNote.includes(expected));
    assert.equal(presentation.chosenTotalCents, 3200);
    assert.equal(data.baseline.changedCents, 200);
  });
}

test('presentation validates imported snapshots before producing share copy', () => {
  const clean = verdict('keep', -50);
  const invalid = JSON.parse(JSON.stringify(clean));
  invalid.deltaCents = 50;
  assert.throws(() => verdictPresentation(invalid), /差额/);
  assert.throws(() => verdictPresentation({ ...clean, token: 'private' }), /未允许字段/);
  assert.equal('estimateNote' in verdictPresentation(clean), false);
});

for (const [decision, deltaCents, expected] of [
  ['keep', -50, '省 ¥0.50 也不换，我站合成中薯条。'],
  ['keep', 0, '同价也不换，我站合成中薯条。'],
  ['keep', 100, '多 ¥1.00？我还是站合成中薯条。'],
  ['swap', -50, '少 ¥0.50，我选合成玉米杯。'],
  ['swap', 0, '同价换个口味，我选合成玉米杯。'],
  ['swap', 100, '多 ¥1.00，我选合成玉米杯。']
]) {
  test(`short attitude tells the actual tradeoff: ${decision}, B-A=${deltaCents}`, () => {
    assert.equal(choiceAttitude(details(decision, deltaCents)), expected);
    assert.equal(reasonOptions(details(decision, deltaCents))[0], expected);
  });
}

test('attitude is a separate suggestion and never replaces handwritten snapshot text', () => {
  const reason = '  我就是偏爱这一份，价格只是参考。　';
  const data = { ...verdict('keep', -50), reason };
  const before = JSON.stringify(data);
  const presentation = verdictPresentation(data);
  assert.equal(presentation.attitude, '省 ¥0.50 也不换，我站合成中薯条。');
  assert.equal(data.reason, reason);
  replayGoal(data);
  assert.equal(JSON.stringify(data), before);
});

test('the share question retains full official side names while a short attitude may abbreviate', () => {
  const data = JSON.parse(JSON.stringify(verdict('swap', -50)));
  const originalName = `${'原餐'.repeat(40)}中薯条`;
  const replacementName = `${'新餐'.repeat(40)}麦辣鸡翅2块`;
  data.original.items[1].name = originalName;
  data.replacement.items[1].name = replacementName;
  const result = verdictPresentation(data);
  assert.ok(result.question.includes(originalName));
  assert.ok(result.question.includes(replacementName));
  assert.equal(result.question.includes('…'), false);
  assert.ok(result.attitude.includes('…'));
  assert.equal(result.originalSide.name, originalName);
  assert.equal(result.replacementSide.name, replacementName);
});

for (const [guessCents, actualCents, gapCents, expected] of [
  [3200, 4650, 1450, '你把这盘低估了 ¥14.50。'],
  [5000, 4650, -350, '你把这盘高估了 ¥3.50。'],
  [4650, 4650, 0, '正好猜中！'],
  [0, 0, 0, '正好猜中！']
]) {
  test(`estimate feedback compares first official quote: ${guessCents} -> ${actualCents}`, () => {
    const result = estimateFeedback({ guessCents, actualCents });
    assert.equal(result.title, expected);
    assert.equal(result.gapCents, gapCents);
    assert.equal(result.detail, `你猜 ${money(guessCents)}，首次官方报价 ${money(actualCents)}。`);
    assert.ok(Object.isFrozen(result));
  });
}

test('skipping estimate produces no invented guess or comparison', () => {
  assert.deepEqual(estimateFeedback({ guessCents: null, actualCents: 4650 }), {
    title: '这次直接揭价。', detail: '首次官方报价 ¥46.50；本局跳过猜价。', gapCents: null
  });
});

test('estimate feedback rejects floats, coercion, missing values and out-of-range guesses', () => {
  for (const guessCents of [-1, 100001, 10.1, '3200', undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => estimateFeedback({ guessCents, actualCents: 4650 }));
  }
  for (const actualCents of [-1, 46.5, '4650', null, undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => estimateFeedback({ guessCents: 3200, actualCents }));
  }
  for (const value of [null, undefined, [], 1, '']) assert.throws(() => estimateFeedback(value));
  assert.equal(estimateFeedback({ guessCents: 100000, actualCents: 100001 }).gapCents, 1);
});

for (const [guessCents, expectedTitle, expectedGap] of [
  [2800, '刚才低估 ¥2.00，再猜一盘。', '¥2.00'],
  [3200, '刚才高估 ¥2.00，再猜一盘。', '¥2.00']
]) {
  test(`replay goal comes from first reveal despite later drift: guess=${guessCents}`, () => {
    const data = verdict('swap', -50, guessCents, 500);
    const result = replayGoal(data);
    assert.equal(result.title, expectedTitle);
    assert.ok(result.detail.includes('首次报价 ¥30.00'));
    assert.ok(result.detail.includes(`误差缩到 ${expectedGap} 以内`));
    assert.equal(result.detail.includes('¥35.00'), false);
    assert.equal(result.button, '再猜一盘');
    assert.ok(Object.isFrozen(result));
  });
}

test('a previously exact guess gets an honest repeat challenge without impossible smaller-error goal', () => {
  const result = replayGoal(verdict('keep', 500, 3000, 500));
  assert.equal(result.title, '刚才正好猜中，这次还能吗？');
  assert.ok(result.detail.includes('上局猜 ¥30.00，首次报价也是 ¥30.00'));
  assert.equal(result.detail.includes('以内'), false);
  assert.ok(result.detail.includes('也可以跳过'));
});

test('skipped-estimate replay goal refers to the actual selected side for either decision', () => {
  for (const decision of ['keep', 'swap']) {
    const result = replayGoal(verdict(decision, -50));
    assert.equal(result.title, '再盲选一盘，你还站它吗？');
    assert.ok(result.detail.includes(decision === 'keep' ? '合成中薯条' : '合成玉米杯'));
    assert.equal(result.detail.includes('低估'), false);
    assert.equal(result.detail.includes('高估'), false);
    assert.equal(result.detail.includes('猜中'), false);
    assert.equal(result.button, '新餐品再判');
  }
});

test('replay goal supports no previous round and validates old/imported snapshots', () => {
  assert.deepEqual(replayGoal(null), {
    title: '再盲选一盘，看看直觉准不准。',
    detail: '先选想吃的，再揭开本店真实报价；猜价可以跳过。',
    button: '开始盲选'
  });
  const legacy = verdict('keep', 0);
  assert.equal('estimate' in legacy, false);
  assert.doesNotThrow(() => replayGoal(legacy));
  assert.throws(() => replayGoal({ ...legacy, deltaCents: 1 }), /差额/);
  assert.throws(() => replayGoal({ ...legacy, token: 'private' }), /未允许字段/);
  assert.throws(() => replayGoal(undefined));
});
