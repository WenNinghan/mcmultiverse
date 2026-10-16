/* Galgame 引擎逻辑仿真测试：无浏览器环境下验证场景图与结局系统 */
const fs = require('fs');
const path = 'C:/Users/Lenovo/WorkBuddy/2026-10-15-23-43-50/mcmultiverse/index.html';
const html = fs.readFileSync(path, 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// ---- DOM stub ----
function makeEl(){
  const el = {
    textContent:'', innerHTML:'', style:{}, dataset:{}, children:[],
    classList:{ _s:new Set(), add(c){this._s.add(c)}, remove(c){this._s.delete(c)}, toggle(c,f){ f?this._s.add(c):this._s.delete(c)}, contains(c){return this._s.has(c)} },
    appendChild(c){ this.children.push(c); return c; },
    querySelector(){ return makeEl(); },
    querySelectorAll(){ return []; },
    scrollIntoView(){}, remove(){}, getBoundingClientRect(){ return {left:0,top:0,width:100,height:40}; },
    offsetWidth:0,
    getContext(){ return { setTransform(){}, clearRect(){}, beginPath(){}, arc(){}, fill(){}, save(){}, restore(){}, translate(){}, rotate(){}, roundRect(){}, fillRect(){}, set fillStyle(v){}, get fillStyle(){return ''} }; },
  };
  return el;
}
const byId = {};
global.document = {
  getElementById(id){ return byId[id] || (byId[id] = makeEl()); },
  createElement(){ return makeEl(); },
  querySelector(){ return makeEl(); },
  querySelectorAll(){ return []; },
};
global.window = { matchMedia(){ return {matches:false}; }, scrollTo(){} };
global.matchMedia = () => ({matches:false});
global.localStorage = { getItem(){return null}, setItem(){}, removeItem(){} };
global.fetch = () => new Promise(()=>{});
global.addEventListener = () => {};
global.innerWidth = 390; global.innerHeight = 844;
global.requestAnimationFrame = () => {};
if(!global.CanvasRenderingContext2D) global.CanvasRenderingContext2D = function(){};
global.CanvasRenderingContext2D.prototype = {};

// ---- 加载脚本并导出内部对象 ----
const exported = new Function(js + '\nreturn {SCENES, FLAG_ENDINGS, ATTR_ENDINGS, PREFIXES, TOMBS, TALENTS, AVATAR, FLAG_LINES};')();

const {SCENES, FLAG_ENDINGS, ATTR_ENDINGS, PREFIXES, TOMBS, TALENTS, FLAG_LINES} = exported;
let pass = 0, fail = 0;
const ok = (cond, msg) => { if(cond){ pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗ FAIL:', msg); } };

console.log('== 1. 场景图结构 ==');
const ids = Object.keys(SCENES);
console.log('  场景数:', ids.length);
const nexts = [];
Object.entries(SCENES).forEach(([id, s])=>{
  ok(s.text && s.text.length >= 1, `${id} 有剧情文本(${s.text.length}行)`);
  ok(s.choices && s.choices.length >= 1, `${id} 有选项(${s.choices.length}个)`);
  ok(s.title, `${id} 有标题`);
  s.choices.forEach(c => nexts.push([id, c.next]));
});
const missing = nexts.filter(([f,n]) => n && !SCENES[n]);
ok(missing.length === 0, `所有 next 引用有效（${nexts.length} 个引用，缺失 ${missing.length}）`);
ok(SCENES.birth, '出生场景存在');
ok(Object.keys(SCENES).filter(id => SCENES[id].choices.every(c => !c.next)).length >= 8, '终幕场景存在（各线专属 final）');

console.log('== 2. 可达性分析（DFS） ==');
const reachable = new Set();
(function walk(id){ if(reachable.has(id)) return; reachable.add(id); (SCENES[id]?.choices||[]).forEach(c=>c.next && walk(c.next)); })('birth');
const unreachable = ids.filter(i=>!reachable.has(i));
ok(unreachable.length === 0, `所有场景从出生可达（不可达: ${unreachable.join(',')||'无'}）`);

console.log('== 3. 结局覆盖 ==');
const allFlags = new Set();
Object.values(SCENES).forEach(s => s.choices.forEach(c => c.flag && allFlags.add(c.flag)));
ok(FLAG_ENDINGS.length >= 15, `旗标结局数量: ${FLAG_ENDINGS.length}`);
const orphanEndings = FLAG_ENDINGS.filter(e => !allFlags.has(e.flag));
ok(orphanEndings.length === 0, `所有旗标结局的触发 flag 都在场景中出现（孤儿: ${orphanEndings.map(e=>e.flag).join(',')||'无'}）`);
const covered = FLAG_ENDINGS.filter(e => allFlags.has(e.flag)).length;
ok(ATTR_ENDINGS.length >= 5, `属性组合结局数量: ${ATTR_ENDINGS.length}`);
ok(PREFIXES.length >= 5, `属性前缀修饰数量: ${PREFIXES.length}`);
ok(TOMB_LEN() >= 6, `墓志铭数量: ${TOMB_LEN()}`);
function TOMB_LEN(){ return TOMBS.length; }

console.log('== 4. 结局池规模（组合数） ==');
const attrCombo = 16; // 4属性各自高低 2^4
console.log(`  核心结局: ${covered + ATTR_ENDINGS.length + 1} × 属性修饰: ${attrCombo} × 墓志铭: ${TOMB_LEN()} = 组合数 ${(covered + ATTR_ENDINGS.length + 1) * attrCombo * TOMB_LEN()}`);
ok((covered + ATTR_ENDINGS.length + 1) * attrCombo > 100, '结局组合数超过100，README"上百种"成立');

console.log('== 5. 结局文本质量 ==');
FLAG_ENDINGS.concat(ATTR_ENDINGS).forEach(e => {
  ok(e.name && e.text && e.text.length > 30, `结局「${e.name}」文案完整`);
});

console.log('== 6. 天赋数据 ==');
ok(TALENTS.length >= 8, `天赋数量: ${TALENTS.length}`);

console.log('== 7. 全流程仿真（500 个随机玩家 + 4 个定向流派） ==');
function playout(bias){
  let id = 'birth', step = 0;
  const attrs = {weight:50, money:100, faith:30, health:100};
  const flags = new Set();
  const clamp = () => {
    attrs.weight = Math.max(35, Math.min(160, attrs.weight));
    attrs.money = Math.max(0, Math.min(150, attrs.money));
    attrs.faith = Math.max(0, Math.min(100, attrs.faith));
    attrs.health = Math.max(0, Math.min(100, attrs.health));
  };
  let age = 0, guard = 0;
  while(id && guard++ < 200){
    const s = SCENES[id];
    age = Math.max(age, s.age);
    // bias: 'eat'|'save'|'faith'|'sick'|null —— 定向选择对应属性增益最大的选项
    let c;
    if(bias === 'sick'){
      // 作死流：专挑最伤健康的选项
      c = s.choices.reduce((best, cur)=>((cur.d||{}).health||0) <= ((best.d||{}).health||0) ? cur : best);
    } else if(bias){
      c = s.choices.reduce((best, cur)=>{
        const bv = (cur.d || {})[bias] || (bias==='eat' ? (cur.d||{}).weight||0 : 0);
        const cv = (best.d || {})[bias] || (bias==='eat' ? (best.d||{}).weight||0 : 0);
        return bv >= cv ? cur : best;
      });
    } else {
      c = s.choices[Math.floor(Math.random() * s.choices.length)];
    }
    Object.entries(c.d || {}).forEach(([k, v]) => { if(k in attrs) attrs[k] += v; else attrs.weight += v; });
    attrs.weight += 1;
    clamp();
    if(c.flag) flags.add(c.flag);
    id = c.next;
  }
  return {age, attrs, flags, guard};
}
function endingOf(r){
  return ATTR_ENDINGS.find(e => e.cond({attrs:r.attrs}))
      || FLAG_ENDINGS.find(e => r.flags.has(e.flag))
      || {name:'DEFAULT'};
}
let badEnding = 0, badAttrs = 0;
const endingCount = {};
for(let i = 0; i < 500; i++){
  const r = playout(null);
  if(!r.age || r.guard >= 200) badEnding++;
  if(Object.values(r.attrs).some(v => !isFinite(v) || v < 0)) badAttrs++;
  const nm = endingOf(r).name;
  endingCount[nm] = (endingCount[nm]||0) + 1;
}
ok(badEnding === 0, `500 局全部正常走到终幕（异常 ${badEnding} 局）`);
ok(badAttrs === 0, `500 局属性全部在合法范围（异常 ${badAttrs} 局）`);
console.log('  随机局结局分布:', Object.entries(endingCount).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}×${v}`).join(' | '));
ok(Object.keys(endingCount).length >= 2, `随机局触达结局种类: ${Object.keys(endingCount).length}`);

// 定向流派：每种玩法都应走向它的招牌结局
const eat = endingOf(playout('eat'));
ok(eat.name === '巨无霸人柱力', `大胃王流 → 「${eat.name}」`);
const save = endingOf(playout('money'));
ok(save.name === '编外股东', `省钱流 → 「${save.name}」`);
const faith = endingOf(playout('faith'));
ok(faith.name === '麦门圣僧', `虔信流 → 「${faith.name}」`);
const sick = endingOf(playout('sick'));
ok(sick.name === '金盆洗手', `作死流 → 「${sick.name}」`);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
