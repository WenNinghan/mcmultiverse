import { money, validateVerdict } from './triad-core.mjs';
import { verdictPresentation } from './triad-experience.mjs';

const PALETTE = Object.freeze({ paper: '#fffdf5', ink: '#183d32', green: '#254e3f', cream: '#f0eddf', yellow: '#f8d851', coral: '#d66b4f', muted: '#667066', line: '#d9ddce', white: '#ffffff' });
const WIDTH = 1400;
const MARGIN = 80;
const CONTENT = WIDTH - MARGIN * 2;
const FAMILY = '"Microsoft YaHei", "Noto Sans SC", sans-serif';
const SERIF = '"Noto Serif SC", "SimSun", serif';
const NO_LINE_START = new Set(Array.from('，。！？、；：）》」』】〕〉”’…,.!?;:%)]}'));
const NO_LINE_END = new Set(Array.from('（《「『【〔〈“‘([{'));

function checked(verdict) {
  const result = validateVerdict(verdict);
  if (!result.ok) throw new TypeError(`判决书证据无效：${result.errors.join('；')}`);
  return verdictPresentation(verdict);
}

function timestamp(value) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}

function feeDescription(quote) {
  const names = { deliveryCents: '配送费', packingCents: '包装费', tablewareCents: '餐具费' };
  return Object.entries(quote.fees || {}).filter(([, value]) => value > 0).map(([key, value]) => `${names[key]} ${money(value)}`).join('、');
}

function driftDescription(verdict) {
  const value = verdict.baseline.changedCents;
  return value ? `原盘时价：本次比首次${value > 0 ? '贵' : '便宜'} ${money(Math.abs(value))}；此项与改单差额分开记录。` : '';
}

/** The share text and image use the same validated presentation as the page. */
export function buildShareText(verdict) {
  const p = checked(verdict);
  const feesA = feeDescription(verdict.original.quote);
  const feesB = feeDescription(verdict.replacement.quote);
  const rows = [
    `我的这一口判决：${p.attitude}`,
    `${p.chosen === 'A' ? '✓ ' : ''}A 原盘：${p.originalSide.name} / 整盘总价 ${money(verdict.original.quote.totalCents)}`,
    `${p.chosen === 'B' ? '✓ ' : ''}B 新盘：${p.replacementSide.name} / 整盘总价 ${money(verdict.replacement.quote.totalCents)}`,
    p.question,
    `两盘都有：${verdict.original.items[0].name}＋${verdict.original.items[2].name}；三份餐品各 1 份，只换配餐。`,
    `我的判词原文：\n${verdict.reason}`,
    p.estimateNote || '',
    driftDescription(verdict),
    feesA || feesB ? `非零费用已计入各盘总额：A ${feesA || '未返回非零费用'}；B ${feesB || '未返回非零费用'}。` : '',
    `${verdict.store.name} · 到店取餐 · 未使用私人券`,
    `A 查询：${timestamp(verdict.original.quote.quotedAt)}；B 查询：${timestamp(verdict.replacement.quote.quotedAt)}（北京时间）。`,
    '麦当劳 MCP / calculate-price · 历史报价记录，非订单；当前价格与库存以实际点餐时为准。'
  ];
  return rows.filter(value => value !== '').join('\n');
}

function font(context, size, weight = 400, serif = false) {
  context.font = `${weight} ${size}px ${serif ? SERIF : FAMILY}`;
}

// No ellipsis or line cap: names and the handwritten reason remain complete.
function linesFor(context, value, maxWidth, size, weight = 400, serif = false) {
  font(context, size, weight, serif);
  const result = [];
  for (const paragraph of String(value).split(/\r\n|\r|\n/u)) {
    const characters = Array.from(paragraph);
    if (!characters.length) result.push('');
    let start = 0;
    while (start < characters.length) {
      let end = start + 1;
      while (end < characters.length && context.measureText(characters.slice(start, end + 1).join('')).width <= maxWidth) end += 1;
      // Chinese closing punctuation stays with its preceding character; an
      // opening bracket moves with the following text. Nothing is discarded.
      if (end < characters.length) {
        while (end > start + 1 && (NO_LINE_START.has(characters[end]) || NO_LINE_END.has(characters[end - 1]))) end -= 1;
      }
      result.push(characters.slice(start, end).join(''));
      start = end;
    }
  }
  return result;
}

