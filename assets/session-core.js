/* Shared mechanics only: frozen public data, integer-cent quotes, one-item replay. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.McSessionCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  function stable(value){
    if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
    if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
    return JSON.stringify(value);
  }
  function hash(value){let n=2166136261;for(const c of stable(value)){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return (n>>>0).toString(36);}
  function validDay(value){const d=new Date(value+'T12:00:00Z');return typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
  function normalize(snapshot){
    if(!snapshot||!Array.isArray(snapshot.menu)||!snapshot.menu.length||!validDay(snapshot.date))throw Error('菜单或本局日期无效。');
    const menu=clone(snapshot.menu);
    if(menu.some(m=>!m||typeof m.name!=='string'||!m.name||m.name.length>100||!Number.isFinite(m.price)||m.price<0||!Number.isSafeInteger(Math.round(m.price*100)))||new Set(menu.map(m=>m.name)).size!==menu.length)throw Error('菜单名称或整数分价格无效。');
    const coupons=clone(snapshot.coupons||[...(snapshot.itemCoupons||[]).map(c=>({...c,type:'item'})),...(snapshot.fullCoupons||[]).map(c=>({...c,type:'full'}))]);
    if(!Array.isArray(coupons))throw Error('优惠快照无效。');
    const value={menu,coupons,date:snapshot.date,mode:typeof snapshot.mode==='string'?snapshot.mode:'演示数据',source:typeof snapshot.source==='string'?snapshot.source:'内置公开商品与演示规则'};
    value.signature=hash(value);return value;
  }
  function clock(elapsed,startMinutes){
    if(!Number.isFinite(elapsed)||!Number.isFinite(startMinutes))throw Error('游戏时刻无效。');
    const minutes=((Math.round(startMinutes+elapsed)%1440)+1440)%1440;
    return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
  }
  function createTools(quoteOrder,config){
    if(typeof quoteOrder!=='function'||!config||!['midnight','friend'].includes(config.id))throw Error('短局计价模块或情景配置无效。');
    const fields=config.fields,defaults=clone(config.defaults),keys=['version','scenario','seed','snapshot','cart',...Object.keys(defaults)];
    const maxCount=4;
    function catalog(run){
      if(!run?.snapshot||!Array.isArray(run.snapshot.menu))throw Error('本局快照无效。');
      return config.foods.flatMap(f=>{const item=run.snapshot.menu.find(m=>m.name===f.name);return item?[{...clone(f),id:f.name,img:item.img||'',priceCents:Math.round(item.price*100)}]:[];});
    }
    function validate(run){
      if(!run||typeof run!=='object'||Array.isArray(run)||Object.keys(run).some(k=>!keys.includes(k))||keys.some(k=>!Object.prototype.hasOwnProperty.call(run,k)))throw Error('存档含有未知或缺失字段。');
      if(run.version!==1||run.scenario!==config.id||!Number.isInteger(run.seed)||run.seed<1||run.seed>4294967295)throw Error('本局版本、情景或种子无效。');
      for(const key of Object.keys(defaults))if(!fields[key]?.some(value=>value===run[key]))throw Error('本局选择无效：'+key+'。');
      const snapshot=normalize(run.snapshot);
      if(snapshot.signature!==run.snapshot.signature)throw Error('本局菜单或优惠快照已经变化。');
      if(!run.cart||typeof run.cart!=='object'||Array.isArray(run.cart))throw Error('订单格式无效。');
      const items=catalog(run),names=new Set(items.map(item=>item.name));let count=0;
      for(const [name,qty] of Object.entries(run.cart)){
        if(!names.has(name)||!Number.isInteger(qty)||qty<1||qty>maxCount)throw Error('订单含有未知餐品或非法数量。');
        count+=qty;
      }
      if(count>maxCount)throw Error('本局最多四份餐品。');
      return {items,count,snapshot};
    }
    function makeRun(snapshot,seed){
      const run={version:1,scenario:config.id,seed,snapshot:normalize(snapshot),cart:{},...clone(defaults)};
      validate(run);if(!catalog(run).length)throw Error('当前快照缺少本局餐品，不能开始。');return run;
    }
    function restore(run){validate(run);return clone(run);}
    function quote(run,couponIds=[]){
      const {snapshot}=validate(run);
      const coupons=run.coupon?snapshot.coupons.filter(c=>c&&couponIds.includes(c.id)&&c.type!=='full'):[];
      const q=quoteOrder(run.cart,snapshot.menu,coupons,{date:snapshot.date});
      if(!Number.isSafeInteger(q.finalCents)||!Number.isSafeInteger(q.originCents)||q.finalCents<0||q.finalCents>q.originCents)throw Error('生产计价返回了无效金额。');
      return {...q,couponApplied:!!run.coupon&&q.finalCents<q.originCents};
    }
    function compare(run,replacement,resolve){
      validate(run);
      const {from,to}=replacement||{};
      if(typeof from!=='string'||typeof to!=='string'||from===to||!run.cart[from]||!catalog(run).some(item=>item.name===to))throw Error('请选择原单中的一份餐品替换为另一种。');
      const alternateRun=clone(run);
      alternateRun.cart[from]--;
      if(!alternateRun.cart[from])delete alternateRun.cart[from];
      alternateRun.cart[to]=(alternateRun.cart[to]||0)+1;
      validate(alternateRun);
      const original=resolve(run),alternate=resolve(alternateRun);let index=0;
      while(index<Math.min(original.timeline.length,alternate.timeline.length)&&stable(original.timeline[index])===stable(alternate.timeline[index]))index++;
      const first=alternate.timeline[index]||original.timeline[index];
      return {original,alternate,alternateRun,changedCart:clone(alternateRun.cart),firstDivergence:{id:first?.id||'none',title:first?.title||'结果一致',index,text:'只替换一份'+from+' → '+to+'，其它输入保持相同。'}};
    }
    const shareKeys=['ep','s','seed','o','snap','d',...Object.keys(defaults)];
    function encode(run,resolve){
      validate(run);if(resolve(run).blocked)throw Error('有断点的本局不能生成已完成分享单。');
      const names=catalog(run).map(item=>item.name);
      const params=new URLSearchParams({ep:'1',s:config.id,seed:String(run.seed),o:Object.entries(run.cart).map(([name,qty])=>names.indexOf(name)+'.'+qty).join(','),snap:run.snapshot.signature,d:run.snapshot.date});
      for(const key of Object.keys(defaults))params.set(key,typeof run[key]==='boolean'?(run[key]?'1':'0'):String(run[key]));
      return '#'+params.toString();
    }
    function decode(fragment,snapshot,resolve){
      if(typeof fragment!=='string'||!fragment.startsWith('#')||fragment.length>1400)throw Error('重玩链接格式或长度无效。');
      const p=new URLSearchParams(fragment.slice(1));
      if([...p.keys()].some(k=>!shareKeys.includes(k))||shareKeys.some(k=>p.getAll(k).length!==1))throw Error('重玩链接含有未知、重复或缺失参数。');
      if(p.get('ep')!=='1'||p.get('s')!==config.id||!/^[1-9]\d{0,9}$/.test(p.get('seed'))||Number(p.get('seed'))>4294967295||!validDay(p.get('d')))throw Error('重玩版本、情景、日期或种子无效。');
      const run=makeRun({...snapshot,date:p.get('d')},Number(p.get('seed')));
      if(p.get('snap')!==run.snapshot.signature)throw Error('菜单或优惠快照已变化，不能假装复现这局。');
      const raw=p.get('o');
      if(!/^\d{1,2}\.[1-4](,\d{1,2}\.[1-4]){0,3}$/.test(raw))throw Error('重玩订单编码无效。');
      const entries=raw.split(',').map(pair=>pair.split('.').map(Number)),items=catalog(run);
      if(new Set(entries.map(pair=>pair[0])).size!==entries.length||entries.some(([i])=>!items[i]))throw Error('重玩订单包含重复或未知餐品。');
      run.cart=Object.fromEntries(entries.map(([i,qty])=>[items[i].name,qty]));
      for(const key of Object.keys(defaults)){
        const value=p.get(key);
        if(typeof defaults[key]==='boolean'){
          if(!['0','1'].includes(value))throw Error('重玩布尔选择无效。');run[key]=value==='1';
        }else run[key]=value;
      }
      validate(run);if(resolve(run).blocked)throw Error('重玩单存在订单或行动断点，不能作为已完成结果。');return run;
    }
    return {makeRun,validate,catalog,restore,quote,compare,encode,decode,clock,clone,hash,budget:config.budget};
  }
  return {createTools,clone,stable,hash,clock};
});
