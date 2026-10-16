/* 实际午夜纯引擎＋生产整数分计价；无测试替身、无外部依赖。 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
function between(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert.ok(a>=0&&b>a,'生产函数定位失败：'+start);return html.slice(a,b);}
const production=new Function([
  between('const DATA = {','let REAL_DATA ='),between('function localDateKey(','function escapeText('),
  between('function validCoupon(','function validateSnapshot('),between('function couponAvailable(','function dailyCoupons('),
  between('function quoteOrder(','function cartCalc('),'return {DATA,quoteOrder};'
].join('\n'))();
const engine=require('../assets/midnight-engine.js').createEngine(production.quoteOrder),clone=x=>JSON.parse(JSON.stringify(x));
const H='麦香鸡',B='板烧鸡腿堡',C='中杯鲜煮咖啡',L='中杯可乐',P='香芋派';
const snapshot={menu:production.DATA.menu,coupons:[...production.DATA.itemCoupons.map(c=>({...c,type:'item'})),...production.DATA.fullCoupons.map(c=>({...c,type:'full'}))],date:'2026-10-16',mode:'演示数据',source:'内置商品与演示券'};
function run(cart={[H]:1},opts={},data=snapshot){return Object.assign(engine.makeRun(data,20261016),{oracle:'backup',cart},opts);}
let passes=0;
function check(name,fn){fn();passes++;console.log('✓ '+name);}
check('默认空单不替玩家选餐，午夜独有资源与商品事实齐全',()=>{
  const r=engine.makeRun(snapshot,1),p=engine.preview(r);
  assert.deepEqual(r.cart,{});assert.equal(r.oracle,null);assert.equal(r.scenario,'midnight');assert.equal(p.valid,false);assert.equal(p.wait,0);assert.equal(p.eat,0);
  assert.deepEqual(p.orderResources,{elapsed:0,wallet:2800,energy:25,quality:40,errors:3,strain:0});
  assert.equal(engine.catalog(r).length,5);assert.ok(engine.catalog(r).every(f=>f.facts.length===2&&f.img.endsWith('.png')));assert.equal(engine.catalog(r).find(f=>f.name===B).priceCents,2300);
  assert.deepEqual(engine.meta.resources.map(r=>r.key),['wallet','energy','quality','errors']);
});
check('并行出餐等最长＋装袋，吃喝按每份累计；金额复用实际quoteOrder',()=>{
  const p=engine.preview(run({[H]:1,[C]:1}));assert.equal(p.quote.finalCents,2200);assert.equal(p.wait,3);assert.equal(p.eat,3);assert.equal(p.orderResources.elapsed,6);assert.equal(p.orderResources.energy,75);assert.equal(p.orderResources.strain,25);assert.equal(p.orderResources.wallet,600);
  const twice=engine.preview(run({[C]:2}));assert.equal(twice.wait,2);assert.equal(twice.eat,2);assert.equal(twice.orderResources.energy,85);assert.equal(twice.orderResources.strain,50);
});
check('实际夜宵不静默启用快照中的优惠；午夜不允许伪造领券',()=>{
  const p=engine.preview(run({[H]:2}));assert.equal(p.quote.finalCents,2400);assert.equal(p.quote.couponApplied,false);
  assert.throws(()=>engine.preview(run({[H]:1},{coupon:true})),/选择无效/);
});
check('神谕改变实际申辩时间，证据修错与质量进入后续工作',()=>{
  const a=engine.preview(run({[H]:1},{argument:'evidence'})),b=engine.preview(run({[H]:1},{oracle:'peer',argument:'evidence'}));
  assert.equal(a.argumentMinutes,1);assert.equal(b.argumentMinutes,3);assert.equal(b.courtResources.elapsed,a.courtResources.elapsed+2);
  assert.equal(a.courtResources.errors,2);assert.equal(a.courtResources.quality,45);
  const r=engine.resolve(run({[C]:1},{oracle:'peer',argument:'evidence',work:'polish'}));assert.equal(r.resources.errors,0);assert.equal(r.resources.quality,70);
});
check('继续赶工有质量与烦躁代价；休息耗时但改善工作条件',()=>{
  const r=run({[C]:1}),rush=engine.preview(r),rest=engine.preview({...r,approach:'break'});
  assert.equal(rush.choiceResources.quality,35);assert.equal(rush.choiceResources.strain,35);assert.equal(rest.choiceResources.quality,40);assert.equal(rest.choiceResources.energy,70);assert.equal(rest.choiceResources.strain,5);assert.equal(rest.choiceResources.elapsed,rush.choiceResources.elapsed+3);
  assert.equal(engine.actions(r).find(x=>x.id==='polish').minutes,24);assert.equal(engine.actions({...r,approach:'break'}).find(x=>x.id==='polish').minutes,21);
});
check('精力不足40慢8分钟并留1错，40正常，65开始快3分钟',()=>{
  const low=engine.actions(run({[L]:1})).find(a=>a.id==='submit'),normal=engine.actions(run({[P]:1})).find(a=>a.id==='submit'),fast=engine.actions(run({[H]:2})).find(a=>a.id==='submit');
  assert.equal(low.minutes,20);assert.equal(low.risk,1);assert.equal(normal.minutes,12);assert.equal(normal.risk,0);assert.equal(fast.minutes,9);assert.equal(fast.risk,0);
});
check('多杯咖啡的高烦躁确实留错；休息可降低而非凭文字消除',()=>{
  const r=run({[C]:2},{argument:'evidence',work:'polish'}),rush=engine.resolve(r),rest=engine.resolve({...r,approach:'break'});
  assert.equal(rush.resources.strain,60);assert.equal(rush.resources.errors,1);assert.equal(rush.ending.tier,'buggy');assert.equal(rest.resources.strain,30);assert.equal(rest.resources.errors,0);assert.equal(rest.ending.tier,'high');assert.equal(rest.resources.elapsed,rush.resources.elapsed+3);
  const exact=engine.actions(run({[C]:1,[L]:2})).find(a=>a.id==='polish');assert.equal(exact.resources.strain,45);assert.equal(exact.risk,1);
});
check('同伴评审必须持签，不能通过选择ID绕过神谕',()=>{
  const unavailable=engine.resolve(run({[H]:1},{work:'peer'})),available=engine.resolve(run({[H]:1},{oracle:'peer',work:'peer'}));
  assert.equal(unavailable.blocked,true);assert.match(unavailable.reason,/没有同伴/);assert.equal(unavailable.ending,null);assert.equal(available.blocked,false);assert.equal(available.resources.errors,0);assert.equal(available.ending.tier,'runnable');
});
check('01:36可开始同伴评审，01:37出现断点；换快餐能重新打开窗口',()=>{
  const exact=run({[H]:1,[P]:1},{oracle:'peer',argument:'evidence',work:'peer'}),p=engine.preview(exact),r=engine.resolve(exact);
  assert.equal(p.choiceResources.elapsed,12);assert.equal(r.blocked,false);assert.equal(p.availableActions.find(a=>a.id==='peer').available,true);
  const late=run({[B]:1},{oracle:'peer',argument:'evidence',work:'peer'}),pair=engine.compare(late,{from:B,to:H});
  assert.equal(engine.preview(late).choiceResources.elapsed,13);assert.equal(pair.original.blocked,true);assert.match(pair.original.reason,/01:37.*01:36/);assert.equal(pair.alternate.blocked,false);assert.equal(pair.alternateRun.work,'peer');assert.equal(pair.alternate.resources.errors,0);
  const reverse=engine.compare(run({[H]:1},{oracle:'peer',argument:'evidence',work:'peer'}),{from:H,to:B});
  assert.equal(reverse.original.blocked,false);assert.equal(reverse.alternate.blocked,true);assert.equal(reverse.alternateRun.oracle,'peer');assert.equal(reverse.alternateRun.argument,'evidence');assert.equal(reverse.alternateRun.approach,'rush');assert.equal(reverse.alternateRun.work,'peer');assert.equal(reverse.firstDivergence.id,'order');
});
check('截止线36分钟可提交，37分钟迟交；不会自动替换工作策略',()=>{
  const exact=engine.resolve(run({[L]:1},{argument:'evidence',work:'polish'})),late=engine.resolve(run({[B]:1},{oracle:'peer',argument:'evidence',approach:'break',work:'polish'}));
  assert.equal(exact.resources.elapsed,36);assert.equal(exact.ending.onTime,true);assert.equal(late.resources.elapsed,37);assert.equal(late.ending.onTime,false);assert.equal(late.blocked,false);assert.equal(late.ending.tier,'high');assert.match(late.ending.text,/02:01/);
});
check('单份咖啡→可乐导致实际工时、错误、准时性和结局同时变化',()=>{
  const r=run({[C]:1},{oracle:'peer',argument:'evidence',work:'polish'}),before=JSON.stringify(r),pair=engine.compare(r,{from:C,to:L});
  assert.equal(JSON.stringify(r),before);assert.equal(pair.original.resources.elapsed,30);assert.equal(pair.alternate.resources.elapsed,38);assert.equal(pair.original.resources.errors,0);assert.equal(pair.alternate.resources.errors,1);assert.equal(pair.original.ending.id,'midnight-on-runnable');assert.equal(pair.alternate.ending.id,'midnight-late-buggy');assert.notEqual(pair.original.ending.text,pair.alternate.ending.text);assert.equal(pair.firstDivergence.id,'order');
});
check('只换一份且锁定全部非订单选择、种子、日期和快照',()=>{
  const r=run({[C]:2},{argument:'evidence',approach:'break',work:'polish'}),p=engine.compare(r,{from:C,to:L});
  assert.deepEqual(p.changedCart,{[C]:1,[L]:1});
  for(const key of Object.keys(r).filter(k=>k!=='cart'))assert.deepEqual(p.alternateRun[key],r[key]);
  assert.throws(()=>engine.compare(r,{from:C,to:C}));assert.throws(()=>engine.compare(r,{from:H,to:L}));assert.throws(()=>engine.compare(r,{from:C,to:'巨无霸'}));
});
check('换一份超过预算出现断点，保留原结局和锁定的原工作',()=>{
  const pair=engine.compare(run({[H]:2},{oracle:'peer',work:'peer'}),{from:H,to:B});
  assert.equal(pair.original.blocked,false);assert.equal(pair.alternate.blocked,true);assert.equal(pair.alternate.ending,null);assert.equal(pair.alternateRun.work,'peer');assert.match(pair.alternate.reason,/超过/);assert.ok(pair.alternate.resources.wallet>=0);
  assert.equal(pair.alternate.resources.elapsed,0);assert.equal(pair.alternate.resources.wallet,2800);assert.equal(pair.alternate.resources.energy,25);assert.equal(pair.alternate.timeline.at(-1).id,'order');assert.match(pair.alternate.timeline.at(-1).text,/未付款、未取餐/);
});
check('轻饮、主餐与咖啡有非支配取舍，贵餐没有自动统治全部资源',()=>{
  const cola=engine.preview(run({[L]:1})),coffee=engine.preview(run({[C]:1})),chicken=engine.preview(run({[H]:1})),board=engine.preview(run({[B]:1}));
  assert.ok(cola.quote.finalCents<coffee.quote.finalCents);assert.ok(cola.orderResources.strain<coffee.orderResources.strain);assert.ok(cola.orderResources.energy<coffee.orderResources.energy);
  assert.ok(coffee.quote.finalCents<chicken.quote.finalCents);assert.ok(coffee.orderResources.elapsed<chicken.orderResources.elapsed);assert.ok(coffee.orderResources.energy>chicken.orderResources.energy);assert.ok(coffee.orderResources.strain>chicken.orderResources.strain);
  assert.ok(board.quote.finalCents>chicken.quote.finalCents);assert.ok(board.orderResources.energy>chicken.orderResources.energy);assert.ok(board.orderResources.elapsed>chicken.orderResources.elapsed);
});
check('快照深复制，存档精确恢复并拒绝未知字段、坏数量与伪造选择',()=>{
  const data=clone(snapshot),r=run({[H]:1},{},data),restored=engine.restore(r);data.menu[0].price=999;
  assert.notEqual(r.snapshot.menu[0].price,999);assert.deepEqual(engine.resolve(restored),engine.resolve(r));restored.cart[H]=2;assert.equal(r.cart[H],1);
  for(const opts of [{oracle:'fake'},{approach:'allnight'},{work:'ai'},{argument:'delete'},{scenario:'morning'},{version:2},{seed:0},{extra:1}])assert.throws(()=>engine.restore({...r,...opts}));
  for(const cart of [{[H]:0},{[H]:-1},{[H]:1.2},{[H]:5},{[H]:4,[C]:1},{'巨无霸':1}])assert.throws(()=>engine.preview({...r,cart}));
  const changed=clone(r);changed.snapshot.menu[0].price=999;assert.throws(()=>engine.restore(changed),/快照/);
});
check('分享精确复放含质量/错误/时间，跨日期仍冻结原公开日期',()=>{
  const r=run({[C]:1},{oracle:'peer',argument:'evidence',work:'polish'}),hash=engine.encode(r),restored=engine.decode(hash,{...snapshot,date:'2026-10-17'});
  assert.ok(hash.startsWith('#ep=1&s=midnight&'));assert.equal(hash.includes(C),false);assert.deepEqual(engine.resolve(restored),engine.resolve(r));assert.equal(restored.snapshot.date,'2026-10-16');
});
check('分享保留先咖啡后麦香鸡的点餐顺序，因果链正文也精确复放',()=>{
  const r=run({[C]:1,[H]:1},{oracle:'peer',argument:'evidence',work:'polish'}),restored=engine.decode(engine.encode(r),snapshot);
  assert.deepEqual(Object.keys(restored.cart),[C,H]);assert.deepEqual(engine.resolve(restored),engine.resolve(r));
});
check('分享拒绝恶意/重复/缺失参数与快照漂移，断点不能伪装成完成',()=>{
  const r=run({[C]:1},{oracle:'peer',argument:'evidence',work:'polish'}),hash=engine.encode(r),change=(key,value)=>{const p=new URLSearchParams(hash.slice(1));p.set(key,value);return '#'+p;};
  for(const bad of [hash+'&evil=1',hash+'&seed=2',hash.replace(/&seed=[^&]+/,''),change('ep','2'),change('s','friend'),change('seed','0'),change('seed','4294967296'),change('d','2026-02-30'),change('o','0.1,0.1'),change('o','9.1'),change('o','0.5'),change('coupon','1'),change('approach','fake'),change('oracle','null'),change('work','alien'),change('snap','fake')])assert.throws(()=>engine.decode(bad,snapshot));
  const changed=clone(snapshot);changed.menu[0].price+=1;assert.throws(()=>engine.decode(hash,changed),/快照已变化/);assert.throws(()=>engine.encode(run({[B]:2})),/断点/);
});
check('遍历合法四份内订单×签×申辩×恢复×工作：全部6结局可达且确定',()=>{
  const names=[H,B,C,L,P],seen=new Map();let combinations=0,blocked=0;
  function enumerate(qty,left){if(qty.length===names.length){if(!qty.some(Boolean))return;const cart=Object.fromEntries(qty.map((q,i)=>[names[i],q]).filter(x=>x[1]));
      for(const oracle of ['backup','peer'])for(const argument of ['accept','evidence'])for(const approach of ['rush','break'])for(const work of ['submit','polish','peer']){
        const r=run(cart,{oracle,argument,approach,work}),before=JSON.stringify(r),out=engine.resolve(r);combinations++;
        assert.equal(JSON.stringify(r),before);assert.deepEqual(out,engine.resolve(r));
        for(const key of ['elapsed','wallet','energy','quality','errors','strain'])assert.ok(Number.isInteger(out.resources[key])&&out.resources[key]>=0,key);
        for(const key of ['energy','quality','strain'])assert.ok(out.resources[key]<=100);
        assert.ok(out.timeline.every((n,i)=>!i||n.resources.elapsed>=out.timeline[i-1].resources.elapsed));
        if(out.blocked){blocked++;assert.equal(out.ending,null);assert.ok(out.reason);}
        else{seen.set(out.ending.id,{cart,oracle,argument,approach,work});assert.equal(out.ending.onTime,out.resources.elapsed<=36);assert.equal(out.ending.tier,out.resources.errors?'buggy':out.resources.quality>=75?'high':'runnable');}
      }return;}
    for(let q=0;q<=left;q++)enumerate([...qty,q],left-q);}
  enumerate([],4);assert.deepEqual([...seen.keys()].sort(),engine.endings.map(e=>e.id).sort());assert.ok(blocked>0);console.log('  遍历 '+combinations+' 组合 / '+blocked+' 明确断点 / '+seen.size+' 个可达结局');
});
console.log('\n午夜结果: '+passes+' 通过 / 0 失败');