function headlineLayout(context, value, maxWidth, initialSize = 70) {
  let size = initialSize;
  let lines = linesFor(context, value, maxWidth, size, 700);
  // A near-fit headline should not strand one punctuation mark or two words.
  if (lines.length === 2 && Array.from(lines[1].trim()).length <= 4) {
    for (let candidate = initialSize - 1; candidate >= initialSize - 8; candidate -= 1) {
      const smaller = linesFor(context, value, maxWidth, candidate, 700);
      if (smaller.length === 1) { size = candidate; lines = smaller; break; }
    }
  }
  if (lines.length > 1) {
    font(context, size, 700);
    const targetCount = lines.length;
    const score = rows => {
      const widths = rows.map(row => context.measureText(row).width);
      const lastLength = Array.from(rows.at(-1).trim()).length;
      return Math.max(...widths) - Math.min(...widths) + (lastLength <= 3 ? maxWidth * 3 : 0);
    };
    let bestScore = score(lines);
    // Keep the same line count while balancing a long title's final line.
    for (let width = maxWidth - 10; width >= maxWidth * 0.52; width -= 10) {
      const balanced = linesFor(context, value, width, size, 700);
      if (balanced.length > targetCount) break;
      const candidateScore = score(balanced);
      if (candidateScore < bestScore) { bestScore = candidateScore; lines = balanced; }
    }
    // For two lines, also prefer a natural split before the replacement verb.
    // This avoids cutting a short official product name solely to balance ink.
    const splitAt = value.indexOf('换成');
    if (targetCount === 2 && splitAt > 0) {
      const natural = [value.slice(0, splitAt), value.slice(splitAt)];
      if (natural.every(row => context.measureText(row).width <= maxWidth) && score(natural) <= bestScore + size * 2) lines = natural;
    }
  }
  return { lines, size, line: Math.ceil(size * 1.26) };
}

function drawLines(context, lines, x, top, { size = 28, line = 42, weight = 400, serif = false, color = PALETTE.ink } = {}) {
  font(context, size, weight, serif);
  context.fillStyle = color;
  context.textAlign = 'left';
  context.textBaseline = 'top';
  lines.forEach((row, index) => context.fillText(row, x, top + index * line));
  return top + lines.length * line;
}

function text(context, value, x, top, size = 26, weight = 400, color = PALETTE.ink, serif = false) {
  return drawLines(context, [String(value)], x, top, { size, line: size * 1.35, weight, color, serif });
}

function fittedText(context, value, x, top, maxWidth, size, weight, color, serif = false) {
  let fittedSize = size;
  font(context, fittedSize, weight, serif);
  while (context.measureText(value).width > maxWidth && fittedSize > 18) {
    fittedSize -= 1;
    font(context, fittedSize, weight, serif);
  }
  return text(context, value, x, top, fittedSize, weight, color, serif);
}

function panel(context, x, y, width, height, { fill = PALETTE.cream, stroke, lineWidth = 2, radius = 22 } = {}) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = lineWidth;
    context.stroke();
  }
}

function rule(context, y) {
  context.strokeStyle = PALETTE.line;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(MARGIN, y);
  context.lineTo(WIDTH - MARGIN, y);
  context.stroke();
}

function containedImage(context, image, x, y, width, height) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  context.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
}

function loadImage(src, name) {
  if (typeof src !== 'string' || !src.trim()) return Promise.reject(new Error(`${name}的图片地址为空，请重试。`));
  return new Promise((resolve, reject) => {
    const image = new Image();
    let timer;
    const clear = () => { clearTimeout(timer); image.onload = null; image.onerror = null; };
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      clear();
      if (image.naturalWidth > 0 && image.naturalHeight > 0) resolve(image);
      else reject(new Error(`${name}图片没有有效尺寸，请重试。`));
    };
    image.onerror = () => { clear(); reject(new Error(`${name}图片加载失败，请重试后再保存。`)); };
    timer = setTimeout(() => { clear(); image.src = ''; reject(new Error(`${name}图片加载超时，请重试后再保存。`)); }, 20000);
    image.src = src;
  });
}

