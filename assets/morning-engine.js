/* 早八因果引擎。时间/饱腹/关系都是虚构游戏值；价格复用生产 quoteOrder。 */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.McMorning=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION=1,BUDGET=1800,START=7*60+42,DEADLINE=18,MAX_COUNT=4;
  const FOOD=Object.freeze([
    {name:'火腿扒麦满分',prep:1,satiety:45},
    {name:'猪柳蛋麦满分',prep:4,satiety:65},
    {name:'脆薯饼',prep:1,satiety:20},
    {name:'中杯鲜煮咖啡',prep:2,satiety:5}
  ]);
  const ENDINGS=Object.freeze([
    {id:'am-111',name:'热乎的同盟',onTime:true,full:true,close:true,text:'你们没有错过上课铃，半份早餐也够撑住这一节。朋友给你留了靠窗的位置；这次兼顾的代价，写在多等的那几分钟里。'},
    {id:'am-110',name:'全勤与独食',onTime:true,full:true,close:false,text:'签到和早餐都保住了。朋友看了眼空袋子，把“帮我带一份”撤回了；这一局的效率很好，关系却没有跟上。'},
    {id:'am-101',name:'空腹的默契',onTime:true,full:false,close:true,text:'你们一起赶上了课，也一起听见你的肚子叫。朋友推来半页笔记：“下顿我请。”默契留下了，饥饿也留下了。'},
    {id:'am-100',name:'到场但没开机',onTime:true,full:false,close:false,text:'人到教室，脑子还在取餐台。签到保住了，早餐没有填饱你，你和朋友约好的那顿早餐也没落实。'},
    {id:'am-011',name:'迟到的同盟',onTime:false,full:true,close:true,text:'签到表已经收走。你和朋友分完早餐才进教室，朋友递来的完整笔记救了这一节；你吃饱了，也确实迟到了。'},
    {id:'am-010',name:'饱了，人没到',onTime:false,full:true,close:false,text:'早餐扎实，签到落空。法官坚持宣布“本单体验完整”，你盯着迟到记录，决定下次把路程也写进账本。'},
    {id:'am-001',name:'半份早餐的代价',onTime:false,full:false,close:true,text:'你们迟到了，半份早餐也没让你吃饱。朋友陪你在后排坐下，把笔记转向你；这份关系有收益，却没抹掉时间和饥饿的代价。'},
    {id:'am-000',name:'全线漂移',onTime:false,full:false,close:false,text:'签到没赶上，早餐也没顶住，朋友也没收到一顿像样早餐。这不是宇宙针对你：小票上每一笔时间，都能找到来处。'}
  ].map(Object.freeze));
  const copy=x=>JSON.parse(JSON.stringify(x));
  function stable(x){
    if(Array.isArray(x))return '['+x.map(stable).join(',')+']';
    if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';
    return JSON.stringify(x);
  }
  function hash(x){let n=2166136261;for(const c of stable(x)){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return (n>>>0).toString(36);}
  function dateOK(day){const d=new Date(day+'T12:00:00Z');return /^20\d{2}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===day;}
  function normalize(snapshot){
    if(!snapshot||!Array.isArray(snapshot.menu)||!snapshot.menu.length)throw Error('本局菜单为空。');
    if(!dateOK(snapshot.date))throw Error('本局日期无效。');
    const menu=copy(snapshot.menu);
    if(menu.some(m=>!m||typeof m.name!=='string'||!Number.isFinite(m.price)||m.price<0||!Number.isSafeInteger(Math.round(m.price*100)))||new Set(menu.map(m=>m.name)).size!==menu.length)throw Error('本局菜单名称或价格无效。');
    const coupons=copy(snapshot.coupons||[...(snapshot.itemCoupons||[]).map(c=>({...c,type:'item'})),...(snapshot.fullCoupons||[]).map(c=>({...c,type:'full'}))]);
    if(!Array.isArray(coupons))throw Error('本局优惠快照无效。');
    const out={menu,coupons,date:snapshot.date,mode:typeof snapshot.mode==='string'?snapshot.mode:'演示数据',source:typeof snapshot.source==='string'?snapshot.source:'内置商品与演示券'};
    out.signature=hash(out);return out;
  }
  function clock(elapsed){const m=START+elapsed;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}
  function money(cents){return '¥'+(cents/100).toFixed(2);}
  function createEngine(quoteOrder){
    if(typeof quoteOrder!=='function')throw Error('早八需要已有的整数分计价函数。');
    function makeRun(snapshot,seed){
      if(!Number.isInteger(seed)||seed<1||seed>4294967295)throw Error('本局种子无效。');
      return {version:VERSION,seed,snapshot:normalize(snapshot),oracle:null,cart:{},coupon:false,argument:'accept',sharing:'self',route:'walk'};
    }
    function catalog(run){
      if(!run||!run.snapshot||!Array.isArray(run.snapshot.menu))throw Error('本局菜单无效。');
      return FOOD.flatMap(f=>{const m=run.snapshot.menu.find(x=>x.name===f.name);return m?[{id:f.name,name:f.name,img:m.img||'',priceCents:Math.round(m.price*100),prep:f.prep,satiety:f.satiety}]:[];});
    }
    function validate(run){
      if(!run||run.version!==VERSION||!Number.isInteger(run.seed)||run.seed<1||run.seed>4294967295)throw Error('本局版本或种子无效。');
      if(![null,'clock','coupon'].includes(run.oracle)||typeof run.coupon!=='boolean'||!['accept','time'].includes(run.argument)||!['self','share'].includes(run.sharing)||!['bus','walk','taxi'].includes(run.route))throw Error('本局选择无效。');
      const snapshot=normalize(run.snapshot);
      if(run.snapshot.signature!==snapshot.signature)throw Error('本局菜单或优惠快照已经变化。');
      if(!run.cart||typeof run.cart!=='object'||Array.isArray(run.cart))throw Error('订单格式无效。');
      const items=catalog(run),names=new Set(items.map(f=>f.name));let count=0;
      for(const [name,qty] of Object.entries(run.cart)){
        if(!names.has(name)||!Number.isInteger(qty)||qty<1||qty>MAX_COUNT)throw Error('订单包含无效餐品或数量。');count+=qty;
      }
      if(count>MAX_COUNT)throw Error('这一局最多点四份餐品。');
      return {snapshot,items,count};
    }
    function restore(savedRun){
      const keys=['version','seed','snapshot','oracle','cart','coupon','argument','sharing','route'];
      if(!savedRun||typeof savedRun!=='object'||Array.isArray(savedRun)||Object.keys(savedRun).some(k=>!keys.includes(k)))throw Error('早八存档字段无效。');
      const {snapshot}=validate(savedRun);
      return {version:VERSION,seed:savedRun.seed,snapshot,oracle:savedRun.oracle,cart:copy(savedRun.cart),coupon:savedRun.coupon,argument:savedRun.argument,sharing:savedRun.sharing,route:savedRun.route};
    }
    function routes(p,run){
      const shortcut=run.oracle==='clock'&&run.argument==='time';
      const penalty=p.satiety<55?3:0,walk=(shortcut?9:12)+penalty;
      return [
        {id:'bus',name:'校车',available:p.elapsed+2<=6,reason:p.elapsed+2<=6?'走到车站2分钟，07:48发车，07:58到教室':'走到站需2分钟，将在'+clock(p.elapsed+2)+'到站；07:48校车已走。',minutes:Math.max(0,6-p.elapsed)+10,costCents:0},
        {id:'walk',name:shortcut?'穿近路步行':'常规步行',available:true,reason:(shortcut?'时刻签＋1分钟申辩换来9分钟近路':'常规步行12分钟')+(penalty?'；饱腹不足55，饿着走再加3分钟。':'。'),minutes:walk,costCents:0,baseMinutes:shortcut?9:12,hungerMinutes:penalty},
        {id:'taxi',name:'打车',available:p.wallet>=600,reason:p.wallet>=600?'花'+money(600)+'换6分钟车程':'打车需¥6.00，当前只剩'+money(p.wallet)+'。',minutes:6,costCents:600}
      ];
    }
    function preview(run){
      const {snapshot,items,count}=validate(run);
      const allowed=snapshot.coupons.filter(c=>['bf99','hashbrown99'].includes(c.id)&&c.type!=='full');
      const quote=quoteOrder(run.cart,snapshot.menu,run.coupon&&run.oracle==='coupon'?allowed:[],{date:snapshot.date});
      if(!Number.isSafeInteger(quote.finalCents)||quote.finalCents<0||quote.finalCents>quote.originCents)throw Error('计价模块返回了无效的整数分金额。');
      const couponApplied=run.coupon&&run.oracle==='coupon'&&quote.finalCents<quote.originCents;
      const errors=[],warnings=[];
      if(!run.oracle)errors.push('先选择一张神谕，再决定怎么点单。');
      if(!count)errors.push('先点至少一份餐品；四份是本局上限。');
      if(count&&!items.some(f=>f.name!=='中杯鲜煮咖啡'&&run.cart[f.name]))errors.push('咖啡可以陪早餐，但本局至少需要一份麦满分或薯饼。');
      if(run.coupon&&run.oracle!=='coupon')errors.push('只有优惠签能启用本局早餐演示券。');
      if(run.coupon&&!couponApplied)warnings.push('已锁定用券意图，但订单不再满足有效优惠；仍花2分钟核验，按原价'+money(quote.finalCents)+'成交。');
      if(run.argument==='time'&&run.oracle!=='clock')errors.push('没有时刻签的线索，无法用时间申辩换近路。');
      if(quote.finalCents>BUDGET)errors.push('本单需'+money(quote.finalCents)+'，超过¥18.00预算。');
      const foodSatiety=items.reduce((sum,f)=>sum+(run.cart[f.name]||0)*f.satiety,0);
      const wait=count?Math.max(...items.filter(f=>run.cart[f.name]).map(f=>f.prep))+1:0;
      const verifyMinutes=run.coupon?2:0,argumentMinutes=run.argument==='time'?1:0,eatMinutes=count?(run.sharing==='share'?2:1):0;
      const satiety=Math.min(100,Math.floor(20+foodSatiety*(run.sharing==='share'?.5:1)));
      const friendSatiety=run.sharing==='share'?Math.floor(foodSatiety/2):0,friendSatisfied=friendSatiety>=20;
      const relationship=count?(run.sharing==='share'?(friendSatisfied?70:50):35):40;
      const p={quote,elapsed:wait+verifyMinutes+argumentMinutes+eatMinutes,wallet:BUDGET-quote.finalCents,satiety,relationship,valid:!errors.length,errors,warnings,count,wait,verifyMinutes,argumentMinutes,eatMinutes,foodSatiety,friendSatiety,friendSatisfied,couponApplied,estimated:true,walkPenalty:satiety<55?3:0};
      p.availableRoutes=routes(p,run);return p;
    }
    function resolve(run){
      const p=preview(run),timeline=[];let elapsed=0,wallet=BUDGET,satiety=20,relationship=40;
      function node(id,title,text,extra){timeline.push({id,title,text,elapsed,wallet,satiety,relationship,...extra});}
      function result(blocked,reason,ending,arrival){return {timeline,resources:{elapsed,wallet,satiety,relationship},arrival,arrivalClock:arrival==null?null:clock(arrival),onTime:arrival==null?null:arrival<=DEADLINE,ending,availableRoutes:p.availableRoutes,blocked,reason:reason||'',quote:p.quote,couponApplied:p.couponApplied,preview:p};}
      node('oracle','07:42 · 神谕阁',run.oracle==='clock'?'时刻签：校车07:48发车；持签花1分钟申辩，可走9分钟近路。':run.oracle==='coupon'?'优惠签：早餐演示券可以省钱，每次核验都要2分钟。':'尚未选择神谕。');
      if(!run.oracle||!p.count)return result(true,p.errors.join(' '),null,null);
      elapsed+=p.wait;node('order','取餐台 · 等了'+p.wait+'分钟',Object.entries(run.cart).map(([n,q])=>n+' ×'+q).join('、')+'；并行出餐最长'+(p.wait-1)+'分钟，装袋1分钟。');
      if(run.coupon){elapsed+=2;node('coupon','审判庭 · 核券2分钟',p.couponApplied?'原价'+money(p.quote.originCents)+' → 实付'+money(p.quote.finalCents)+'。'+p.quote.evidence.join('；'):'用券意图没有改变，核验仍花2分钟；新单缺少有效优惠条件，按原价'+money(p.quote.finalCents)+'继续。');}
      if(!p.valid){node('blocked','订单断点',p.errors.join(' '),{blocked:true});return result(true,p.errors.join(' '),null,null);}
      elapsed+=p.argumentMinutes;wallet-=p.quote.finalCents;
      node('court',run.argument==='time'?'反驳成功 · 本庭把时间也记账':'接受判词 · 本庭先审钱包',run.argument==='time'?'你拿出时刻签：“等餐不是免费。”花1分钟申辩，换得9分钟步行近路。':'支付'+money(p.quote.finalCents)+'。法官：“本庭只保证金额算得对，赶不赶得上课还得看你。”');
      elapsed+=p.eatMinutes;satiety=p.satiety;relationship=p.relationship;
      node('meal',run.sharing==='share'?'分出半份 · 朋友关系＋'+(p.friendSatisfied?30:10):'自己吃完 · 朋友关系−5',run.sharing==='share'?'分餐用了2分钟；你的饱腹从20变为'+satiety+'，朋友分到'+p.friendSatiety+'点食物饱腹。'+(p.friendSatisfied?'朋友：“下顿我请。”':'朋友：“谢谢，不过这点还不够当早餐。”'):'吃完用了1分钟；你的饱腹从20变为'+satiety+'。朋友把“帮我带一份”撤回了。');
      const route=p.availableRoutes.find(r=>r.id===run.route);
      if(!route.available){node('route','交通断点 · '+route.name,route.reason,{blocked:true});return result(true,route.reason,null,null);}
      if(run.route==='walk'){
        elapsed+=route.baseMinutes;node('route',route.name+' · '+route.baseMinutes+'分钟',run.argument==='time'?'申辩获得的线索改变了这条路；你穿过食堂后门。':'沿常规路线走向教室。');
        if(route.hungerMinutes){elapsed+=route.hungerMinutes;node('hunger','饥饿慢走 · 再加3分钟','出发时饱腹低于55，饿着走多花3分钟。点单与分餐改变了这段时间。');}
      }else{
        elapsed+=route.minutes;wallet-=route.costCents;
        node('route',route.name+' · '+route.minutes+'分钟',run.route==='bus'?'走到站、等车后，07:48发车；07:58到教室。':'交通花¥6.00，6分钟到教室。省下的钱在这里变成了时间。');
      }
      const onTime=elapsed<=DEADLINE,full=satiety>=55,close=relationship>=65;
      const id='am-'+Number(onTime)+Number(full)+Number(close),base=ENDINGS.find(e=>e.id===id);
      const ending={...base,text:base.text+' '+clock(elapsed)+'到达，'+(elapsed===DEADLINE?'准点上课':onTime?'比08:00早'+(DEADLINE-elapsed)+'分钟':'比08:00晚'+(elapsed-DEADLINE)+'分钟')+'；余额'+money(wallet)+'，饱腹'+satiety+'，关系'+relationship+'。'};
      node('arrival','轮回司 · '+ending.name,ending.text);
      return result(false,'',ending,elapsed);
    }
    function compare(run,replacement,toName){
      const {from,to}=typeof replacement==='string'?{from:replacement,to:toName}:replacement||{};
      validate(run);
      if(typeof from!=='string'||typeof to!=='string'||from===to||!run.cart[from]||!catalog(run).some(f=>f.name===to))throw Error('请选择原单中一份餐品，替换为另一种可用餐品。');
      const alternateRun=copy(run);alternateRun.cart[from]--;
      if(!alternateRun.cart[from])delete alternateRun.cart[from];
      alternateRun.cart[to]=(alternateRun.cart[to]||0)+1;
      const original=resolve(run),alternate=resolve(alternateRun);
      let index=0;
      while(index<Math.min(original.timeline.length,alternate.timeline.length)&&stable(original.timeline[index])===stable(alternate.timeline[index]))index++;
      const a=original.timeline[index]||null,b=alternate.timeline[index]||null;
      return {original,alternate,changedCart:copy(alternateRun.cart),alternateRun,firstDivergence:{id:(b||a||{}).id||'none',title:(b||a||{}).title||'结局一致',text:a&&b?'只替换一份'+from+' → '+to+'，从这里开始不同。':'一条时间线在这里中断。',index,original:a,alternate:b}};
    }
    const KEYS=['am','seed','o','oracle','coupon','argument','sharing','route','snap','d'];
    function encode(run){
      validate(run);const r=resolve(run);if(r.blocked)throw Error('有断点的本局不能生成已通关分享链接。');
      const names=catalog(run).map(f=>f.name),p=new URLSearchParams({am:String(VERSION),seed:String(run.seed),o:Object.entries(run.cart).sort((a,b)=>names.indexOf(a[0])-names.indexOf(b[0])).map(([n,q])=>names.indexOf(n)+'.'+q).join(','),oracle:run.oracle,coupon:run.coupon?'1':'0',argument:run.argument,sharing:run.sharing,route:run.route,snap:run.snapshot.signature,d:run.snapshot.date});
      return '#'+p.toString();
    }
    function decode(fragment,snapshot){
      if(typeof fragment!=='string'||fragment.length>1000)throw Error('早八重玩链接无效。');
      const p=new URLSearchParams(fragment.replace(/^#/,''));
      if([...p.keys()].some(k=>!KEYS.includes(k))||KEYS.some(k=>p.getAll(k).length!==1))throw Error('早八重玩链接包含未知、缺失或重复参数。');
      if(p.get('am')!==String(VERSION)||!/^[1-9]\d{0,9}$/.test(p.get('seed'))||Number(p.get('seed'))>4294967295||!dateOK(p.get('d')))throw Error('早八重玩版本、日期或种子无效。');
      if(!['clock','coupon'].includes(p.get('oracle'))||!['0','1'].includes(p.get('coupon'))||!['accept','time'].includes(p.get('argument'))||!['self','share'].includes(p.get('sharing'))||!['bus','walk','taxi'].includes(p.get('route')))throw Error('早八重玩选择无效。');
      const run=makeRun({...snapshot,date:p.get('d')},Number(p.get('seed')));
      if(p.get('snap')!==run.snapshot.signature)throw Error('这张小票的菜单或优惠快照已变化，无法复现原局。');
      const order=p.get('o');if(!/^[0-3]\.[1-4](,[0-3]\.[1-4]){0,3}$/.test(order))throw Error('早八订单编码无效。');
      const entries=order.split(',').map(x=>x.split('.').map(Number)),items=catalog(run);
      if(new Set(entries.map(x=>x[0])).size!==entries.length||entries.some(([i])=>!items[i]))throw Error('早八订单存在未知或重复餐品。');
      run.cart=Object.fromEntries(entries.map(([i,q])=>[items[i].name,q]));
      Object.assign(run,{oracle:p.get('oracle'),coupon:p.get('coupon')==='1',argument:p.get('argument'),sharing:p.get('sharing'),route:p.get('route')});
      validate(run);if(resolve(run).blocked)throw Error('这张小票存在订单或交通断点，无法作为已通关重玩。');
      return run;
    }
    return {makeRun,catalog,restore,preview,resolve,compare,encode,decode,endings:ENDINGS};
  }
  return {VERSION,ENDINGS,createEngine};
});
