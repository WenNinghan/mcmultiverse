/* 只分析一份餐品替换的真实后果；全部因果继续由各局生产引擎决定。 */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.McReplayGuide=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const LIMIT=20;
  const FIELDS={
    morning:[['elapsed','耗时','minutes'],['wallet','余钱','money'],['satiety','饱腹'],['relationship','关系']],
    midnight:[['elapsed','耗时','minutes'],['wallet','余钱','money'],['energy','精力'],['quality','质量'],['errors','已知错误','count'],['strain','烦躁']],
    friend:[['elapsed','耗时','minutes'],['wallet','余钱','money'],['ownSatiety','你饱腹'],['friendSatiety','TA饱腹'],['trust','信任']]
  };
  const money=n=>'¥'+(n/100).toFixed(2);
  function sceneOf(engine,run,comparison){
    const id=engine?.meta?.id||run?.scenario;
    if(id==='midnight'||id==='friend')return id;
    const r=comparison?.alternate?.resources||comparison?.original?.resources||{};
    return 'ownSatiety' in r?'friend':'energy' in r?'midnight':'morning';
  }
  function fieldsOf(engine,run,comparison){return FIELDS[sceneOf(engine,run,comparison)];}
  function endingName(result){return result.ending?.name||'未完成';}
  function quotedDifference(original,alternate){
    const a=original.quote?.finalCents,b=alternate.quote?.finalCents;
    return Number.isSafeInteger(a)&&Number.isSafeInteger(b)?'订单实付'+money(a)+' → '+money(b):'';
  }
  function changedFields(engine,run,comparison){
    const a=comparison.original.resources,b=comparison.alternate.resources;
    return fieldsOf(engine,run,comparison).filter(([key])=>Number.isFinite(a?.[key])&&Number.isFinite(b?.[key])&&a[key]!==b[key]);
  }
  function fieldDifference(field,original,alternate){
    const [key,label,type]=field,a=original.resources[key],b=alternate.resources[key];
    if(type==='money')return label+money(a)+' → '+money(b);
    if(type==='minutes')return label+a+' → '+b+'分钟（'+(b>a?'多':'少')+Math.abs(b-a)+'分钟）';
    return label+a+' → '+b+(type==='count'?'处':'');
  }
  function describe(engine,run,comparison){
    if(!comparison?.original||!comparison?.alternate)throw Error('缺少两条可比较的时间线。');
    const {original,alternate}=comparison,quoted=quotedDifference(original,alternate);
    if(alternate.blocked)return '新时间线在原定计划中出现断点：'+(alternate.reason||'当前订单或行动无法完成。')+(quoted?' '+quoted+'。':'');
    if(original.blocked){
      const r=alternate.resources,final=[];
      if(Number.isFinite(r.elapsed))final.push('完成时耗时'+r.elapsed+'分钟');
      if(Number.isSafeInteger(r.wallet))final.push('余钱'+money(r.wallet));
      return '原计划存在断点；替换后可以完成「'+endingName(alternate)+'」。'+[quoted,...final].filter(Boolean).join('；')+'。';
    }
    const differences=changedFields(engine,run,comparison).map(field=>fieldDifference(field,original,alternate));
    const endingChanged=original.ending?.id!==alternate.ending?.id;
    if(!differences.length&&!endingChanged)return '餐品换了，结局和各项游戏资源保持相同。';
    const prefix=endingChanged?'「'+endingName(original)+'」 → 「'+endingName(alternate)+'」':'结局仍是「'+endingName(alternate)+'」';
    return prefix+(differences.length?'；'+differences.join('；'):'；游戏资源保持相同')+'。';
  }
  function questionFor(engine,run,candidate){
    const {from,to,comparison}=candidate,{original:a,alternate:b}=comparison;
    const start='只把一份'+from+'换成'+to+'，';
    if(b.blocked)return start+'原来的计划会卡在哪里？';
    if(a.blocked)return start+'原来卡住的计划能走完吗？';
    const scene=sceneOf(engine,run,comparison),ar=a.resources,br=b.resources;
    if(scene==='morning'&&a.onTime!==b.onTime)return start+'还能赶上08:00吗？';
    if(scene==='midnight'&&ar.errors!==br.errors)return start+'同样的收尾，会多留还是少留错误？';
    if(scene==='friend'&&ar.trust!==br.trust)return start+'TA的回应会不会不同？';
    if(scene==='friend'&&(ar.ownSatiety!==br.ownSatiety||ar.friendSatiety!==br.friendSatiety))return start+'两个人还能吃够吗？';
    if(scene==='morning'&&ar.relationship!==br.relationship)return start+'同样分餐，朋友还会满足吗？';
    if(a.ending?.id!==b.ending?.id)return start+'会走到哪一个结局？';
    if(ar.elapsed!==br.elapsed)return start+'同样的后续选择，会多花还是少花时间？';
    if(ar.wallet!==br.wallet)return start+'最后会剩下多少钱？';
    return start+'后面的结果真的会改变吗？';
  }
  function analyze(engine,run){
    if(!engine||typeof engine.catalog!=='function'||typeof engine.compare!=='function'||!run||!run.cart)throw Error('候选分析需要已有的情景引擎和订单。');
    const catalog=engine.catalog(run),candidates=[],blocked=[];let total=0;
    for(const source of catalog){
      if(!run.cart[source.name])continue;
      for(const target of catalog){
        if(source.name===target.name)continue;
        if(total>=LIMIT)break;
        const comparison=engine.compare(run,{from:source.name,to:target.name});
        const completed=!comparison.alternate.blocked&&!!comparison.alternate.ending;
        const differentEnding=comparison.original.blocked||comparison.original.ending?.id!==comparison.alternate.ending?.id;
        const differentResources=changedFields(engine,run,comparison).length>0;
        const kind=!completed?'blocked':differentEnding?'ending':differentResources?'resources':'same';
        const candidate={from:source.name,to:target.name,comparison,kind,question:'',buttonLabel:'试试这份替换 ↗',summary:describe(engine,run,comparison)};
        candidate.question=questionFor(engine,run,candidate);
        (completed?candidates:blocked).push(candidate);total++;
      }
    }
    const rank={ending:0,resources:1,same:2};
    candidates.sort((a,b)=>rank[a.kind]-rank[b.kind]);
    const best=candidates[0]||null;
    if(!best)return {best:null,candidates,blocked,total,headline:total?'只改单，暂时维持不了原计划':'这张订单没有可替换的一份',detail:total?'已核算'+total+'种单份替换，都会出现订单或行动断点。可以手动查看断点，或返回点单重新决定后续计划。':'先点一份本局餐品，再看看只换这一份会发生什么。'};
    const headline=best.comparison.original.blocked?'只改一份，原计划就能继续':best.kind==='ending'?'这一份，会把你带进另一个结局':best.kind==='resources'?'结局一样，代价可以不同':'换个口味，看看哪些事没有改变';
    return {best,candidates,blocked,total,headline,detail:best.summary};
  }
  return {analyze,describe};
});