/** Render only; the caller owns downloads and object-URL lifetime. */
export async function renderVerdictPng(verdict, { imageUrl } = {}) {
  const p = checked(verdict);
  if (typeof imageUrl !== 'function') throw new TypeError('需要提供本局餐品图片解析函数 imageUrl。');
  if (typeof document === 'undefined' || typeof Image === 'undefined') throw new Error('高清判决书需要在浏览器中保存。');
  await document.fonts.ready;
  const products = [verdict.original.items[0], verdict.original.items[2], p.originalSide, p.replacementSide];
  const images = await Promise.all(products.map(product => loadImage(imageUrl(product), product.name)));
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法创建图片画布，请重试。');

  // Measure every variable block before assigning the final canvas height.
  const attitude = headlineLayout(context, p.attitude, CONTENT, 72);
  const questionLines = linesFor(context, p.question, CONTENT - 64, 38, 600);
  const fixedLines = linesFor(context, `${products[0].name} ＋ ${products[1].name} · 各 1 份`, CONTENT - 240, 25);
  const nameLines = [p.originalSide, p.replacementSide].map(product => linesFor(context, product.name, 514, 34, 700));
  const reasonLines = linesFor(context, verdict.reason, CONTENT - 90, 46, 500);
  const footerRows = [
    ...(p.estimateNote ? [{ label: '猜价存证', value: `${p.estimateNote} · 首次查询 ${timestamp(verdict.baseline.initialQuotedAt)}` }] : []),
    ...(driftDescription(verdict) ? [{ label: '时价独立记', value: driftDescription(verdict) }] : []),
    ...(feeDescription(verdict.original.quote) || feeDescription(verdict.replacement.quote) ? [{ label: '非零费用', value: `已含在整盘总额：A ${feeDescription(verdict.original.quote) || '未返回非零费用'}；B ${feeDescription(verdict.replacement.quote) || '未返回非零费用'}。` }] : []),
    { label: '门店', value: `${verdict.store.name} · 到店取餐 · 未使用私人券` },
    { label: '两次查询', value: `A ${timestamp(verdict.original.quote.quotedAt)} ／ B ${timestamp(verdict.replacement.quote.quotedAt)}（北京时间）` },
    { label: '报价说明', value: '历史查询记录，非订单；当前价格与库存以实际点餐时为准。' }
  ].map(row => ({ ...row, lines: linesFor(context, row.value, CONTENT - 165, 22) }));

  const attitudeTop = 156;
  const questionTop = attitudeTop + attitude.lines.length * attitude.line + 24;
  const questionHeight = 36 + questionLines.length * 53;
  const plateTop = questionTop + questionHeight + 24;
  const plateHeight = 300 + Math.max(...nameLines.map(lines => lines.length)) * 46 + 100;
  const fixedTop = plateTop + plateHeight + 18;
  const fixedHeight = Math.max(100, 49 + fixedLines.length * 35);
  const reasonTop = fixedTop + fixedHeight + 22;
  const reasonHeight = 110 + reasonLines.length * 64;
  const footerTop = reasonTop + reasonHeight + 28;
  const footerHeight = footerRows.reduce((total, row) => total + Math.max(32, row.lines.length * 33) + 12, 0);
  canvas.height = Math.max(1260, Math.ceil(footerTop + footerHeight + 96));
  context.fillStyle = PALETTE.paper;
  context.fillRect(0, 0, WIDTH, canvas.height);
  panel(context, 26, 26, WIDTH - 52, canvas.height - 52, { fill: PALETTE.paper, stroke: PALETTE.line, radius: 30 });

  text(context, 'McMULTIVERSE', MARGIN, 68, 25, 700);
  text(context, '我的这一口判决书', MARGIN + 290, 68, 25);
  panel(context, WIDTH - MARGIN - 195, 56, 195, 50, { fill: PALETTE.yellow, radius: 25 });
  text(context, '只换一份 · 你来判', WIDTH - MARGIN - 173, 68, 20, 700);
  rule(context, 130);
  drawLines(context, attitude.lines, MARGIN, attitudeTop, { size: attitude.size, line: attitude.line, weight: 700 });
  panel(context, MARGIN, questionTop, CONTENT, questionHeight, { fill: PALETTE.yellow, radius: 18 });
  drawLines(context, questionLines, MARGIN + 32, questionTop + 18, { size: 38, line: 53, weight: 600 });

  const cardWidth = 600;
  for (let index = 0; index < 2; index += 1) {
    const chosen = p.chosen === (index === 0 ? 'A' : 'B');
    const x = MARGIN + index * (cardWidth + 40);
    panel(context, x, plateTop, cardWidth, plateHeight, { fill: chosen ? '#f7f8ed' : '#f2efe4', stroke: chosen ? PALETTE.ink : PALETTE.line, lineWidth: chosen ? 4 : 2, radius: 24 });
    text(context, index === 0 ? 'A  原来那盘' : 'B  换后那盘', x + 30, plateTop + 24, 28, 700);
    if (chosen) {
      panel(context, x + 414, plateTop + 18, 160, 46, { fill: PALETTE.ink, radius: 23 });
      text(context, '✓ 我的选择', x + 434, plateTop + 29, 22, 700, PALETTE.paper);
    }
    containedImage(context, images[index + 2], x + 55, plateTop + 89, 490, 190);
    drawLines(context, nameLines[index], x + 43, plateTop + 294, { size: 34, line: 46, weight: 700 });
    const totalTop = plateTop + plateHeight - 99;
    text(context, '整盘总价', x + 32, totalTop + 22, 28, 700, PALETTE.muted);
    fittedText(context, money(index === 0 ? verdict.original.quote.totalCents : verdict.replacement.quote.totalCents), x + 171, totalTop + 9, 394, 57, 700, PALETTE.ink, true);
    if (index === 1) text(context, '仅此份变化', x + 32, plateTop + 73, 21, 500, PALETTE.coral);
  }
  panel(context, WIDTH / 2 - 26, plateTop + 175, 52, 52, { fill: PALETTE.paper, stroke: PALETTE.line, radius: 26 });
  text(context, '→', WIDTH / 2 - 16, plateTop + 183, 34, 700, PALETTE.coral);

  panel(context, MARGIN, fixedTop, CONTENT, fixedHeight, { fill: '#eeefe5', radius: 18 });
  containedImage(context, images[0], MARGIN + 16, fixedTop + 10, 92, fixedHeight - 20);
  containedImage(context, images[1], MARGIN + 111, fixedTop + 10, 78, fixedHeight - 20);
  text(context, '两盘的主食、饮品没动', MARGIN + 212, fixedTop + 14, 24, 700);
  drawLines(context, fixedLines, MARGIN + 212, fixedTop + 49, { size: 25, line: 35, color: PALETTE.muted });

  panel(context, MARGIN, reasonTop, CONTENT, reasonHeight, { fill: PALETTE.ink, radius: 24 });
  text(context, '我的判词 · 原样存证', MARGIN + 45, reasonTop + 28, 26, 500, PALETTE.yellow);
  drawLines(context, reasonLines, MARGIN + 45, reasonTop + 76, { size: 46, line: 64, weight: 500, color: PALETTE.paper });

  let cursor = footerTop;
  for (const row of footerRows) {
    text(context, row.label, MARGIN, cursor, 21, 700, PALETTE.muted);
    drawLines(context, row.lines, MARGIN + 155, cursor, { size: 22, line: 33, color: PALETTE.muted });
    cursor += Math.max(32, row.lines.length * 33) + 12;
  }
  rule(context, canvas.height - 75);
  text(context, '麦当劳 MCP / calculate-price', MARGIN, canvas.height - 52, 18, 500, PALETTE.muted);
  text(context, '非官方创意作品 · 餐品图版权归各权利人', 814, canvas.height - 52, 18, 400, PALETTE.muted);

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('判决书图片导出失败，请重试。')), 'image/png');
    } catch (error) {
      reject(new Error(`判决书图片导出失败：${error.message}`));
    }
  });
}
