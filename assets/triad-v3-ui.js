import {createSession,choose,getOriginalIds,setOriginalQuote,replaceSide,getReplacementIds,setComparison,buildVerdict,money,setEstimate} from './triad-core.mjs';
import {comparisonCopy,reasonOptions,syncReasonDraft,chooseReason,handwriteReason,verdictPresentation,estimateFeedback,replayGoal} from './triad-experience.mjs';
import {createQuoteCoordinator} from './triad-flow.mjs';
import {renderVerdictPng,buildShareText} from './triad-share.mjs';

const app=document.querySelector('#app');
const rail=document.querySelector('#rail');
const storeDialog=document.querySelector('#storeDialog');
const evidenceDialog=document.querySelector('#evidenceDialog');
let session=null,view='home',round='main',busy=false,failure='',health=null,verdict=null;
let decision=null,reasonDraft=null,reasonEditing=false,handwriteNotice=false;
let guessText='',estimateFrozen=false,previewSideId=null,swapMotion=null;
let stores=[],operation=0,roundNumber=1,replayInfo=null;
const seenByStore=new Map();
let quoting=false,lastVerdict=null,roundChallenge=null,revealFresh=false;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=value=>new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const motionBehavior=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
const allItems=()=>session?[...session.context.mainOptions,...session.context.sideOptions,session.context.drink]:[];
const item=id=>allItems().find(x=>x.id===id);
const imageUrl=x=>x.image.startsWith('https://')&&session?`/api/menu-image/${encodeURIComponent(session.context.sessionId)}/${encodeURIComponent(x.id)}`:x.image;
const picture=(x,cls='',decorative=false)=>`<img src="${esc(imageUrl(x))}" alt="${decorative?'':esc(x.name)}" class="${cls}" decoding="async">`;
const originalItems=()=>getOriginalIds(session).map(item);
const feeLabels={deliveryCents:'配送费',packingCents:'打包费',tablewareCents:'餐具费'};
const feeNote=q=>Object.entries(feeLabels).filter(([k])=>q.fees?.[k]>0).map(([k,label])=>`${label} ${money(q.fees[k])}`).join('、');
const HALLS=[{key:'oracle',no:'01',name:'神谕阁',tag:'先盲选'},{key:'court',no:'02',name:'审判庭',tag:'再揭价'},{key:'rebirth',no:'03',name:'轮回司',tag:'只换一份'},{key:'verdict',no:'04',name:'判决书',tag:'盖完章'}];
function hallState(key){
  if(!session)return {state:'待连接',tone:'idle'};
  if(key==='oracle'){
    if(session.originalQuote)return {state:'盲选已封存',tone:'done'};
    if(session.selection.mainId)return {state:'该选配餐',tone:'live'};
    return {state:'可以开始',tone:'live'};
  }
  if(key==='court'){
    if(!session.selection.sideId)return {state:'还差：选两份',tone:'idle'};
    return session.originalQuote?{state:'已揭价',tone:'done'}:{state:'可以揭价',tone:'live'};
  }
  if(key==='rebirth'){
    if(!session.selection.sideId)return {state:'还差：选两份',tone:'idle'};
    if(!session.originalQuote)return {state:'还差：先揭价',tone:'idle'};
    if(verdict)return {state:'已盖章',tone:'done'};
    return session.comparison?{state:'两盘已查好',tone:'live'}:{state:'可以试换',tone:'live'};
  }
  if(!verdict)return {state:'还没盖章',tone:'idle'};
  return {state:verdict.decision==='keep'?'选了 A 原盘':'选了 B 新盘',tone:'done'};
}
function renderRail(){
  if(!rail)return;
  const active=view==='verdict'?'verdict':view,store=session?.context.store;
  rail.innerHTML=`<div class="rail-head"><span class="eyebrow">WORKBENCH / 玩法</span><button class="rail-home ${view==='home'?'active':''}" data-action="home"><b aria-hidden="true">⌂</b><span>工作台首页</span></button></div><nav class="rail-list" aria-label="三殿与判决书">${HALLS.map(h=>{const s=hallState(h.key);return `<button class="rail-item ${active===h.key?'active':''} tone-${s.tone}" data-action="enter" data-view="${h.key}" ${active===h.key?'aria-current="page"':''}><i class="rail-no">${h.no}</i><span class="rail-name">${h.name}<small>${h.tag}</small></span><em class="rail-state">${esc(s.state)}</em></button>`;}).join('')}</nav><div class="rail-foot"><p class="rail-store"><b>当前门店</b>${store?esc(store.name):'正在连接真实门店…'}</p><button class="rail-mini" data-action="open-store">换一间餐厅</button><button class="rail-mini" data-action="evidence">这次 MCP 调用</button><p class="rail-tip">三殿随时可跳。缺前置条件时，殿内会告诉你差哪一步。</p></div>`;
}
function gate(kicker,title,text,target,label){
  return `<div class="hall-gate"><span class="eyebrow">${esc(kicker)}</span><h2>${esc(title)}</h2><p>${esc(text)}</p><button class="primary-button" data-action="enter" data-view="${target}">${esc(label)}</button></div>`;
}
let toastTimer;
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3700);}

