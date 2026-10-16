/* 候选推荐使用三局生产引擎与生产 quoteOrder，不替换任何因果计算。 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
function between(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert.ok(a>=0&&b>a,'生产函数定位失败：'+start);return html.slice(a,b);}
const production=new Function([
  between('const DATA = {','let REAL_DATA ='),between('function localDateKey(','function escapeText('),
  between('function validCoupon(','function validateSnapshot('),between('function couponAvailable(','function dailyCoupons('),
  between('function quoteOrder(','function cartCalc('),'return {DATA,quoteOrder};'
].join('\n'))();
const guide=require('../assets/replay-guide.js'),morning=require('../assets/morning-engine.js').createEngine(production.quoteOrder),midnight=require('../assets/midnight-engine.js').createEngine(production.quoteOrder),friend=require('../assets/friends-engine.js').createEngine(production.quoteOrder);
const snapshot={menu:production.DATA.menu,coupons:[...production.DATA.itemCoupons.map(c=>({...c,type:'item'})),...production.DATA.fullCoupons.map(c=>({...c,type:'full'}))],date:'2026-10-16',mode:'演示数据',source:'内置商品与演示券'};
const clone=x=>JSON.parse(JSON.stringify(x));
const H='火腿扒麦满分',P='猪柳蛋麦满分',B='脆薯饼',C='中杯鲜煮咖啡',CH='麦香鸡',GR='板烧鸡腿堡',CO='中杯可乐',SP='麦辣鸡腿堡',FI='麦香鱼',NU='麦乐鸡(5块)';
function run(engine,cart,opts={}){return Object.assign(engine.makeRun(snapshot,20261016),{oracle:engine===morning?'clock':engine===midnight?'backup':'deal',cart},opts);}
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const item of Object.values(value))freeze(item);}return value;}
let passes=0;function check(name,fn){fn();passes++;console.log('✓ '+name);}
check('UMD导出与结果契约：真实完成候选和断点分开，全部说明均为字符串',()=>{
  assert.equal(typeof guide.analyze,'function');assert.equal(typeof guide.describe,'function');
  const a=guide.analyze(morning,run(morning,{[H]:1}));assert.ok(a.best);assert.ok(Array.isArray(a.candidates)&&Array.isArray(a.blocked));assert.equal(a.total,a.candidates.length+a.blocked.length);assert.equal(a.total,3);
  for(const c of [...a.candidates,...a.blocked])for(const k of ['from','to','kind','question','buttonLabel','summary'])assert.equal(typeof c[k],'string');
  assert.ok(a.candidates.every(c=>!c.comparison.alternate.blocked&&c.comparison.alternate.ending));assert.ok(a.blocked.every(c=>c.comparison.alternate.blocked));assert.equal(a.best.buttonLabel,'试试这份替换 ↗');
});
check('早八不同结局优先于菜单靠前但仅改变资源的合法替换',()=>{
  const a=guide.analyze(morning,run(morning,{[H]:1}));assert.equal(a.best.to,B);assert.equal(a.best.kind,'ending');
  assert.equal(a.candidates.find(c=>c.to===P).kind,'resources');assert.equal(a.candidates.at(-1).to,P);
  assert.equal(a.best.comparison.original.ending.id,'am-110');assert.equal(a.best.comparison.alternate.ending.id,'am-100');assert.match(a.best.summary,/饱腹65 → 40/);
});
check('早八优惠套餐＋打车：所有单份替换均断点，明确无默认推荐',()=>{
  const r=run(morning,{[P]:1,[C]:1},{oracle:'coupon',coupon:true,sharing:'share',route:'taxi'});assert.equal(morning.resolve(r).blocked,false);
  const a=guide.analyze(morning,r);assert.equal(a.best,null);assert.equal(a.candidates.length,0);assert.equal(a.total,6);assert.equal(a.blocked.length,6);assert.match(a.headline,/只改单/);assert.match(a.detail,/6种/);
  assert.ok(a.blocked.every(c=>c.kind==='blocked'&&c.summary.includes('断点')));assert.ok(a.blocked.every(c=>!c.summary.includes('省下')));
});
check('凌晨咖啡→可乐实际改变工时、留错、准时性与结局，推荐据实际因果生成',()=>{
  const r=run(midnight,{[C]:1},{oracle:'peer',argument:'evidence',work:'polish'}),a=guide.analyze(midnight,r),cola=a.candidates.find(c=>c.to===CO);
  assert.ok(cola);assert.equal(cola.kind,'ending');assert.equal(cola.comparison.original.ending.id,'midnight-on-runnable');assert.equal(cola.comparison.alternate.ending.id,'midnight-late-buggy');
  assert.match(cola.summary,/耗时30 → 38分钟/);assert.match(cola.summary,/已知错误0 → 1处/);assert.match(cola.question,/错误/);assert.ok(a.candidates.every(c=>!c.comparison.alternate.blocked));
});
check('凌晨当前板烧＋咖啡超预算，仍找到合法单项候选，不偷改工作策略',()=>{
  const r=run(midnight,{[GR]:1,[C]:1},{argument:'evidence',approach:'break',work:'polish'});assert.equal(midnight.resolve(r).blocked,true);
  const a=guide.analyze(midnight,r);assert.ok(a.best);assert.ok(a.candidates.length>0&&a.blocked.length>0);assert.match(a.headline,/原计划就能继续/);assert.match(a.best.summary,/原计划存在断点/);assert.match(a.best.question,/原来卡住/);
  const changed=a.best.comparison.alternateRun;for(const k of ['seed','snapshot','oracle','coupon','argument','approach','work'])assert.deepEqual(changed[k],r[k]);assert.equal(a.best.comparison.alternate.blocked,false);
});
check('凌晨真实结果页：22元鸡＋咖啡01:55高质量，跳过33元板烧断点推荐完成线',()=>{
  const r=run(midnight,{[CH]:1,[C]:1},{oracle:'backup',argument:'evidence',approach:'break',work:'polish'}),original=midnight.resolve(r);
  assert.equal(original.blocked,false);assert.equal(original.quote.finalCents,2200);assert.equal(original.resources.elapsed,31);assert.equal(original.ending.id,'midnight-on-high');assert.match(original.ending.text,/01:55/);
  const a=guide.analyze(midnight,r),oldDefault=a.blocked.find(c=>c.from===CH&&c.to===GR);
  assert.ok(oldDefault);assert.equal(oldDefault.comparison.alternate.quote.finalCents,3300);assert.equal(oldDefault.comparison.alternate.blocked,true);assert.match(oldDefault.summary,/预算/);
  assert.ok(a.best);assert.equal(a.best.comparison.alternate.blocked,false);assert.ok(a.best.comparison.alternate.ending);assert.notEqual(a.best,oldDefault);assert.equal(a.candidates.some(c=>c.from===CH&&c.to===GR),false);
  for(const k of ['seed','snapshot','oracle','coupon','argument','approach','work'])assert.deepEqual(a.best.comparison.alternateRun[k],r[k]);
});
check('饭搭子偏好实际改变结局的候选排在仅资源变化候选前',()=>{
  const r=run(friend,{[CH]:2}),a=guide.analyze(friend,r),fish=a.candidates.find(c=>c.to===FI);
  assert.ok(fish);assert.equal(fish.kind,'ending');assert.equal(fish.comparison.original.ending.id,'friend-quiet-meal');assert.equal(fish.comparison.alternate.ending.id,'friend-dialogue');assert.match(fish.summary,/信任55 → 69/);assert.match(fish.question,/TA的回应/);
  const firstResource=a.candidates.findIndex(c=>c.kind==='resources');if(firstResource>=0)assert.ok(a.candidates.slice(firstResource).every(c=>c.kind!=='ending'));
});
check('qty=2只替换一份，三局所有非订单字段完全锁定',()=>{
  const scenarios=[
    [morning,run(morning,{[B]:2},{oracle:'coupon',coupon:true,sharing:'share'}),B,H],
    [midnight,run(midnight,{[C]:2},{argument:'evidence',approach:'break',work:'polish'}),C,CO],
    [friend,run(friend,{[CH]:2},{oracle:'listen',argument:'evidence',allocation:'friend'}),CH,FI]
  ];
  for(const [engine,r,from,to] of scenarios){const a=guide.analyze(engine,r),c=[...a.candidates,...a.blocked].find(c=>c.from===from&&c.to===to);assert.ok(c);assert.deepEqual(c.comparison.changedCart,{[from]:1,[to]:1});for(const k of Object.keys(r).filter(k=>k!=='cart'))assert.deepEqual(c.comparison.alternateRun[k],r[k]);}
});
check('原可搭校车，换慢餐必须保留交通断点；摘要不把未付的钱当收益',()=>{
  const r=run(morning,{[H]:1},{route:'bus'}),a=guide.analyze(morning,r),slow=a.blocked.find(c=>c.to===P);
  assert.ok(slow);assert.equal(slow.comparison.alternateRun.route,'bus');assert.equal(slow.comparison.alternate.ending,null);assert.match(slow.summary,/校车已走/);assert.match(slow.summary,/订单实付¥10.50 → ¥14.00/);assert.equal(slow.summary.includes('余钱'),false);
});
check('手动describe只写真实差值，三局单位明确，断点不伪装成结局',()=>{
  const cases=[
    [morning,run(morning,{[H]:1},{sharing:'share',argument:'time'}),{from:H,to:B},/关系70 → 50/],
    [midnight,run(midnight,{[C]:1},{oracle:'peer',argument:'evidence',work:'polish'}),{from:C,to:CO},/余钱¥18.00 → ¥19.50/],
    [friend,run(friend,{[CH]:2}),{from:CH,to:FI},/TA饱腹50 → 52.5/]
  ];
  for(const [engine,r,replacement,re] of cases){const cmp=engine.compare(r,replacement),text=guide.describe(engine,r,cmp);assert.match(text,re);assert.equal(text.includes('undefined'),false);assert.equal(text.includes('NaN'),false);assert.ok(text.includes(cmp.alternate.ending.name));}
  assert.throws(()=>guide.describe(morning,cases[0][1],{}),/两条/);
});
check('无相同目标替换、稳定目录顺序、不受原购物车插入顺序影响',()=>{
  const first=run(friend,{[CH]:1,[NU]:1},{oracle:'listen'}),second=run(friend,{[NU]:1,[CH]:1},{oracle:'listen'});
  const a=guide.analyze(friend,first),b=guide.analyze(friend,second),pairs=x=>[...x.candidates,...x.blocked].map(c=>c.from+'→'+c.to);
  assert.deepEqual(pairs(a),pairs(b));assert.equal(a.best.from,b.best.from);assert.equal(a.best.to,b.best.to);assert.ok([...a.candidates,...a.blocked].every(c=>c.from!==c.to));
});
check('分析完全只读且确定：冻结原run也可运行，重复分析得到相同真实候选',()=>{
  for(const [engine,r] of [[morning,run(morning,{[H]:1})],[midnight,run(midnight,{[C]:1},{work:'polish'})],[friend,run(friend,{[CH]:2})]]){
    const before=clone(r);freeze(r);const a=guide.analyze(engine,r),b=guide.analyze(engine,r);assert.deepEqual(r,before);assert.deepEqual(a,b);
    if(a.best){a.best.comparison.alternateRun.cart[a.best.to]=99;assert.deepEqual(r,before);}
  }
});
check('最多20项，空订单返回明确无候选，不向其它局借餐品',()=>{
  const r=run(friend,{[CH]:1,[FI]:1,[NU]:1,[CO]:1}),a=guide.analyze(friend,r);assert.equal(a.total,20);assert.equal(a.total,a.candidates.length+a.blocked.length);
  const empty=guide.analyze(morning,morning.makeRun(snapshot,1));assert.equal(empty.best,null);assert.equal(empty.total,0);assert.deepEqual(empty.candidates,[]);assert.deepEqual(empty.blocked,[]);assert.match(empty.detail,/先点一份/);
  const legal=new Set(friend.catalog(r).map(c=>c.name));assert.ok([...a.candidates,...a.blocked].every(c=>legal.has(c.from)&&legal.has(c.to)));
});
console.log('\n改单候选结果: '+passes+' 通过 / 0 失败');
