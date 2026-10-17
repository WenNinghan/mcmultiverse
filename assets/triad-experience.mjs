/**
 * Shared display semantics for the page, exported image and copied text.
 * All comparisons read B relative to A; the player's chosen plate is separate.
 * No network, DOM, clock, generated prices or changes to the order live here.
 */
import { money, validateVerdict } from './triad-core.mjs';

function signed(value) {
  if (!Number.isSafeInteger(value)) throw new TypeError('两盘差额必须是安全整数分');
  return value;
}
function publicText(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${label}必须是 1–${max} 字的文本`);
  }
  return value;
}
function detailsOf(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) throw new TypeError('判词需要餐盘详情');
  if (details.decision !== 'keep' && details.decision !== 'swap') throw new TypeError('请先选择保留 A 或换成 B');
  return {
    decision: details.decision,
    originalSide: publicText(details.originalSide, '原配餐', 160),
    replacementSide: publicText(details.replacementSide, '新配餐', 160),
    deltaCents: signed(details.deltaCents)
  };
}
function displayName(value) {
  // Long official titles may be abbreviated in suggestions; the signed snapshot
  // and hand-written text always keep the complete original strings.
  return value.length > 48 ? `${value.slice(0, 47)}…` : value;
}

export function comparisonCopy(deltaCents) {
  signed(deltaCents);
  if (deltaCents > 0) return `B 比 A 贵 ${money(deltaCents)}`;
  if (deltaCents < 0) return `B 比 A 便宜 ${money(-deltaCents)}`;
  return 'A、B 两盘同价';
}

/** A short stance about this choice, never a receipt for an actual purchase. */
export function choiceAttitude(details) {
  const { decision, originalSide, replacementSide, deltaCents } = detailsOf(details);
  const before = displayName(originalSide);
  const after = displayName(replacementSide);
  const difference = money(Math.abs(deltaCents));
  if (decision === 'keep') {
    if (deltaCents < 0) return `省 ${difference} 也不换，我站${before}。`;
    if (deltaCents > 0) return `多 ${difference}？我还是站${before}。`;
    return `同价也不换，我站${before}。`;
  }
  if (deltaCents < 0) return `少 ${difference}，我选${after}。`;
  if (deltaCents > 0) return `多 ${difference}，我选${after}。`;
  return `同价换个口味，我选${after}。`;
}

export function reasonOptions(details) {
  const { decision, originalSide: original, replacementSide: replacement } = detailsOf(details);
  const before = displayName(original);
  const after = displayName(replacement);
  if (decision === 'keep') {
    return Object.freeze([
      choiceAttitude(details),
      `我选 A 原盘，${before}更合我的口味。`,
      `这次不换${after}，主食、饮品和${before}都照旧。`
    ]);
  }
  return Object.freeze([
    choiceAttitude(details),
    `我选 B 新盘，今天更想吃${after}。`,
    `只换这一份${after}，主食和饮品照旧。`
  ]);
}

export function handwriteReason(text) {
  return Object.freeze({ kind: 'handwritten', text: publicText(text, '手写判词', 180) });
}

export function chooseReason(details, index = 0) {
  const options = reasonOptions(details);
  if (!Number.isInteger(index) || index < 0 || index >= options.length) throw new TypeError('请选择已有的推荐判词');
  return Object.freeze({ kind: 'suggested', text: options[index], template: index });
}

export function syncReasonDraft(draft, details) {
  if (draft?.kind === 'handwritten') return handwriteReason(draft.text);
  if (draft?.kind === 'suggested') return chooseReason(details, draft.template);
  if (draft == null) return chooseReason(details, 0);
  throw new TypeError('判词草稿类型不正确');
}

/** The actual amount must be the first successful official reveal. */
export function estimateFeedback(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new TypeError('猜价反馈需要金额详情');
  const { guessCents, actualCents } = values;
  if (!Number.isSafeInteger(actualCents) || actualCents < 0) throw new TypeError('首次官方报价必须是非负安全整数分');
  if (guessCents === null) {
    return Object.freeze({
      title: '这次直接揭价。',
      detail: `首次官方报价 ${money(actualCents)}；本局跳过猜价。`,
      gapCents: null
    });
  }
  if (!Number.isSafeInteger(guessCents) || guessCents < 0 || guessCents > 100000) throw new TypeError('我的估价必须在 0–100000 整数分之间');
  const gapCents = actualCents - guessCents;
  return Object.freeze({
    title: gapCents === 0 ? '正好猜中！' : `你把这盘${gapCents > 0 ? '低估' : '高估'}了 ${money(Math.abs(gapCents))}。`,
    detail: `你猜 ${money(guessCents)}，首次官方报价 ${money(actualCents)}。`,
    gapCents
  });
}

export function verdictPresentation(verdict) {
  const validation = validateVerdict(verdict);
  if (!validation.ok) throw new TypeError(validation.errors.join('；'));
  const originalSide = verdict.original.items[1];
  const replacementSide = verdict.replacement.items[1];
  const chosen = verdict.decision === 'keep' ? 'A' : 'B';
  const direction = comparisonCopy(verdict.deltaCents);
  let question;
  if (verdict.deltaCents === 0) {
    question = `两盘同价，${originalSide.name}和${replacementSide.name}，你选哪一份？`;
  } else {
    question = `${verdict.deltaCents < 0 ? '少' : '多'} ${money(Math.abs(verdict.deltaCents))}，把${originalSide.name}换成${replacementSide.name}，你换吗？`;
  }
  const result = {
    chosen,
    chosenLabel: chosen === 'A' ? '保留 A 原盘' : '换成 B 新盘',
    direction,
    question,
    attitude: choiceAttitude({
      decision: verdict.decision,
      originalSide: originalSide.name,
      replacementSide: replacementSide.name,
      deltaCents: verdict.deltaCents
    }),
    chosenExplanation: `我选 ${chosen} ${chosen === 'A' ? '原盘' : '新盘'}；${direction}。`,
    originalSide,
    replacementSide,
    chosenTotalCents: (chosen === 'A' ? verdict.original : verdict.replacement).quote.totalCents
  };
  if (verdict.estimate) {
    const { guessCents, actualCents, differenceCents } = verdict.estimate;
    const difference = differenceCents === 0
      ? '这次刚好猜中。'
      : `比我猜的${differenceCents > 0 ? '高' : '低'} ${money(Math.abs(differenceCents))}。`;
    result.estimateNote = `揭价前我猜 ${money(guessCents)}，首次官方报价 ${money(actualCents)}，${difference}`;
  }
  return Object.freeze(result);
}

/** Replay goals use this completed round only, not guessed future menu prices. */
export function replayGoal(verdict) {
  if (verdict === null) {
    return Object.freeze({
      title: '再盲选一盘，看看直觉准不准。',
      detail: '先选想吃的，再揭开本店真实报价；猜价可以跳过。',
      button: '开始盲选'
    });
  }
  const presentation = verdictPresentation(verdict);
  if (verdict.estimate) {
    const { guessCents, actualCents } = verdict.estimate;
    const { gapCents } = estimateFeedback({ guessCents, actualCents });
    if (gapCents === 0) {
      return Object.freeze({
        title: '刚才正好猜中，这次还能吗？',
        detail: `上局猜 ${money(guessCents)}，首次报价也是 ${money(actualCents)}。再盲选一盘，试试还能不能猜中；也可以跳过。`,
        button: '再猜一盘'
      });
    }
    const gap = money(Math.abs(gapCents));
    return Object.freeze({
      title: `刚才${gapCents > 0 ? '低估' : '高估'} ${gap}，再猜一盘。`,
      detail: `上局猜 ${money(guessCents)}，首次报价 ${money(actualCents)}。这次试着把误差缩到 ${gap} 以内；猜价仍可跳过。`,
      button: '再猜一盘'
    });
  }
  const chosenSide = presentation.chosen === 'A' ? presentation.originalSide : presentation.replacementSide;
  return Object.freeze({
    title: '再盲选一盘，你还站它吗？',
    detail: `上一局你选了${displayName(chosenSide.name)}。下局换个口味再做一次选择；也可以试试猜价。`,
    button: '新餐品再判'
  });
}
