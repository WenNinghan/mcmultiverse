/* 餐品图资源校验：确保审判庭每个 SKU 都挂真实官方图，且文件真实存在、规格统一 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'index.html');
const html = fs.readFileSync(HTML, 'utf8');

let pass = 0, fail = 0;
function ok(cond, msg){
  if(cond){ pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.log(`  ✗ ${msg}`); }
}

// ---- 从 index.html 的 DATA.menu 中提取 name + img ----
const mStart = html.indexOf('  menu: [');
const mEnd = html.indexOf('  itemCoupons: [');
const block = html.slice(mStart, mEnd);
const items = [...block.matchAll(/\{name:'([^']+)'(?:,\s*img:'([^']+)')?/g)]
  .map(m => ({ name: m[1], img: m[2] || null }));

console.log(`\n[1] 菜单 SKU 与图片字段`);
ok(items.length === 31, `菜单 SKU 共 ${items.length} 项（期望 31）`);
const noImg = items.filter(i => !i.img);
ok(noImg.length === 0, noImg.length === 0
  ? '每一项都带 img 字段（0 项使用 emoji 兜底）'
  : `缺少 img 的项: ${noImg.map(i => i.name).join('、')}`);

console.log(`\n[2] 图片文件真实存在`);
const missing = [];
const bad = [];
const sizes = new Set();
for(const it of items){
  if(!it.img) continue;
  const p = path.join(ROOT, it.img);
  if(!fs.existsSync(p)){ missing.push(`${it.name} → ${it.img}`); continue; }
  const buf = fs.readFileSync(p);
  const isPng = buf.length > 24 && buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG';
  if(!isPng){ bad.push(`${it.name} 不是合法 PNG`); continue; }
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const colorType = buf[25];                     // 6 = RGBA
  sizes.add(`${w}x${h}`);
  if(colorType !== 6) bad.push(`${it.name} 无透明通道(colorType=${colorType})`);
  if(w !== 512 || h !== 512) bad.push(`${it.name} 尺寸 ${w}x${h} ≠ 512x512`);
}
ok(missing.length === 0, missing.length === 0
  ? `${items.length} 个引用全部指向真实存在的文件`
  : `文件缺失: ${missing.join(' | ')}`);
ok(bad.length === 0, bad.length === 0
  ? '全部为 512×512 RGBA 透明 PNG'
  : bad.join(' | '));

console.log(`\n[3] 去重与体积`);
const uniq = new Set(items.map(i => i.img));
const dir = path.join(ROOT, 'assets', 'menu');
const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.png'));
let total = 0;
for(const f of files) total += fs.statSync(path.join(dir, f)).size;
ok(uniq.size === files.length,
  `${items.length} 项复用 ${uniq.size} 张图，目录内 ${files.length} 个文件（套餐复用主食图符合真实点餐系统做法）`);
ok(total < 6 * 1024 * 1024, `资源总体积 ${(total/1024/1024).toFixed(2)} MB（< 6 MB）`);

console.log(`\n[4] 渲染层接入`);
ok(/const imgTag = m\.img/.test(html), 'renderMenu 已按 m.img 渲染 <img>');
ok(/onerror="this\.remove\(\)"/.test(html), '图片加载失败时降级为 emoji（onerror 移除）');
ok(/\.mi-img img\{/.test(html), 'CSS 已定义 .mi-img img 样式');
ok(/\.st-item img\{/.test(html), '结算单已定义餐品缩略图样式');
ok(/mcdonalds\.com\.cn/.test(html), '页面已标注图片来源（麦当劳中国官网）');

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
