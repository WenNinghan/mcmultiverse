/* 实际页面/片段的确定性短局回归，使用原 quoteOrder，不复制业务计算。 */
const fs=require('fs'),path=require('path'),assert=require('assert');
const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
let js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
if(!js.includes('MC_JOURNEY_START')){
  const fragment=process.argv[2];
  if(!fragment)throw Error('页面尚未合并短局；可临时传入 journey.js 路径验证片段。');
  js+='\n'+fs.readFileSync(path.resolve(fragment),'utf8');
}
const nodes=new Map(),storage=new Map();
function el(){return {textContent:'',innerHTML:'',style:{},dataset:{},children:[],classList:{add(){},remove(){},toggle(){},contains(){return false}},appendChild(x){this.children.push(x)},querySelector(){return el()},querySelectorAll(){return []},setAttribute(){},scrollIntoView(){},remove(){},getBoundingClientRect(){return {left:0,top:0,width:100,height:40}},getContext(){return {setTransform(){},clearRect(){},beginPath(){},arc(){},fill(){},save(){},restore(){},translate(){},rotate(){},roundRect(){},fillRect(){}}}};}
global.document={readyState:'complete',getElementById(id){if(!nodes.has(id))nodes.set(id,el());return nodes.get(id)},createElement:el,querySelector:el,querySelectorAll(){return []},body:el(),addEventListener(){}};
global.window={__MC_TEST:true,scrollTo(){},matchMedia(){return {matches:true}}};global.matchMedia=window.matchMedia;
global.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
global.fetch=()=>new Promise(()=>{});global.requestAnimationFrame=()=>{};global.addEventListener=()=>{};global.innerWidth=390;global.innerHeight=844;global.CanvasRenderingContext2D=function(){};
const api=new Function(js+'\nreturn {DATA,quoteOrder,J:window.McJourney};')();
const J=api.J;
assert.ok(J,'实际短局API已加载');
const data={menu:api.DATA.menu,coupons:[...api.DATA.itemCoupons.map(c=>({...c,type:'item'})),...api.DATA.fullCoupons.map(c=>({...c,type:'full'}))],date:'2026-10-16',mode:'演示数据',source:'回归夹具'};
let pass=0;function check(name,fn){fn();pass++;console.log('✓ '+name);}
function run(id,seed=124){const state=J.makeJourney(id,seed,data);state.choices=[1,0];state.pivot=1;state.step='result';return state;}
check('同情景/种子/快照生成同一初始局',()=>assert.deepEqual(J.makeJourney('morning',121,data),J.makeJourney('morning',121,data)));
check('三情景默认方案均满足主食和预算',()=>{for(const s of J.SCENARIOS){for(const seed of [1,22,200,4294967295])assert.ok(J.validateJourneyGoal(J.makeJourney(s.id,seed,data)));}});
check('早餐薯饼不能冒充主食',()=>{const s=J.makeJourney('morning',3,data,{'脆薯饼(早餐)':1});assert.equal(J.validateJourneyGoal(s),false);});
check('无可用主食明确不可开始',()=>{const s=J.makeJourney('morning',3,{...data,menu:data.menu.filter(m=>m.cat==='snack')});assert.equal(s.available,false);assert.deepEqual(s.cart,{});});
check('短局报价直接调用页面整数分计算',()=>{const s=run('friend');assert.equal(J.getJourneyQuote(s.cart,s.snapshot,false).finalCents,api.quoteOrder(s.cart,s.snapshot.menu,[],{date:data.date}).finalCents);});
check('可解释替代方案保持主食数量且真正更省',()=>{const s=J.makeJourney('morning',3,data,{'猪柳蛋麦满分':1});const p=J.planJourney(s);assert.ok(p.alternative);assert.ok(p.alternative.quote.finalCents<p.original.finalCents);const adopted={...s,cart:p.alternative.cart,claimed:true};assert.ok(J.validateJourneyGoal(adopted));assert.ok(p.alternative.description.includes('不同')||p.alternative.description.includes('不变'));});
check('反事实仅换审判庭决定，输入不突变',()=>{const s=run('midnight');const before=JSON.stringify(s),a=J.resolveJourney(s,0),b=J.resolveJourney(s,1);assert.equal(JSON.stringify(s),before);assert.equal(a.seed,b.seed);assert.equal(a.signature,b.signature);assert.deepEqual(a.choices,b.choices);assert.notEqual(a.id,b.id);assert.deepEqual(J.resolveJourney(s,0),a);});
check('固定决定与选择可完整重放三段剧情',()=>{const s=run('friend');assert.equal(J.makeFragments(s,1).length,3);assert.deepEqual(J.makeFragments(s,1),J.makeFragments(s,1));assert.notDeepEqual(J.makeFragments(s,1),J.makeFragments(s,0));});
check('公开虚构SKU+数量、日期与必要选择精确往返',()=>{const s=run('friend');s.cart={'麦香鸡':2,'小薯条':1};s.claimed=true;s.choices=[1,1];const restored=J.decodeJourney(J.encodeJourney(s),data);assert.deepEqual(restored.cart,s.cart);assert.deepEqual(restored.choices,s.choices);assert.equal(restored.seed,s.seed);assert.equal(restored.snapshot.date,s.snapshot.date);assert.equal(restored.pivot,s.pivot);assert.equal(restored.claimed,s.claimed);assert.deepEqual(J.resolveJourney(restored,restored.pivot),J.resolveJourney(s,s.pivot));});
check('链接不包含产品自由文本或私有字段',()=>{const h=J.encodeJourney(run('friend'));assert.ok(!h.includes('麦'));const allowed=['mc','s','seed','o','p','a','b','c','snap','d'];for(const key of new URLSearchParams(h.slice(1)).keys())assert.ok(allowed.includes(key));});
check('拒绝未知/重复参数、错版本和快照',()=>{const h=J.encodeJourney(run('morning'));for(const changed of [h+'&text=hello',h+'&p=0',h.replace('mc=1','mc=2'),h.replace(/snap=[^&]+/,'snap=wrong'),h.replace(/s=[^&]+/,'s=unknown')])assert.throws(()=>J.decodeJourney(changed,data));});
check('拒绝过长链接、无效种子、超量/重复/未知SKU与非法日期',()=>{const h=J.encodeJourney(run('friend'));for(const changed of ['#'+('x'.repeat(1801)),h.replace(/seed=\d+/,'seed=4294967296'),h.replace(/o=[^&]+/,'o=0.21'),h.replace(/o=[^&]+/,'o=0.1%2C0.1'),h.replace(/o=[^&]+/,'o=999.1'),h.replace(/d=[^&]+/,'d=2026-99-99')])assert.throws(()=>J.decodeJourney(changed,data));});
check('超过20份的虚构订单被拒绝',()=>assert.throws(()=>J.makeJourney('friend',2,data,{'麦香鸡':20,'小薯条':1})));
check('主结局12个稳定ID，无重复且覆盖3情景/2决定/2最终选择',()=>{assert.equal(J.ENDINGS.length,12);assert.equal(new Set(J.ENDINGS.map(e=>e.id)).size,12);const seen=new Set();for(const scenario of J.SCENARIOS)for(const pivot of [0,1])for(const last of [0,1]){const s=run(scenario.id);s.choices=[0,last];seen.add(J.resolveJourney(s,pivot).id);}assert.equal(seen.size,12);});
check('小票含实际订单、整数分金额、稳定ID及来源，中文不丢失',()=>{const s=run('friend'),r=J.resolveJourney(s,s.pivot),text=J.receiptText(J.journeyReceipt(s));assert.ok(text.includes(r.id));assert.ok(text.includes('演示数据'));assert.ok(text.includes('虚构'));assert.ok(text.includes((r.quote.finalCents/100).toFixed(2)));assert.ok(text.includes('三种命运'));});
console.log(`\n结果: ${pass} 通过 / 0 失败`);
