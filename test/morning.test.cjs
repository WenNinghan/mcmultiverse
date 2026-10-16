/* 实际早八引擎＋从 index.html 提取的生产 quoteOrder；仅 Node 内置模块。 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
function between(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert.ok(a>=0&&b>a,'生产函数定位失败：'+start);return html.slice(a,b);}
const production=new Function([
  between('const DATA = {','let REAL_DATA ='),
  between('function localDateKey(','function escapeText('),
  between('function validCoupon(','function validateSnapshot('),
  between('function couponAvailable(','function dailyCoupons('),
  between('function quoteOrder(','function cartCalc('),
  'return {DATA,quoteOrder};'
].join('\n'))();
const api=require('../assets/morning-engine.js'),engine=api.createEngine(production.quoteOrder);
const clone=x=>JSON.parse(JSON.stringify(x));
const H='火腿扒麦满分',P='猪柳蛋麦满分',B='脆薯饼',C='中杯鲜煮咖啡';
const snapshot={menu:production.DATA.menu,coupons:[...production.DATA.itemCoupons.map(c=>({...c,type:'item'})),...production.DATA.fullCoupons.map(c=>({...c,type:'full'}))],date:'2026-10-16',mode:'演示数据',source:'内置商品与演示券'};
function run(cart={[H]:1},opts={},data=snapshot){return Object.assign(engine.makeRun(data,20261016),{oracle:'clock',cart},opts);}
let passes=0;
function check(name,fn){fn();passes++;console.log('✓ '+name);}
check('UMD导出、精选中文图片和生产价格；默认空单不替玩家做决定',()=>{
  const r=engine.makeRun(snapshot,1),p=engine.preview(r);
  assert.equal(p.valid,false);assert.equal(p.quote.finalCents,0);assert.equal(p.elapsed,0);assert.equal(p.wallet,1800);assert.equal(p.satiety,20);assert.equal(p.relationship,40);
  assert.deepEqual(r.cart,{});assert.equal(r.oracle,null);assert.equal(engine.catalog(r).length,4);assert.equal(engine.catalog(r).find(f=>f.name===H).priceCents,1050);
  assert.ok(engine.catalog(r).every(f=>f.img.startsWith('assets/menu/')&&f.img.endsWith('.png')));
});
check('生产早餐两件券：24→9.9，同时核验多花2分钟',()=>{
  const r=run({[P]:1,[C]:1},{oracle:'coupon',coupon:true}),p=engine.preview(r);
  assert.equal(p.quote.originCents,2400);assert.equal(p.quote.finalCents,990);assert.equal(p.verifyMinutes,2);assert.equal(p.wait,5);assert.equal(p.elapsed,8);assert.equal(p.wallet,810);assert.equal(p.couponApplied,true);assert.equal(p.valid,true);
  assert.ok(p.quote.evidence.some(t=>t.includes('早餐两件套')));
});
check('生产薯饼数量券：三份17.4；不偷偷启用其他种类券',()=>{
  const p=engine.preview(run({[B]:3},{oracle:'coupon',coupon:true}));assert.equal(p.quote.finalCents,1740);assert.equal(p.wallet,60);
  const full={id:'f1',name:'演示满1减1',type:'full',min:1,off:1,stackWithItem:true,thresholdBasis:'afterItem'};
  const s=clone(snapshot);s.coupons.push(full);assert.equal(engine.preview(run({[H]:1},{oracle:'coupon'},s)).quote.finalCents,1050);
});
check('过期券不降价；锁定核验意图仍扣2分钟并按原价继续',()=>{
  const s=clone(snapshot);s.coupons=s.coupons.map(c=>({...c,endsAt:'2026-10-15'}));
  const r=run({[B]:2},{oracle:'coupon',coupon:true},s),p=engine.preview(r),out=engine.resolve(r);
  assert.equal(p.quote.finalCents,1500);assert.equal(p.couponApplied,false);assert.equal(p.verifyMinutes,2);assert.equal(out.blocked,false);assert.equal(p.warnings.length,1);assert.ok(out.timeline.find(n=>n.id==='coupon').text.includes('核验仍花2分钟'));
});
check('校车以走到站为准：07:48可上，07:49不可上',()=>{
  const exact=run({[H]:1},{sharing:'share',route:'bus'}),p=engine.preview(exact),good=engine.resolve(exact);
  assert.equal(p.elapsed,4);assert.equal(p.availableRoutes.find(r=>r.id==='bus').available,true);assert.equal(good.arrival,16);assert.equal(good.arrivalClock,'07:58');
  const missed={...exact,argument:'time'},bad=engine.resolve(missed);
  assert.equal(engine.preview(missed).elapsed,5);assert.equal(bad.blocked,true);assert.equal(bad.arrival,null);assert.equal(bad.onTime,null);assert.equal(bad.ending,null);assert.match(bad.reason,/07:49/);
});
check('交通钱边界：剩600分可打车，599分明确断点、不改步行',()=>{
  const exact=clone(snapshot);exact.menu.find(m=>m.name===H).price=12;
  const poor=clone(snapshot);poor.menu.find(m=>m.name===H).price=12.01;
  const yes=engine.resolve(run({[H]:1},{route:'taxi'},exact)),no=engine.resolve(run({[H]:1},{route:'taxi'},poor));
  assert.equal(yes.blocked,false);assert.equal(yes.resources.wallet,0);assert.equal(no.blocked,true);assert.equal(no.resources.wallet,599);assert.equal(no.arrival,null);assert.match(no.reason,/5.99/);assert.equal(no.timeline.at(-1).id,'route');
});
check('申辩必须持时刻签；花1分钟，步行路程12→9',()=>{
  const base=run({[P]:1},{route:'walk'}),accept=engine.resolve(base),appeal=engine.resolve({...base,argument:'time'});
  assert.equal(accept.arrival,18);assert.equal(accept.onTime,true);assert.equal(appeal.arrival,16);assert.equal(appeal.timeline.find(n=>n.id==='court').elapsed,6);
  const forged=engine.resolve({...base,oracle:'coupon',argument:'time'});assert.equal(forged.blocked,true);assert.match(forged.reason,/没有时刻签/);
});
check('分餐真正影响时间、本人饱腹、朋友所得及关系',()=>{
  const r=run({[H]:1}),self=engine.preview(r),share=engine.preview({...r,sharing:'share'});
  assert.equal(self.satiety,65);assert.equal(share.satiety,42);assert.equal(share.elapsed,self.elapsed+1);assert.equal(self.relationship,35);assert.equal(share.relationship,70);assert.equal(share.friendSatiety,22);
  const tiny=engine.preview(run({[B]:1},{sharing:'share'}));assert.equal(tiny.friendSatiety,10);assert.equal(tiny.relationship,50);assert.equal(tiny.friendSatisfied,false);
});
check('低饱腹步行+3分钟，独立因果节点；饱腹恰55不用加时',()=>{
  const hungry=engine.resolve(run({[B]:1}));assert.equal(hungry.arrival,18);assert.equal(hungry.timeline.find(n=>n.id==='hunger').elapsed,18);
  const full=engine.resolve(run({[P]:1,[C]:1},{oracle:'coupon',coupon:true,sharing:'share',route:'walk'}));assert.equal(full.resources.satiety,55);assert.equal(full.arrival,21);assert.equal(full.timeline.some(n=>n.id==='hunger'),false);
});
check('单份替换qty=2只减少一份；锁定所有选择、快照与种子，不修改原单',()=>{
  const r=run({[B]:2},{oracle:'coupon',coupon:true,sharing:'share',route:'walk'}),before=JSON.stringify(r),cmp=engine.compare(r,{from:B,to:H});
  assert.deepEqual(cmp.changedCart,{[B]:1,[H]:1});assert.equal(JSON.stringify(r),before);
  for(const k of ['seed','oracle','coupon','argument','sharing','route','snapshot'])assert.deepEqual(cmp.alternateRun[k],r[k]);
  assert.equal(cmp.alternate.blocked,false);assert.equal(cmp.alternate.preview.verifyMinutes,2);assert.match(cmp.alternate.preview.warnings[0],/不再满足有效优惠/);assert.equal(cmp.alternate.quote.finalCents,1800);
});
check('原校车成功→换慢餐断点；并排保留原结局和真实分叉',()=>{
  const r=run({[H]:1},{route:'bus'}),cmp=engine.compare(r,H,P);
  assert.equal(cmp.original.blocked,false);assert.equal(cmp.alternate.blocked,true);assert.equal(cmp.alternate.arrival,null);assert.equal(cmp.alternate.ending,null);assert.equal(cmp.alternateRun.route,'bus');assert.equal(cmp.firstDivergence.id,'order');assert.equal(cmp.firstDivergence.index,1);assert.match(cmp.alternate.reason,/校车已走/);
});
check('同一份改单可改变关系与结局，非只改名字/金额',()=>{
  const r=run({[H]:1},{sharing:'share',argument:'time',route:'walk'}),cmp=engine.compare(r,H,B);
  assert.equal(cmp.original.resources.relationship,70);assert.equal(cmp.alternate.resources.relationship,50);assert.notEqual(cmp.original.ending.id,cmp.alternate.ending.id);assert.notEqual(cmp.original.ending.text,cmp.alternate.ending.text);
});
check('价格、等餐、饱腹具有非支配取舍；领券省钱需要更多时间',()=>{
  const h=engine.preview(run({[H]:1})),p=engine.preview(run({[P]:1}));assert.ok(h.quote.finalCents<p.quote.finalCents);assert.ok(h.wait<p.wait);assert.ok(h.satiety<p.satiety);
  const discounted=engine.preview(run({[P]:1,[C]:1},{oracle:'coupon',coupon:true}));assert.ok(discounted.quote.finalCents<h.quote.finalCents);assert.ok(discounted.elapsed>h.elapsed);assert.ok(discounted.satiety>h.satiety);
});
check('空单/仅咖啡/超预算/非法数量/未知SKU/伪造选择全部拒绝',()=>{
  assert.equal(engine.resolve(run({})).blocked,true);assert.equal(engine.preview(run({[C]:1})).valid,false);assert.equal(engine.resolve(run({[P]:2})).blocked,true);
  for(const cart of [{[H]:0},{[H]:-1},{[H]:1.2},{[H]:5},{[H]:3,[B]:2},{'巨无霸':1}])assert.throws(()=>engine.preview(run(cart)));
  for(const opts of [{oracle:'bad'},{coupon:'1'},{argument:'shortcut'},{sharing:'none'},{route:'plane'}])assert.throws(()=>engine.preview(run({[H]:1},opts)));
  assert.throws(()=>engine.makeRun(snapshot,0));assert.throws(()=>engine.makeRun(snapshot,2**32));assert.throws(()=>engine.makeRun({...snapshot,date:'2026-02-30'},1));
});
check('快照拷贝、不共享可变引用；篡改已冻结版本会被发现',()=>{
  const s=clone(snapshot),r=run({[H]:1},{},s);s.menu.find(m=>m.name===H).price=0;assert.equal(engine.preview(r).quote.finalCents,1050);
  r.snapshot.menu.find(m=>m.name===H).price=0;assert.throws(()=>engine.resolve(r),/快照已经变化/);
});
check('进行中刷新：空单和未选神谕可恢复，schema合法的交通断点也可回到选择',()=>{
  const opening=engine.makeRun(snapshot,1),restored=engine.restore(clone(opening));assert.deepEqual(restored,opening);assert.equal(restored.oracle,null);assert.deepEqual(restored.cart,{});
  const partial=run({[P]:1},{route:'bus'}),again=engine.restore(clone(partial));assert.deepEqual(again,partial);assert.equal(engine.resolve(again).blocked,true);
  again.cart[P]=2;again.snapshot.menu[0].price=0;assert.equal(partial.cart[P],1);assert.notEqual(partial.snapshot.menu[0].price,0);
});
check('进行中恢复拒绝未知字段、伪造选择、版本和被篡改的菜单快照',()=>{
  const r=run();for(const edit of [x=>x.version=2,x=>x.seed=0,x=>x.oracle='fake',x=>x.route='plane',x=>x.cart[H]=-1,x=>x.admin=true,x=>x.snapshot.menu[0].price=0]){const forged=clone(r);edit(forged);assert.throws(()=>engine.restore(forged));}
  for(const value of [null,[],{},'state'])assert.throws(()=>engine.restore(value));
});
check('分享精确复现同局，跨日期仍冻结原日期；只编码白名单公开选择',()=>{
  const r=run({[P]:1,[C]:1},{oracle:'coupon',coupon:true,sharing:'share',route:'taxi'}),encoded=engine.encode(r),restored=engine.decode(encoded,{...snapshot,date:'2026-10-17'});
  assert.ok(encoded.startsWith('#am=1&'));assert.equal(encoded.includes('猪柳'),false);assert.deepEqual(engine.resolve(restored),engine.resolve(r));assert.equal(restored.snapshot.date,'2026-10-16');
  assert.equal(new URLSearchParams(encoded.slice(1)).getAll('seed').length,1);
});
check('分享未知/重复/缺失参数、坏日期、版本、索引、数量、快照、断点拒绝',()=>{
  const r=run({[H]:1},{sharing:'share',route:'bus'}),encoded=engine.encode(r);
  const change=(k,v)=>{const p=new URLSearchParams(encoded.slice(1));p.set(k,v);return '#'+p;};
  for(const hash of [encoded+'&evil=1',encoded+'&seed=1',encoded.replace(/&seed=[^&]+/,''),change('am','2'),change('seed','0'),change('seed','4294967296'),change('d','2026-02-30'),change('o','0.1,0.1'),change('o','4.1'),change('o','0.5'),change('oracle','null'),change('coupon','yes'),change('sharing','everyone'),change('route','plane'),change('snap','other'),change('argument','time')])assert.throws(()=>engine.decode(hash,snapshot));
  const changed=clone(snapshot);changed.menu.find(m=>m.name===H).price=11;assert.throws(()=>engine.decode(encoded,changed),/快照已变化/);
  assert.throws(()=>engine.encode(run({[P]:1},{route:'bus'})),/断点/);
});
check('所有合法四份内订单×签×券×申辩×分餐×交通：确定性与资源不变量，8结局全可达',()=>{
  const names=[H,P,B,C],seen=new Map();let completed=0,blocked=0,combos=0;
  for(let h=0;h<=4;h++)for(let p=0;p<=4-h;p++)for(let b=0;b<=4-h-p;b++)for(let c=0;c<=4-h-p-b;c++){
    if(!h&&!p&&!b&&!c)continue;
    const cart=Object.fromEntries([h,p,b,c].map((q,i)=>[names[i],q]).filter(x=>x[1]));
    for(const oracle of ['clock','coupon'])for(const coupon of [false,true])for(const argument of ['accept','time'])for(const sharing of ['self','share'])for(const route of ['bus','walk','taxi']){
      const r=run(cart,{oracle,coupon,argument,sharing,route}),before=JSON.stringify(r),a=engine.resolve(r);combos++;
      assert.equal(JSON.stringify(r),before);assert.deepEqual(a,engine.resolve(r));
      assert.ok(Number.isInteger(a.resources.elapsed)&&a.resources.elapsed>=0);assert.ok(Number.isInteger(a.resources.wallet)&&a.resources.wallet>=0);
      assert.ok(a.resources.satiety>=0&&a.resources.satiety<=100);assert.ok(a.resources.relationship>=0&&a.resources.relationship<=100);
      assert.ok(a.timeline.every((n,i)=>!i||n.elapsed>=a.timeline[i-1].elapsed));
      if(a.blocked){blocked++;assert.equal(a.ending,null);assert.equal(a.arrival,null);assert.ok(a.reason);}
      else{completed++;seen.set(a.ending.id,cart);assert.equal(a.onTime,a.arrival<=18);assert.equal(a.ending.full,a.resources.satiety>=55);assert.equal(a.ending.close,a.resources.relationship>=65);assert.equal(a.timeline.at(-1).id,'arrival');}
    }
  }
  assert.deepEqual([...seen.keys()].sort(),api.ENDINGS.map(e=>e.id).sort());assert.ok(completed>0&&blocked>0);console.log('  遍历 '+combos+' 组合：'+completed+' 通关 / '+blocked+' 明确断点 / '+seen.size+' 个结局');
});
console.log('\n早八结果: '+passes+' 通过 / 0 失败');