async function api(path,data){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);
  try{
    const response=await fetch(path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined,signal:controller.signal});
    const body=await response.json();
    if(!response.ok)throw new Error(body.error?.message||body.message||`HTTP ${response.status}`);
    return body;
  }catch(error){
    if(error.name==='AbortError')throw new Error('查询超时，选择已保留，请重试。');
    if(error instanceof TypeError)throw new Error(`查询失败，选择已保留。原始错误：${error.message}`);
    throw error;
  }finally{clearTimeout(timer);}
}
function updateStore(){const el=document.querySelector('#storeButton');el.classList.toggle('ready',!!session);el.querySelector('span').textContent=session?`试玩 · ${session.context.store.name}`:health?.connected?'正在准备餐品':failure?'MCP 查询待重试':'正在连接 MCP';}
function nav(active){return `<div class="stage-nav"><button class="back-button" data-action="home">‹ 回三殿</button><nav class="step-nav" aria-label="三殿进度">${[['oracle','01 神谕阁'],['court','02 审判庭'],['rebirth','03 轮回司']].map(([key,label])=>`<button data-action="enter" data-view="${key}" class="${active===key?'active':''}" ${active===key?'aria-current="step"':''}>${label}</button>`).join('')}</nav></div>`;}
function heading(kicker,title,sub){return `<div class="stage-heading"><span class="eyebrow">${kicker}</span><h1 tabindex="-1">${title}</h1><p>${sub}</p></div>`;}
function fixedStrip(){const x=originalItems();return `<div class="fixed-strip"><span>${picture(x[0])}${esc(x[0].name)}</span><span>${picture(x[2])}${esc(x[2].name)}</span><b>两盘都保留 · 各 1 份</b></div>`;}
function mealTray(items,{swappable=false}={}){
  const selected=swappable&&session.replacementSideId?item(session.replacementSideId):items[1];
  const animation=swappable?swapMotion:null;
  return `<div class="meal-tray ${swappable?'swap-tray':''}" ${swappable?'id="swapTarget" aria-label="把一份新配餐放进餐盘"':''}><span class="tray-tag">${swappable?'ONE ITEM ONLY / 只动配餐':'YOUR FIRST CHOICE / 你的盲选餐盘'}</span><div class="tray-liner"></div><div class="tray-products">${picture(items[0],'main')}${picture(items[2],'drink')}${animation?picture(item(animation.from),'side side-out',true):''}${picture(selected,`side ${animation?'side-in':''}`)}</div>${swappable?`<div class="tray-bottom-label">${session.replacementSideId?`已放入 ${esc(selected.name)} <small>替换 ${esc(items[1].name)}</small>`:`原配餐：${esc(items[1].name)} <small>点选或拖入右侧候选后才会替换</small>`}</div>`:''}</div>`;
}
function home(){
  const main=session?.context.mainOptions[0]||{image:'assets/menu/巨无霸.png',name:'主食素材'};
  const sides=session?.context.sideOptions||[{image:'assets/menu/薯条.png',name:'配餐素材'},{image:'assets/menu/玉米杯.png',name:'配餐素材'}];
  const courtReady=!!session?.selection.sideId,rebirthReady=!!session?.originalQuote;
  return '<section class="home home-v2 home-v3"><div class="hero"><div class="hero-copy"><span class="eyebrow">McMULTIVERSE / THE TASTE IS YOURS</span><h1>这一口，<br><em>我判了。</em></h1><p class="hero-promise">先凭食欲选，再揭开真实价格。<br><b>只换一份配餐，你会改主意吗？</b></p><p class="hero-rule">主食与配餐各选一份，另配固定饮品。<br>比较三份单点总价。</p></div><div class="hero-art" role="img" aria-label="餐盘、黄色判章和小票的艺术静物"></div><div class="hero-note">先凭食欲<br>后看价格</div></div><div class="hall-heading"><span>神谕阁 → 审判庭 → 轮回司</span><small>选一盘 · 翻价签 · 给偏爱盖章 · 左侧切换栏随时跳</small></div><div class="temples"><button class="temple-card oracle entry-start" data-action="enter" data-view="oracle"><span class="card-top">神谕阁 <i class="card-number">01</i></span><h2>先盲选。</h2><p class="caption">主食、配餐，各选一份。</p><div class="card-scene" aria-hidden="true">'+picture(main,'',true)+picture(sides[0],'',true)+'</div><span class="card-end"><span class="start-pill">'+(session?.originalQuote?'回看本局盲选':'从这里开始')+'</span><span class="arrow-circle">↗</span></span></button><button class="temple-card court" data-action="enter" data-view="court" data-locked="'+!courtReady+'"><span class="card-top">审判庭 <i class="card-number">02</i></span><h2>再揭价。</h2><p class="caption">猜个价，或直接翻开。</p><div class="card-scene" aria-hidden="true"><div class="price-prop"><span>THE PRICE</span><b>¥ ? . ?</b></div><div class="mini-stamp">有据</div></div><span class="card-end"><span>'+(courtReady?'选好了 · 去揭价':'还差两份 · 也能进')+'</span><span class="arrow-circle">'+(courtReady?'↗':'·')+'</span></span></button><button class="temple-card rebirth" data-action="enter" data-view="rebirth" data-locked="'+!rebirthReady+'"><span class="card-top">轮回司 <i class="card-number">03</i></span><h2>只换一份。</h2><p class="caption">换配餐、比价格，再站队。</p><div class="card-scene" aria-hidden="true">'+picture(sides[0],'',true)+'<span class="swap-prop">↝</span>'+picture(sides.at(-1),'',true)+'</div><span class="card-end"><span>'+(rebirthReady?'揭价了 · 去试换':'还差揭价 · 也能进')+'</span><span class="arrow-circle">'+(rebirthReady?'↗':'·')+'</span></span></button></div><div class="home-bottom"><p>'+(session?'本局固定 '+esc(session.context.drink.name)+' · 到店取餐 · 同门店各一份':'正在取回真实菜单，马上就能开始。')+'</p>'+(session?.selection.sideId?'<button class="resume-button" data-action="continue">接着刚才那一盘 →</button>':'')+'</div>'+(failure?'<div class="inline-error">'+esc(failure)+' <button class="resume-button" data-action="retry-init">重新连接</button></div>':'')+'</section>';
}
function waiting(){return `<div class="loading-panel"><div class="spinner" aria-hidden="true"></div><h2>下一对餐品，马上就位。</h2><p>正在查询真实可售菜单和默认规格。<br>你的上一局会保留到新菜单成功返回。</p></div>`;}
function oracle(){
  if(!session)return waiting();
  if(session.originalQuote)return `${heading('01 / BLIND CHOICE SAVED','这盘偏爱，已经记下。','本局盲选已封存。回看不会改变餐品、估价或手写判词。')}<div class="oracle-recap">${mealTray(originalItems())}<p>${originalItems().map(x=>esc(x.name)).join(' ＋ ')}</p><div class="button-row"><button class="primary-button" data-action="enter" data-view="court">回到这盘报价 →</button><button class="secondary-button" data-action="new-round">换一对新餐品，再玩</button></div></div>`;
  const options=(round==='main'?session.context.mainOptions:session.context.sideOptions).slice(0,2);
  const fresh=roundNumber>1?`<p class="new-round-note">第 ${roundNumber} 局 · ${replayInfo?.exhausted?'当前门店的可核验餐品已轮过，可以换门店发现新餐品。':`这轮新出现 ${replayInfo?.mainFreshCount??0} 份主食、${replayInfo?.sideFreshCount??0} 份配餐候选。`}</p>`:'';
  return `${heading('01 / THE ORACLE',round==='main'?'第一眼，站哪边？':'再加一份，选谁？',round==='main'?'点你现在更想吃的主食。价格先盖着。':'主食留好了。选一份配餐，去翻价签。')}${roundChallenge?'<div class="round-challenge"><b>'+esc(roundChallenge.title)+'</b><p>'+esc(roundChallenge.detail)+'</p></div>':''}${fresh}<div class="round-counter-wrap"><div class="round-counter">${round==='main'?'1':'2'} / 2 <i class="done"></i><i class="${round==='side'?'done':''}"></i></div></div><div class="blind-options">${options.map((x,i)=>`<button class="food-option" data-action="pick" data-kind="${round}" data-id="${esc(x.id)}"><span class="option-letter">${i?'B':'A'}</span><div class="plate">${picture(x)}</div><div class="food-label"><div><h2>${esc(x.name)}</h2><small>${x.customized?'【可特调】本局用默认搭配':'每份一件 · 默认规格'}</small></div><span class="choose-mark" aria-hidden="true">↗</span></div></button>`).join('')}</div>${round==='side'?`<div class="picked-strip">${picture(item(session.selection.mainId))}<span>已留下 ${esc(item(session.selection.mainId).name)}</span><button data-action="reselect">重选主食</button></div>`:''}<p class="blind-footer">固定另配一份 <b>${esc(session.context.drink.name)}</b>，两盘都不动它。<br>${esc(session.context.store.name)} · 当前可售单品 · 图片作示意，规格以名称为准。</p>`;
}
function estimateControls(){
  if(estimateFrozen)return '<div class="estimate-frozen">'+(session.estimateCents===null?'已跳过估价':'猜价已封存：'+money(session.estimateCents))+' · 重试不改猜价</div>';
  return '<div class="estimate-controls"><label for="guessPrice">凭直觉，这盘多少钱？ <small>可跳过</small></label><div class="guess-input"><span aria-hidden="true">¥</span><input id="guessPrice" inputmode="decimal" maxlength="8" value="'+esc(guessText)+'" placeholder="输入你心里的整盘总价" aria-label="估计三份单点总价，可跳过"></div></div>';
}
function estimateResult(){
  const feedback=estimateFeedback({guessCents:session.estimateCents,actualCents:session.originalQuote.totalCents});
  return '<div class="estimate-result reveal-feedback '+(revealFresh?'just-revealed':'')+'" role="status"><b>'+esc(feedback.title)+'</b><span>'+esc(feedback.detail)+'</span></div>';
}
function quoteLines(q){return getOriginalIds(session).map(id=>{const row=q.items.find(x=>x.id===id);return `<div class="price-line"><span>${esc(item(id).name)}${item(id).customized?'【可特调】':''} × 1</span><span>${row?.subtotalCents!==undefined?money(row.subtotalCents):'已计入总额'}</span></div>`;}).join('')+Object.entries(feeLabels).filter(([k])=>q.fees?.[k]>0).map(([k,label])=>`<div class="price-line"><span>${label}</span><span>${money(q.fees[k])}</span></div>`).join('');}
function court(){
  if(!session)return waiting();
  if(!session.selection.sideId)return heading('02 / THE REVEAL','审判庭在等一盘餐。','价格要落在具体的餐品上，先回神谕阁挑两份。')+gate('还差一步','没有餐盘，就没有价签。','审判庭负责翻开真实报价。去神谕阁选一份主食、一份配餐，回来立刻能揭价。','oracle','去神谕阁选两份 →');
  const q=session.originalQuote;
  return heading('02 / THE REVEAL',q?'价格揭晓，直觉接招。':'这盘，你猜多少钱？','主食＋配餐＋固定饮品，三份单点。')+'<div class="tray-layout">'+mealTray(originalItems())+'<div class="ticket"><span class="eyebrow">THE PRICE / 三份单点整盘总价</span>'+(!q?estimateControls()+'<button class="price-mask" data-action="reveal" '+(busy?'disabled':'')+'><span>'+(busy?'正在揭开真实价格…':'翻开真实价格')+'</span><b aria-hidden="true">↻</b></button>'+(!estimateFrozen?'<button class="skip-guess" data-action="skip-reveal">跳过估价，直接揭价 →</button>':'')+'<p class="source-note">所选门店 · 到店取餐 · 默认规格</p>':'<div class="price-block '+(revealFresh?'just-revealed':'')+'"><small>真实整盘总价</small><strong><i>¥</i>'+(q.totalCents/100).toFixed(2)+'</strong></div>'+estimateResult()+'<button class="primary-button next-swap" data-action="try-swap">试换一份，看差价 <span aria-hidden="true">↗</span></button><p class="next-hint">主食和饮品留着，最后再选 A 或 B。</p><details class="fact-details"><summary>餐品明细与真实报价依据</summary>'+quoteLines(q)+'<p>'+esc(session.context.store.name)+' · '+esc(time(q.quotedAt))+'<br>MCP / calculate-price · 默认规格 · 未使用私人券 · 历史报价，非订单。</p></details>')+'</div></div>'+(failure?'<div class="inline-error">'+esc(failure)+' <button class="resume-button" data-action="reveal">保留选择，重试算价</button></div>':'');
}
function decisionDetails(){return {decision,originalSide:item(session.selection.sideId).name,replacementSide:item(session.replacementSideId).name,deltaCents:session.comparison.deltaCents};}
function syncDraft(){if(decision&&reasonDraft?.kind!=='handwritten')reasonDraft=syncReasonDraft(reasonDraft,decisionDetails());}
function choiceCard(items,q,key,{selected=false,final=false}={}){
  const tag=final?'div':'button',action=final?'':`data-action="select-plate" data-decision="${key==='A'?'keep':'swap'}" aria-pressed="${selected}"`;
  return `<${tag} class="plate-choice ${selected?'selected':''} ${final?'final-plate':''}" data-plate="${key}" data-chosen="${selected}" ${action}><div class="choice-top"><span>${key} / ${key==='A'?'原来那盘':'换一份的新盘'}</span><b>${selected?(final?'✓ 我的选择':'✓ 我选这一盘'):(final?'另一种选择':'点选这一盘')}</b></div><div class="choice-food">${picture(items[1])}<small>${key==='A'?'原配餐':'仅此份变化'}</small></div><h3>${esc(items[1].name)}</h3><strong class="choice-total">${money(q.totalCents)}<small>三份单点 · 整盘总价</small></strong>${feeNote(q)?`<p class="choice-fee">含${esc(feeNote(q))}</p>`:''}</${tag}>`;
}
function compareView(){
  const c=session.comparison,original=originalItems(),replacement=getReplacementIds(session).map(item);
  return `<div class="comparison"><div class="comparison-heading"><span class="eyebrow">ONLY ONE CHANGE / 一份变化，两种答案</span><h2>${esc(comparisonCopy(c.deltaCents))}</h2><p>${esc(original[1].name)} → ${esc(replacement[1].name)} · 先选一盘，再给它盖章</p></div><div class="choice-grid">${choiceCard(original,c.originalRefresh,'A',{selected:decision==='keep'})}${choiceCard(replacement,c.newQuote,'B',{selected:decision==='swap'})}</div>${fixedStrip()}${c.baselineChangedCents?`<p class="market-note">原盘自首次揭价${c.baselineChangedCents>0?'上涨':'下降'}了 ${money(Math.abs(c.baselineChangedCents))}；上面的B对A差额采用刚重新查询的原盘，不把时价变化算作改单收益。</p>`:''}<details class="compare-evidence"><summary>两盘查询时间与口径</summary><p>${esc(time(c.originalRefresh.quotedAt))} / ${esc(time(c.newQuote.quotedAt))} · 同门店、到店取餐、各一份、不用私人券。两次独立报价，价格可能随时段变化。</p></details></div>`;
}
function reasonWorkbench(){
  if(!decision)return '<div class="final-workbench choose-first"><h2>这两盘，你站哪边？</h2><p>点选 A 或 B 后，才会生成你的判词。</p>'+(reasonDraft?.kind==='handwritten'?'<p class="handwritten-note">你的手写判词仍原样保留，选好后可继续编辑。</p>':'')+'</div>';
  syncDraft();const handwritten=reasonDraft?.kind==='handwritten';
  return `<div class="final-workbench"><span class="reason-label">${decision==='keep'?'给 A 原盘':'给 B 新盘'}，一句判词。</span><p class="reason-preview" id="reasonPreview">${esc(reasonDraft.text)}</p><button class="edit-reason" data-action="edit-reason">${reasonEditing?'收起编辑':'自己写一句 ✎'}</button><p class="handwritten-note ${handwritten?'':'hidden'}">手写判词已保留。${handwriteNotice?'你刚改了选择，请自行确认文字是否仍合适。':''}</p><div class="reason-editor ${reasonEditing?'':'hidden'}"><label for="myReason">你的原文会保留，改判也不会自动改写。</label><input id="myReason" class="custom-reason" maxlength="80" value="${esc(reasonDraft.text)}" aria-label="我的手写判词，最多80字"></div><details class="reason-suggestions"><summary>${handwritten?'主动换成一条推荐判词':'看看其他推荐判词'}</summary>${handwritten?'<p>点击下面的推荐句，会替换你当前的手写文字。</p>':''}<div class="reason-options">${reasonOptions(decisionDetails()).map((x,i)=>`<button class="reason-chip" data-action="reason" data-index="${i}">${esc(x)}</button>`).join('')}</div></details><button class="primary-button stamp-button" data-action="stamp"><span class="stamp-button-symbol" aria-hidden="true">判</span>给 ${decision==='keep'?'A 原盘':'B 新盘'} 盖章 <span aria-hidden="true">↓</span></button></div>`;
}
function rebirth(){
  if(!session)return waiting();
  if(!session.selection.sideId)return heading('03 / THE REWRITE','轮回司在等你的第一盘。','要换一份，总得先有一份可以换。')+gate('还差一步','先有原盘，才谈得上改判。','回神谕阁选一份主食和一份配餐，再来这里换掉其中一份。','oracle','去神谕阁选两份 →');
  if(!session.originalQuote)return heading('03 / THE REWRITE','先知道原价，才算得出差价。','换一份之后贵了多少，得先有原盘价格做参照。')+gate('还差一步','原盘价格还没揭开。','回审判庭翻开真实报价，再回来试换配餐。','court','去审判庭揭价 →');
  const original=originalItems(),hasSwap=!!session.replacementSideId;
  return heading('03 / THE REWRITE','放入一份，再选你的答案。','只换配餐。放入后自动查价，A 或 B 由你决定。')+'<div class="swap-workbench"><div><p class="swap-label">'+(hasSwap?'你亲手换过的餐盘':'原盘留在这里，等你试换')+'</p>'+mealTray(original,{swappable:true})+'</div><aside class="candidate-panel"><p class="swap-label">'+(hasSwap?'还可以试另一份':'选一份放进餐盘')+'</p><div class="candidate-list">'+session.context.sideOptions.filter(x=>x.id!==session.selection.sideId).map(x=>'<button class="candidate '+(x.id===session.replacementSideId?'selected':'')+' '+(!hasSwap&&x.id===previewSideId?'recommended':'')+'" data-action="swap-side" data-id="'+esc(x.id)+'" draggable="true" aria-pressed="'+(x.id===session.replacementSideId)+'" '+(busy?'disabled':'')+'>'+picture(x)+'<span>'+esc(x.name)+'</span><small>'+(x.id===session.replacementSideId?'✓ 已入盘':!hasSwap&&x.id===previewSideId?'推荐 · 点我试换':'点选或拖入')+'</small></button>').join('')+'</div><div class="auto-quote-status" role="status">'+(quoting?'<span class="mini-spinner" aria-hidden="true"></span>正在查询这两盘的真实价格…':session.comparison?'✓ 两盘已查好，往下选 A 或 B。':hasSwap?'已换入；报价待重试。':'放入一份，即会自动查价。')+'</div><p class="candidate-hint">A 原盘一直保留，最后仍可以选回来。</p></aside></div>'+(failure?'<div class="inline-error">'+esc(failure)+' <button class="resume-button" data-action="compare">保留配餐，重试查价</button></div>':'')+(session.comparison?compareView()+reasonWorkbench():'');
}
function verdictGate(){
  if(!session)return waiting();
  return heading('04 / THE VERDICT','判决书还没盖章。','偏爱要先站队，判词才会生成。')+gate('还差一步','先在轮回司选 A 或 B。','两盘查好价之后，选一盘、写一句判词，盖章完毕这里就是你的判决书。','rebirth','回轮回司选一盘 →');
}
function verdictView(){
  const v=verdict,m=verdictPresentation(v),chosen=v.decision==='keep'?v.original:v.replacement,goal=replayGoal(v);
  return '<section class="verdict-reward"><div class="reward-top"><span class="eyebrow">MY TASTE, MY VERDICT / 我的这一口</span><span class="reward-stamp">'+(v.decision==='keep'?'偏爱成立':'改判成立')+'</span></div><h1 tabindex="-1">'+esc(m.attitude)+'</h1><div class="reward-choice">'+picture(chosen.items[1])+'<div><span>我选 '+m.chosen+' · '+(v.decision==='keep'?'保留原盘':'换成新盘')+'</span><h2>'+esc(chosen.items[1].name)+'</h2><strong>'+money(chosen.quote.totalCents)+'</strong><small>三份单点 · 整盘总价</small></div></div><blockquote class="reward-reason">'+esc(v.reason)+'</blockquote><p class="reward-question">'+esc(m.question)+'</p><div class="result-actions"><button class="primary-button" data-action="download">分享高清判决 ↓</button><button class="secondary-button" data-action="new-round">再判一盘 ↗</button></div><div class="replay-goal"><b>'+esc(goal.title)+'</b><p>'+esc(goal.detail)+'</p><button class="resume-button" data-action="new-round">'+esc(goal.button)+' →</button></div><div class="reward-secondary"><button class="back-button" data-action="copy">复制分享文字</button><button class="back-button" data-action="back-swap">我再想想这一盘</button></div></section><details class="verdict-evidence"><summary>展开完整 A/B 判决与真实报价依据</summary><div class="verdict-sheet verdict-v2"><p class="verdict-direction">'+esc(m.direction)+'</p><div class="choice-grid">'+choiceCard(v.original.items,v.original.quote,'A',{selected:v.decision==='keep',final:true})+choiceCard(v.replacement.items,v.replacement.quote,'B',{selected:v.decision==='swap',final:true})+'</div>'+fixedStrip()+(m.estimateNote?'<p class="verdict-estimate">'+esc(m.estimateNote)+'</p>':'')+'<p class="verdict-foot">'+esc(v.store.name)+' · 到店取餐 · 未使用私人券<br>'+esc(time(v.original.quote.quotedAt))+' / '+esc(time(v.replacement.quote.quotedAt))+' · MCP 官方查询'+(v.baseline.changedCents?'<br>原盘时价另有 '+money(v.baseline.changedCents)+' 变化，已与改单差额分开。':'')+'<br>历史查询记录，非订单；实际价格、库存以点餐时为准。<br>非官方创意作品 · 餐品图版权归各权利人</p></div></details>';
}
let loadingRound=false;
function render(focus=false){
  updateStore();renderRail();
  const content=view==='home'?'':loadingRound?waiting():view==='oracle'?oracle():view==='court'?court():view==='rebirth'?rebirth():view==='verdict'&&!verdict?verdictGate():verdictView();
  app.innerHTML=view==='home'?home():`<section class="stage stage-v2 stage-v3 ${view==='verdict'?'result-stage':''}">${nav(view==='verdict'?'rebirth':view)}${view==='verdict'&&failure?`<div class="inline-error">${esc(failure)}</div>`:''}${content}</section>`;
  swapMotion=null;revealFresh=false;bindDrag();
  if(focus){window.scrollTo({top:0,behavior:'instant'});app.querySelector('h1')?.focus({preventScroll:true});}
}
function enter(next){
  if(busy)return;
  failure='';
  if(!session){toast('真实菜单还在准备，连接完成后就能开始。');return;}
  view=next;
  if(next==='oracle'&&!session.originalQuote)round=session.selection.mainId?'side':'main';
  if(next==='rebirth'&&!previewSideId&&session.selection.sideId)previewSideId=(session.context.sideOptions.find(x=>x.id!==session.selection.sideId)||{}).id||null;
  render(true);
}
function parseGuess(raw){
  const value=raw.trim().replace(/^[¥￥]\s*/, '');
  if(!value)return null;
  if(!/^\d{1,4}(?:\.\d{1,2})?$/.test(value))throw new Error('估价请填金额，最多两位小数；也可以直接跳过。');
  const [whole,fraction='']=value.split('.'),cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(cents>100000)throw new Error('这局估价范围为 ¥0–¥1000；也可以跳过。');
  return cents;
}
async function reveal({skip=false}={}){
  if(busy||!session?.selection.sideId)return;
  if(session.originalQuote){render();return;}
  try{if(!estimateFrozen){session=setEstimate(session,skip?null:parseGuess(guessText));estimateFrozen=true;}}catch(error){toast(error.message);document.querySelector('#guessPrice')?.focus();return;}
  busy=true;failure='';render();const current=session;
  try{const q=await api('/api/quote',{sessionId:current.context.sessionId,itemIds:getOriginalIds(current)});if(session===current){session=setOriginalQuote(current,q);revealFresh=true;}}
  catch(error){failure=error.message;}
  finally{busy=false;render();if(session.originalQuote&&view==='court'&&innerWidth<=620)document.querySelector('.price-block')?.scrollIntoView({block:'start',behavior:motionBehavior()});}
}
const quoteFlow=createQuoteCoordinator({
  quote:body=>api('/api/quote',body),
  onStart(){quoting=true;failure='';render();},
  onResult(next,snapshot){if(session===snapshot){session=next;syncDraft();}},
  onError(error,snapshot){if(session===snapshot)failure=error.message;},
  onSettled(){quoting=false;render();if(session.comparison&&view==='rebirth')document.querySelector('.comparison')?.scrollIntoView({block:'start',behavior:motionBehavior()});}
});
async function compare(){if(busy||!session?.replacementSideId)return;await quoteFlow.run(session);}
function swap(id){
  if(busy||id===session.replacementSideId)return;
  const from=session.replacementSideId||session.selection.sideId;
  session=replaceSide(session,id);swapMotion={from,to:id};decision=null;verdict=null;
  if(reasonDraft?.kind==='handwritten')handwriteNotice=true;
  failure='';void quoteFlow.run(session);toast('已放入'+item(id).name+'，正在查两盘价格。');
}
function selectPlate(next){
  if(quoting||!session.comparison)return;
  if(next!==decision&&reasonDraft?.kind==='handwritten')handwriteNotice=true;
  decision=next;syncDraft();render();
}
function bindDrag(){
  const target=document.querySelector('#swapTarget');if(!target)return;
  app.querySelectorAll('[draggable]').forEach(el=>el.addEventListener('dragstart',event=>{if(busy){event.preventDefault();return;}event.dataTransfer.setData('text/plain',el.dataset.id);event.dataTransfer.effectAllowed='copy';}));
  target.addEventListener('dragover',event=>{if(busy)return;event.preventDefault();target.classList.add('drag-over');event.dataTransfer.dropEffect='copy';});
  target.addEventListener('dragleave',()=>target.classList.remove('drag-over'));
  target.addEventListener('drop',event=>{event.preventDefault();target.classList.remove('drag-over');const id=event.dataTransfer.getData('text/plain');if(session.context.sideOptions.some(x=>x.id===id)&&id!==session.selection.sideId)swap(id);});
}
function recordSeen(context){
  const seen=seenByStore.get(context.store.code)||{mains:[],sides:[]};
  seen.mains=[...new Set([...seen.mains,...context.mainOptions.map(x=>x.id)])].slice(-60);
  seen.sides=[...new Set([...seen.sides,...context.sideOptions.map(x=>x.id)])].slice(-60);
  seenByStore.set(context.store.code,seen);
}
async function useStore(store,{newRound=false}={}){
  quoteFlow.cancel();quoting=false;
  const turn=++operation;busy=true;failure='';
  document.querySelector('#storeStatus').textContent='正在核验真实菜单、独立单品和默认规格…';
  try{
    const seen=seenByStore.get(store.code)||{mains:[],sides:[]};
    const c=await api('/api/context',{storeCode:store.code,...(newRound?{excludeMainIds:seen.mains,excludeSideIds:seen.sides}:{})});
    if(turn!==operation)return false;
    const next=createSession(c);
    if(!newRound)seenByStore.delete(c.store.code);
    session=next;recordSeen(c);replayInfo=c.replay;roundNumber=newRound?roundNumber+1:1;
    if(newRound){lastVerdict=verdict||lastVerdict;roundChallenge=replayGoal(lastVerdict);}else{lastVerdict=null;roundChallenge=null;}
    quoteFlow.cancel();quoting=false;verdict=null;round='main';decision=null;reasonDraft=null;reasonEditing=false;handwriteNotice=false;
    guessText='';estimateFrozen=false;previewSideId=null;swapMotion=null;loadingRound=false;
    storeDialog.close();if(view!=='home')view='oracle';
    render();toast(newRound?(replayInfo?.exhausted?'本店的可核验餐品已轮过，可以另选门店。':'新餐品已就位，这次试试没见过的。'):'真实餐品已就位，从神谕阁开始。');
    return true;
  }catch(error){failure=error.message;document.querySelector('#storeStatus').textContent=error.message;return false;}
  finally{if(turn===operation){busy=false;loadingRound=false;render();}}
}
async function freshRound(){
  if(busy||!session)return;
  quoteFlow.cancel();quoting=false;const oldView=view;loadingRound=true;view='oracle';render(true);
  const ok=await useStore(session.context.store,{newRound:true});
  if(!ok){view=oldView;loadingRound=false;render();toast('新菜单暂未取回，上一局与手写判词都保留着。');}
}
async function searchStores(event){
  event?.preventDefault();if(busy)return;busy=true;
  const status=document.querySelector('#storeStatus');status.textContent='正在查询门店…';document.querySelector('#storeResults').replaceChildren();
  try{
    const form=new FormData(document.querySelector('#storeForm'));
    const result=await api('/api/stores',{city:form.get('city').trim(),keyword:form.get('keyword').trim()});stores=result.stores;
    status.textContent=stores.length?'选择营业中的门店会另开一局；可先保存当前判决书。':'没有找到门店，请换关键词。';
    document.querySelector('#storeResults').innerHTML=stores.map((s,i)=>`<button class="store-result" data-action="use-store" data-index="${i}" ${s.open===false?'disabled':''}><b>${esc(s.name)} ${s.open===false?'· 暂未营业':''}</b><span>${esc(s.address)}<br>到店取餐 · 门店 ${esc(s.code)}</span></button>`).join('');
  }catch(error){status.textContent=error.message;}finally{busy=false;}
}
async function init(){
  const turn=++operation;failure='';render();
  try{
    health=await api('/api/health');if(!health.connected)throw new Error(health.error?.message||health.message||'MCP尚未连接，请检查本机配置后重试。');
    const result=await api('/api/stores',{city:'上海',keyword:'人民广场'});if(turn!==operation)return;
    stores=result.stores;const store=stores.find(x=>x.open!==false);if(!store)throw new Error('示例门店暂不可用，请点击右上角换门店。');
    await useStore(store);
  }catch(error){if(turn===operation){failure=error.message;render();}}
}
function evidence(){
  document.querySelector('#evidenceContent').innerHTML=`<p>官方服务：<span class="evidence-code">https://mcp.mcd.cn</span><br>${health?.connected?'initialize / tools/list 已成功':'尚未确认连接成功'}</p><ol class="evidence-list"><li>query-nearby-stores：公开位置查询，到店取餐。</li><li>query-meals：真实可售菜单，新局优先未见餐品。</li><li>query-meal-detail：核验独立单品和默认特调。</li><li>query-store-coupons：只查询，本局不使用私人券。</li><li>calculate-price：两盘分别查询，金额采用官方整数分。</li></ol>${session?`<p>${esc(session.context.store.name)}<br>菜单：${esc(time(session.context.source.fetchedAt))}${session.originalQuote?`<br>首次报价：${esc(time(session.originalQuote.quotedAt))} / ${money(session.originalQuote.totalCents)}`:''}</p>`:''}<p>玩家估价独立存放，不参与官方计价。Token仅由本机读取；没有领券、下单、付款或积分变更。</p>`;
  evidenceDialog.showModal();
}
async function copyText(){
  const value=buildShareText(verdict);document.querySelector('#shareText').value=value;document.querySelector('#shareDialog').showModal();
  try{await navigator.clipboard.writeText(value);toast('分享文字已准备好。');}catch{toast('分享文字已展开，可全选复制。');}
}
async function exportPng(){
  const button=app.querySelector('[data-action="download"]');if(button?.disabled)return;button.disabled=true;button.textContent='正在印制…';
  try{
    const current=verdict,capturedSessionId=session.context.sessionId;
    const blob=await renderVerdictPng(current,{imageUrl:x=>x.image.startsWith('https://')?`/api/menu-image/${encodeURIComponent(capturedSessionId)}/${encodeURIComponent(x.id)}`:x.image});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`这一口判决书-v3-${current.original.quote.quotedAt.slice(0,10)}.png`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('高清判决书已交给浏览器下载。');
  }catch(error){toast(`保存失败：${error.message}`);}finally{if(button?.isConnected){button.disabled=false;button.textContent='分享高清判决 ↓';}}
}
function stamp(){
  if(!decision||quoting){toast('先亲手选 A 或 B，再给它盖章。');return;}
  syncDraft();
  try{
    if(reasonDraft.kind==='handwritten')handwriteReason(reasonDraft.text);
    verdict=buildVerdict(session,{decision,reason:reasonDraft.text});view='verdict';failure='';render(true);
  }catch(error){toast(error.message);reasonEditing=true;render();document.querySelector('#myReason')?.focus();}
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button||button.disabled)return;
  const action=button.dataset.action;
  if(busy&&!['home','open-store','close-store','evidence','close-evidence','close-share'].includes(action))return;
  try{
    if(action==='home'){view='home';render(true);}
    else if(action==='enter')enter(button.dataset.view);
    else if(action==='open-store')storeDialog.showModal();
    else if(action==='close-store')storeDialog.close();
    else if(action==='use-store')await useStore(stores[Number(button.dataset.index)]);
    else if(action==='retry-init')await init();
    else if(action==='continue')enter(session.comparison?'rebirth':'court');
    else if(action==='pick'){session=choose(session,button.dataset.kind,button.dataset.id);guessText='';estimateFrozen=false;failure='';if(button.dataset.kind==='main')round='side';else view='court';render(true);}
    else if(action==='reselect'){round='main';render(true);}
    else if(action==='guess-chip'){guessText=button.dataset.amount;document.querySelector('#guessPrice').value=guessText;app.querySelectorAll('.guess-chips button').forEach(x=>x.classList.toggle('selected',x===button));}
    else if(action==='reveal')await reveal();
    else if(action==='skip-reveal')await reveal({skip:true});
    else if(action==='try-swap'){enter('rebirth');}
    else if(action==='swap-side')swap(button.dataset.id);
    else if(action==='compare')await compare();
    else if(action==='select-plate')selectPlate(button.dataset.decision);
    else if(action==='edit-reason'){reasonEditing=!reasonEditing;render();if(reasonEditing)document.querySelector('#myReason')?.focus();}
    else if(action==='reason'){reasonDraft=chooseReason(decisionDetails(),Number(button.dataset.index));handwriteNotice=false;render();}
    else if(action==='stamp')stamp();
    else if(action==='back-swap'){view='rebirth';render(true);document.querySelector('.comparison')?.scrollIntoView({block:'start',behavior:motionBehavior()});}
    else if(action==='new-round')await freshRound();
    else if(action==='evidence')evidence();
    else if(action==='close-evidence')evidenceDialog.close();
    else if(action==='copy')await copyText();
    else if(action==='close-share')document.querySelector('#shareDialog').close();
    else if(action==='select-share')document.querySelector('#shareText').select();
    else if(action==='download')await exportPng();
  }catch(error){toast(error.message);}
});
document.addEventListener('input',event=>{
  if(event.target.id==='guessPrice')guessText=event.target.value;
  if(event.target.id==='myReason'){
    reasonDraft={kind:'handwritten',text:event.target.value};handwriteNotice=false;
    document.querySelector('#reasonPreview').textContent=reasonDraft.text;
    const note=document.querySelector('.handwritten-note');if(note){note.textContent='手写判词已保留，改判也不会自动改写。';note.classList.remove('hidden');}
  }
});
document.querySelector('#storeForm').addEventListener('submit',searchStores);
render();init();
