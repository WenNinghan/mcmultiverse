/* 实际饭搭子引擎＋从 index.html 提取的生产整数分 quoteOrder，无第三方依赖。 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
function between(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert.ok(a>=0&&b>a,'生产函数定位失败：'+start);return html.slice(a,b);}
const production=new Function([
  between('const DATA = {','let REAL_DATA ='),between('function localDateKey(','function escapeText('),
  between('function validCoupon(','function validateSnapshot('),between('function couponAvailable(','function dailyCoupons('),
  between('function quoteOrder(','function cartCalc('),'return {DATA,quoteOrder};'
].join('\n'))();
const api=require('../assets/friends-engine.js'),engine=api.createEngine(production.quoteOrder);
const clone=x=>JSON.parse(JSON.stringify(x));
const CH='麦香鸡',SP='麦辣鸡腿堡',FI='麦香鱼',NU='麦乐鸡(5块)',FR='中薯条',CO='中杯可乐';
const snapshot={menu:production.DATA.menu,coupons:[...production.DATA.itemCoupons.map(c=>({...c,type:'item'})),...production.DATA.fullCoupons.map(c=>({...c,type:'full'}))],date:'2026-10-16',mode:'演示数据',source:'内置商品与演示券'};
function run(cart={[CH]:2},opts={},data=snapshot){return Object.assign(engine.makeRun(data,20261016),{oracle:'deal',cart},opts);}
let passes=0;
function check(name,fn){fn();passes++;console.log('✓ '+name);}

check('UMD与统一API；空单起步，真实中文资源和各自初始状态',()=>{
  const r=engine.makeRun(snapshot,1),p=engine.preview(r);
  for(const key of ['meta','makeRun','catalog','restore','preview','resolve','compare','encode','decode','arguments','choices','actions','endings'])assert.ok(engine[key],key);
  assert.deepEqual(r.cart,{});assert.equal(r.oracle,null);assert.equal(p.valid,false);assert.equal(p.quote.finalCents,0);
  assert.deepEqual(p.initialResources,{elapsed:0,wallet:4000,ownSatiety:20,friendSatiety:10,trust:40});
  assert.equal(engine.catalog(r).length,6);assert.ok(engine.catalog(r).every(f=>f.facts.length&&f.img.startsWith('assets/menu/')&&f.img.endsWith('.png')));
  assert.equal(engine.catalog(r).find(f=>f.name===CH).priceCents,1200);assert.equal(engine.catalog(r).find(f=>f.name===FI).priceCents,1900);
});
check('生产买赠精确数量边界1/2/3/4；不偷偷启用满减或其他券',()=>{
  for(const [qty,cents] of [[1,1200],[2,1200],[3,2400],[4,2400]]){
    const p=engine.preview(run({[NU]:qty},{coupon:true}));assert.equal(p.quote.finalCents,cents);assert.equal(p.verifyMinutes,2);assert.equal(p.quote.couponApplied,qty>=2);
  }
  const s=clone(snapshot);s.coupons.push({id:'f1',name:'满1减1',type:'full',min:1,off:1,stackWithItem:true,thresholdBasis:'afterItem'});
  assert.equal(engine.preview(run({[NU]:2},{coupon:true},s)).quote.finalCents,1200);
  assert.equal(engine.resolve(run({[NU]:2},{oracle:'listen',coupon:true})).blocked,true);
});
check('失效券保留2分钟核验意图，不伪造优惠；改单后单份也真实失效',()=>{
  const s=clone(snapshot);s.coupons=s.coupons.map(c=>({...c,endsAt:'2026-10-15'}));
  const p=engine.preview(run({[NU]:2},{coupon:true},s));assert.equal(p.quote.finalCents,2400);assert.equal(p.quote.couponApplied,false);assert.equal(p.verifyMinutes,2);assert.equal(p.warnings.length,1);
  const cmp=engine.compare(run({[NU]:2},{coupon:true}),{from:NU,to:CH});
  assert.equal(cmp.alternate.quote.finalCents,2400);assert.equal(cmp.alternate.preview.verifyMinutes,2);assert.match(cmp.alternate.preview.warnings[0],/仍花2分钟/);
});
check('导入快照同ID变更买赠/目标/规则，不冒充本局买一送一，仍核验并原价报价',()=>{
  for(const change of [{free:2},{buy:2},{target:FI},{rule:'unit',priceCents:100}]){
    const s=clone(snapshot);Object.assign(s.coupons.find(c=>c.id==='nuggetbogo'),change);
    const p=engine.preview(run({[NU]:3},{coupon:true},s));
    assert.equal(p.quote.finalCents,3600);assert.equal(p.quote.couponApplied,false);assert.equal(p.verifyMinutes,2);assert.equal(p.warnings.length,1);assert.match(p.warnings[0],/已改成其他规则/);assert.match(p.warnings[0],/仍花2分钟核验/);
  }
});
check('三种分配真的分食物；均分可半份，先挑只取一份，数量与饱腹守恒',()=>{
  for(const allocation of ['equal','self','friend']){
    const r=run({[CH]:1,[FI]:1,[CO]:1},{oracle:'listen',argument:'evidence',allocation}),p=engine.preview(r);
    for(const name of Object.keys(r.cart))assert.equal([...p.trays.self,...p.trays.friend].filter(t=>t.name===name).reduce((s,t)=>s+t.servings,0),r.cart[name]);
    assert.equal(p.distribution.totalFood,90);assert.equal(p.choiceResources.ownSatiety+p.choiceResources.friendSatiety,120);
  }
  const equal=engine.preview(run({[CH]:1,[FI]:1})),self=engine.preview(run({[CH]:1,[FI]:1},{allocation:'self'})),friend=engine.preview(run({[CH]:1,[FI]:1},{oracle:'listen',argument:'evidence',allocation:'friend'}));
  assert.equal(equal.trays.self.find(t=>t.name===FI).servings,.5);assert.equal(equal.choiceResources.ownSatiety,62.5);
  assert.equal(self.trays.self.find(t=>t.name===FI).servings,1);assert.equal(self.choiceResources.friendSatiety,50);
  assert.equal(friend.trays.friend.find(t=>t.name===FI).servings,1);assert.equal(friend.choiceResources.ownSatiety,60);
  const two=engine.preview(run({[CH]:2},{allocation:'self'}));assert.equal(two.trays.self[0].servings,1);assert.equal(two.trays.friend[0].servings,1);
});
check('鱼、温和汉堡、辣堡实际影响信任；偏辣不能只靠高饱腹抵消',()=>{
  const preferred=engine.resolve(run({[CH]:1,[FI]:1})),neutral=engine.resolve(run({[CH]:2})),spicy=engine.resolve(run({[CH]:1,[SP]:1}));
  assert.equal(preferred.preview.choiceResources.trust,61);assert.equal(neutral.resources.trust,55);assert.equal(spicy.resources.trust,40);
  assert.ok(spicy.resources.friendSatiety>preferred.resources.friendSatiety);assert.equal(spicy.ending.id,'friend-spicy-silence');
  assert.match(spicy.scene.tasteMessage,/实际拿到了0.5份辣堡/);assert.equal(spicy.scene.trays.friend.find(t=>t.name===SP).servings,.5);
});
check('需求签与审判举证有真联动，花2分钟才开放TA优先且不会自动改订单',()=>{
  const r=run({[CH]:1,[FI]:1},{oracle:'listen',allocation:'friend'}),closed=engine.resolve(r),opened=engine.resolve({...r,argument:'evidence'});
  assert.equal(closed.blocked,true);assert.match(closed.reason,/需求签/);assert.equal(opened.blocked,false);
  assert.equal(engine.choices(r).find(c=>c.id==='friend').available,false);assert.equal(engine.choices({...r,argument:'evidence'}).find(c=>c.id==='friend').available,true);
  assert.equal(opened.preview.courtResources.elapsed-opened.preview.orderResources.elapsed,2);assert.deepEqual(r.cart,{[CH]:1,[FI]:1});
  const fake=engine.resolve({...r,oracle:'deal',argument:'evidence'});assert.equal(fake.blocked,true);assert.equal(fake.timeline.at(-1).stage,'court');
});
check('等待按最长餐品与超过两份装载计算；久等信任扣分真实进入资源',()=>{
  const fast=engine.preview(run({[CH]:2})),slow=engine.preview(run({[SP]:1,[NU]:2},{coupon:true}));
  assert.equal(fast.wait,2);assert.equal(fast.orderResources.elapsed,3);assert.equal(slow.wait,7);assert.equal(slow.orderResources.elapsed,10);assert.equal(slow.orderResources.trust,34);
  assert.match(engine.resolve(run({[SP]:1,[NU]:2},{coupon:true})).timeline.find(n=>n.id==='order').text,/信任−6/);
});
check('深入交谈条件不是文案：信任恰60开放并+8；55只能完成一顿饭',()=>{
  const exact=engine.resolve(run({[CH]:2},{oracle:'listen'})),quiet=engine.resolve(run({[CH]:2}));
  assert.equal(exact.preview.choiceResources.trust,60);assert.equal(exact.scene.conversation,true);assert.equal(exact.resources.trust,68);assert.equal(exact.ending.id,'friend-dialogue');
  assert.equal(quiet.preview.choiceResources.trust,55);assert.equal(quiet.scene.conversation,false);assert.equal(quiet.resources.trust,55);assert.equal(quiet.ending.id,'friend-quiet-meal');
});
check('打一份包需200分边界，199分明确断点；不扣负数、不改坐下',()=>{
  const a=clone(snapshot),b=clone(snapshot);a.menu.find(m=>m.name===CH).price=38;b.menu.find(m=>m.name===CH).price=38.01;
  const good=engine.resolve(run({[CH]:1},{response:'drop'},a)),bad=engine.resolve(run({[CH]:1},{response:'drop'},b));
  assert.equal(good.blocked,false);assert.equal(good.resources.wallet,0);assert.equal(good.resources.elapsed,9);
  assert.equal(bad.blocked,true);assert.equal(bad.resources.wallet,199);assert.equal(bad.ending,null);assert.match(bad.reason,/1.99/);assert.equal(bad.timeline.at(-1).stage,'action');
});
check('单份替换锁定全部非订单输入；鱼改变对话，辣改变18:30占位结果',()=>{
  const r=run({[CH]:2},{oracle:'listen',argument:'evidence',allocation:'friend'}),before=JSON.stringify(r),cmp=engine.compare(r,{from:CH,to:SP});
  assert.deepEqual(cmp.changedCart,{[CH]:1,[SP]:1});assert.equal(JSON.stringify(r),before);
  for(const key of ['seed','oracle','coupon','argument','allocation','response','snapshot'])assert.deepEqual(cmp.alternateRun[key],r[key]);
  assert.equal(cmp.firstDivergence.id,'order');assert.equal(cmp.original.resources.elapsed,18);assert.equal(cmp.alternate.resources.elapsed,22);
  assert.equal(cmp.original.scene.conversation,true);assert.equal(cmp.alternate.scene.conversation,true);assert.equal(cmp.original.scene.reservedSeat,true);assert.equal(cmp.alternate.scene.reservedSeat,false);
  assert.equal(cmp.original.ending.id,'friend-dialogue');assert.equal(cmp.alternate.ending.id,'friend-missed-seat');
  const fish=engine.compare(run({[CH]:2}),{from:CH,to:FI});assert.equal(fish.original.ending.id,'friend-quiet-meal');assert.equal(fish.alternate.ending.id,'friend-dialogue');assert.equal(fish.alternate.preview.choiceResources.trust,61);
});
check('超预算改单断点不买单；空单、非法SKU/数量/选择/种子不接受',()=>{
  const cmp=engine.compare(run({[CH]:1,[FI]:1}),{from:CH,to:SP});assert.equal(cmp.alternate.blocked,true);assert.equal(cmp.alternate.resources.wallet,4000);assert.equal(cmp.alternate.resources.elapsed,1);assert.match(cmp.alternate.reason,/43.00/);
  assert.equal(engine.resolve(run({})).blocked,true);
  for(const cart of [{[CH]:0},{[CH]:-1},{[CH]:1.5},{[CH]:5},{[CH]:3,[FI]:2},{'巨无霸':1}])assert.throws(()=>engine.preview(run(cart)));
  for(const opts of [{oracle:'fake'},{coupon:'1'},{argument:'time'},{allocation:'all'},{response:'bus'}])assert.throws(()=>engine.preview(run({[CH]:2},opts)));
  assert.throws(()=>engine.makeRun(snapshot,0));assert.throws(()=>engine.makeRun(snapshot,2**32));assert.throws(()=>engine.makeRun({...snapshot,date:'2026-02-30'},1));
});
check('进行中恢复合法不完整态，克隆隔离；未知字段/快照篡改拒绝',()=>{
  const open=engine.makeRun(snapshot,1);assert.deepEqual(engine.restore(clone(open)),open);
  const r=run({[CH]:2},{oracle:'listen',allocation:'friend'}),restored=engine.restore(clone(r));assert.deepEqual(restored,r);assert.equal(engine.resolve(restored).blocked,true);
  restored.cart[CH]=1;assert.equal(r.cart[CH],2);
  for(const edit of [x=>x.version=2,x=>x.scenario='midnight',x=>x.seed=0,x=>x.oracle='fake',x=>x.response='bus',x=>x.admin=true,x=>x.cart[CH]=-1,x=>x.snapshot.menu[0].price=0]){const bad=clone(r);edit(bad);assert.throws(()=>engine.restore(bad));}
  const source=clone(snapshot),frozen=engine.makeRun(source,1);source.menu[0].price=0;assert.notEqual(frozen.snapshot.menu[0].price,0);
});
check('分享精确复现公开游戏输入；冻结原日期，不含中文餐名和任意字段',()=>{
  const r=run({[FI]:2},{response:'drop'}),hash=engine.encode(r),restored=engine.decode(hash,{...snapshot,date:'2026-10-17'});
  assert.ok(hash.startsWith('#ep=1&s=friend&'));assert.equal(hash.includes('麦香鱼'),false);assert.deepEqual(restored,r);assert.deepEqual(engine.resolve(restored),engine.resolve(r));assert.equal(restored.snapshot.date,'2026-10-16');
  const reverse=run({[FI]:1,[CH]:1}),again=engine.decode(engine.encode(reverse),snapshot);
  assert.deepEqual(Object.keys(again.cart),[FI,CH]);assert.deepEqual(engine.resolve(again),engine.resolve(reverse));
});
check('分享异常白名单、重复/缺失/坏日期/坏索引/断点/变化快照严格拒绝',()=>{
  const hash=engine.encode(run({[FI]:2},{response:'drop'}));
  const change=(k,v)=>{const p=new URLSearchParams(hash.slice(1));p.set(k,v);return '#'+p;};
  for(const bad of [hash+'&evil=1',hash+'&seed=1',hash.replace(/&seed=[^&]+/,''),change('ep','2'),change('s','midnight'),change('seed','0'),change('seed','4294967296'),change('d','2026-02-30'),change('o','2.1,2.1'),change('o','6.1'),change('o','2.5'),change('oracle','null'),change('coupon','yes'),change('allocation','all'),change('response','bus'),change('snap','other'),change('argument','evidence')])assert.throws(()=>engine.decode(bad,snapshot));
  const changed=clone(snapshot);changed.menu.find(m=>m.name===FI).price=19.01;assert.throws(()=>engine.decode(hash,changed),/快照已变化/);
  assert.throws(()=>engine.encode(run({[FI]:1},{oracle:'listen',allocation:'friend'})),/断点/);
});
check('有限枚举所有四份内订单与合法选择：8结局全可达，分配守恒、预算和时间不变量',()=>{
  const names=[CH,SP,FI,NU,FR,CO],points=[40,65,45,30,25,5],seen=new Set();let complete=0,blocked=0,combos=0;
  const decisions=[];
  for(const oracle of ['listen','deal'])for(const coupon of oracle==='deal'?[false,true]:[false])for(const argument of oracle==='listen'?['accept','evidence']:['accept'])for(const allocation of argument==='evidence'?['equal','self','friend']:['equal','self'])for(const response of ['sit','drop'])decisions.push({oracle,coupon,argument,allocation,response});
  function enumerate(quantities,remaining){
    if(quantities.length<names.length){for(let qty=0;qty<=remaining;qty++)enumerate([...quantities,qty],remaining-qty);return;}
    if(!quantities.some(Boolean))return;
    const cart=Object.fromEntries(quantities.map((qty,i)=>[names[i],qty]).filter(([,qty])=>qty));
    for(const opts of decisions){
      const r=run(cart,opts),before=JSON.stringify(r),out=engine.resolve(r);combos++;
      assert.equal(JSON.stringify(r),before);if(combos%113===0)assert.deepEqual(out,engine.resolve(r));
      assert.ok(Number.isInteger(out.resources.wallet)&&out.resources.wallet>=0&&out.resources.wallet<=4000);assert.ok(Number.isInteger(out.resources.elapsed)&&out.resources.elapsed>=0);
      assert.ok(out.resources.trust>=0&&out.resources.trust<=100);assert.ok(out.resources.ownSatiety>=20&&out.resources.friendSatiety>=10);
      assert.ok(out.timeline.every((node,i)=>!i||node.resources.elapsed>=out.timeline[i-1].resources.elapsed));
      assert.equal(out.preview.distribution.totalFood,quantities.reduce((s,qty,i)=>s+qty*points[i],0));
      for(const name of Object.keys(cart))assert.equal([...out.preview.trays.self,...out.preview.trays.friend].filter(t=>t.name===name).reduce((s,t)=>s+t.servings,0),cart[name]);
      if(out.blocked){blocked++;assert.equal(out.ending,null);assert.ok(out.reason);}
      else{complete++;seen.add(out.ending.id);assert.equal(out.timeline.at(-1).stage,'result');assert.equal(out.resources.ownSatiety+out.resources.friendSatiety,30+out.preview.distribution.totalFood);assert.equal(out.scene.reservedSeat,out.resources.elapsed<=20);}
    }
  }
  enumerate([],4);assert.deepEqual([...seen].sort(),engine.endings.map(e=>e.id).sort());assert.ok(complete>0&&blocked>0);console.log('  遍历 '+combos+' 组合：'+complete+' 通关 / '+blocked+' 明确断点 / '+seen.size+' 个结局');
});
console.log('\n饭搭子结果: '+passes+' 通过 / 0 失败');
