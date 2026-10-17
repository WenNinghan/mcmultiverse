import {createSession,choose,getOriginalIds,setOriginalQuote,replaceSide,getReplacementIds,setComparison,buildVerdict,money,setEstimate} from './triad-core.mjs';
import {comparisonCopy,reasonOptions,syncReasonDraft,chooseReason,handwriteReason,verdictPresentation} from './triad-experience.mjs';
import {renderVerdictPng,buildShareText} from './triad-share.mjs';

const app=document.querySelector('#app');
const storeDialog=document.querySelector('#storeDialog');
const evidenceDialog=document.querySelector('#evidenceDialog');
let session=null,view='home',round='main',busy=false,failure='',health=null,verdict=null;
let decision='keep',reasonDraft=null,reasonEditing=false,handwriteNotice=false;
let guessText='',estimateFrozen=false,previewSideId=null,swapMotion=null;
let stores=[],operation=0,roundNumber=1,replayInfo=null;
const seenByStore=new Map();
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
  const mains=session?.context.mainOptions||[{image:'assets/menu/巨无霸.png',name:'餐品素材'},{image:'assets/menu/板烧鸡腿堡.png',name:'餐品素材'}];
  const sides=session?.context.sideOptions||[{image:'assets/menu/薯条.png',name:'配餐素材'},{image:'assets/menu/玉米杯.png',name:'配餐素材'}];
  const courtReady=!!session?.selection.sideId,rebirthReady=!!session?.originalQuote;
  return `<section class="home home-v2"><div class="hero"><div class="hero-copy"><span class="eyebrow">McMULTIVERSE / THE TASTE IS YOURS</span><h1>这一口，<br><em>我判了。</em></h1><p class="hero-promise">两次盲选，一次反悔。<br>只换一份，看你还会不会改主意。</p></div><div class="hero-art" role="img" aria-label="餐盘、黄色判章和小票的艺术静物"></div><div class="hero-note">先凭食欲<br>后看价格</div></div><div class="hall-heading"><span>神谕阁 → 审判庭 → 轮回司</span><small>同一份餐盘，一路带下去</small></div><div class="temples"><button class="temple-card oracle entry-start" data-action="enter" data-view="oracle"><span class="card-top">神谕阁 <i class="card-number">01</i></span><h2>先盲选。</h2><p class="caption">先别看价。<br>选两份你第一眼想吃的。</p><div class="card-scene" aria-hidden="true">${picture(mains[0],'',true)}${picture(mains[1],'',true)}</div><span class="card-end"><span class="start-pill">${session?.originalQuote?'回看本局盲选':'从这里开始'}</span><span class="arrow-circle">↗</span></span></button><button class="temple-card court" data-action="enter" data-view="court" data-locked="${!courtReady}"><span class="card-top">审判庭 <i class="card-number">02</i></span><h2>再揭价。</h2><p class="caption">可先估个价，也可以直接翻开。<br>看看真实报价和直觉差多少。</p><div class="card-scene" aria-hidden="true"><div class="price-prop"><span>THE PRICE</span><b>¥ ? . ?</b></div><div class="mini-stamp">有据</div></div><span class="card-end"><span>${courtReady?'已选好 · 可以揭价':'第 2 步 · 选好两份后开放'}</span><span class="arrow-circle">${courtReady?'↗':'·'}</span></span></button><button class="temple-card rebirth" data-action="enter" data-view="rebirth" data-locked="${!rebirthReady}"><span class="card-top">轮回司 <i class="card-number">03</i></span><h2>只换一份。</h2><p class="caption">亲手换掉配餐，重新算价。<br>选定一盘，把你的判决带走。</p><div class="card-scene" aria-hidden="true">${picture(sides[0],'',true)}<span class="swap-prop">↝</span>${picture(sides[sides.length-1],'',true)}</div><span class="card-end"><span>${rebirthReady?'已揭价 · 可以试换':'第 3 步 · 原盘揭价后开放'}</span><span class="arrow-circle">${rebirthReady?'↗':'·'}</span></span></button></div><div class="home-bottom"><p>${session?`本局：主食＋配餐＋${esc(session.context.drink.name)}（固定） · 三份单点`:'正在取回真实门店菜单，连接完成后就可以开始。'}</p>${session?.selection.sideId?'<button class="resume-button" data-action="continue">接着刚才那一盘 →</button>':''}</div>${failure?`<div class="inline-error">${esc(failure)} <button class="resume-button" data-action="retry-init">重新连接</button></div>`:''}</section>`;
}
function waiting(){return `<div class="loading-panel"><div class="spinner" aria-hidden="true"></div><h2>下一对餐品，马上就位。</h2><p>正在查询真实可售菜单和默认规格。<br>你的上一局会保留到新菜单成功返回。</p></div>`;}
function oracle(){
  if(!session)return waiting();
  if(session.originalQuote)return `${heading('01 / BLIND CHOICE SAVED','这盘偏爱，已经记下。','本局盲选已封存。回看不会改变餐品、估价或手写判词。')}<div class="oracle-recap">${mealTray(originalItems())}<p>${originalItems().map(x=>esc(x.name)).join(' ＋ ')}</p><div class="button-row"><button class="primary-button" data-action="enter" data-view="court">回到这盘报价 →</button><button class="secondary-button" data-action="new-round">换一对新餐品，再玩</button></div></div>`;
  const options=(round==='main'?session.context.mainOptions:session.context.sideOptions).slice(0,2);
  const fresh=roundNumber>1?`<p class="new-round-note">第 ${roundNumber} 局 · ${replayInfo?.exhausted?'当前门店的可核验餐品已轮过，可以换门店发现新餐品。':`这轮新出现 ${replayInfo?.mainFreshCount??0} 份主食、${replayInfo?.sideFreshCount??0} 份配餐候选。`}</p>`:'';
  return `${heading('01 / THE ORACLE',round==='main'?'第一眼，站哪边？':'再加一份，选谁？',round==='main'?'点你现在更想吃的主食。价格先盖着。':'主食留好了。选一份配餐，去翻价签。')}${fresh}<div class="round-counter-wrap"><div class="round-counter">${round==='main'?'1':'2'} / 2 <i class="done"></i><i class="${round==='side'?'done':''}"></i></div></div><div class="blind-options">${options.map((x,i)=>`<button class="food-option" data-action="pick" data-kind="${round}" data-id="${esc(x.id)}"><span class="option-letter">${i?'B':'A'}</span><div class="plate">${picture(x)}</div><div class="food-label"><div><h2>${esc(x.name)}</h2><small>${x.customized?'【可特调】本局用默认搭配':'每份一件 · 默认规格'}</small></div><span class="choose-mark" aria-hidden="true">↗</span></div></button>`).join('')}</div>${round==='side'?`<div class="picked-strip">${picture(item(session.selection.mainId))}<span>已留下 ${esc(item(session.selection.mainId).name)}</span><button data-action="reselect">重选主食</button></div>`:''}<p class="blind-footer">固定另配一份 <b>${esc(session.context.drink.name)}</b>，两盘都不动它。<br>${esc(session.context.store.name)} · 当前可售单品 · 图片作示意，规格以名称为准。</p>`;
}
function estimateControls(){
  if(estimateFrozen)return `<div class="estimate-frozen">${session.estimateCents===null?'已跳过估价':'本局猜价已封存：'+money(session.estimateCents)} · 重试不会改动猜价</div>`;
  return `<div class="estimate-controls"><label for="guessPrice">这盘你估多少？ <small>可跳过</small></label><div class="guess-input"><span aria-hidden="true">¥</span><input id="guessPrice" inputmode="decimal" maxlength="8" value="${esc(guessText)}" placeholder="猜个总价，比如 35.00" aria-label="估计三份单点总价，可跳过"></div><div class="guess-chips">${[25,35,45,55].map(n=>`<button data-action="guess-chip" data-amount="${n}">${money(n*100)}</button>`).join('')}</div></div>`;
}
function estimateResult(){
  if(session.estimateCents===null)return '<p class="estimate-result skipped">本局直接揭价，没有记录猜测。</p>';
  const gap=session.originalQuote.totalCents-session.estimateCents;
  return `<div class="estimate-result"><span>你的猜价 ${money(session.estimateCents)}</span><b>${gap===0?'分毫不差，猜中了。':`首次报价比猜价${gap>0?'高':'低'} ${money(Math.abs(gap))}`}</b></div>`;
}
function quoteLines(q){return getOriginalIds(session).map(id=>{const row=q.items.find(x=>x.id===id);return `<div class="price-line"><span>${esc(item(id).name)}${item(id).customized?'【可特调】':''} × 1</span><span>${row?.subtotalCents!==undefined?money(row.subtotalCents):'已计入总额'}</span></div>`;}).join('')+Object.entries(feeLabels).filter(([k])=>q.fees?.[k]>0).map(([k,label])=>`<div class="price-line"><span>${label}</span><span>${money(q.fees[k])}</span></div>`).join('');}
function court(){
  if(!session?.selection.sideId)return oracle();
  const q=session.originalQuote;
  return `${heading('02 / THE VERDICT','翻开价格，看看直觉。','主食＋配餐＋固定饮品，三份单点。估价只是你的猜测。')}<div class="tray-layout">${mealTray(originalItems())}<div class="ticket"><span class="eyebrow">THE PRICE / 这盘真实总额</span>${!q?`${estimateControls()}<button class="price-mask" data-action="reveal" ${busy?'disabled':''}><span>${busy?'正在查询真实价格…':'翻开真实价格'}</span><b aria-hidden="true">↻</b></button>${!estimateFrozen?'<button class="skip-guess" data-action="skip-reveal">跳过估价，直接揭价 →</button>':''}<p class="source-note">按 ${esc(session.context.store.name)} · 到店取餐查询。</p>`:`<div class="price-block"><small>首次官方查询总额</small><strong><i>¥</i>${(q.totalCents/100).toFixed(2)}</strong></div>${estimateResult()}<details class="fact-details"><summary>展开三份餐品与报价依据</summary>${quoteLines(q)}${q.discountCents>0?`<p>官方返回优惠：${money(q.discountCents)}</p>`:''}<p>${esc(session.context.store.name)} · 到店取餐 · ${esc(time(q.quotedAt))}<br>真实 MCP / calculate-price；未使用私人券，采用默认规格与特调。历史查询记录，非订单。</p></details>`}</div></div>${failure?`<div class="inline-error">${esc(failure)} <button class="resume-button" data-action="reveal">保留选择，重试算价</button></div>`:''}${q?`<div class="judge-question"><h2>给偏爱一次反悔的机会。</h2><p>下一步只动配餐；看完两盘真实价格，再决定盖哪边。</p><div class="button-row"><button class="secondary-button" data-action="try-swap" data-decision="keep">我更想留原盘，先看看</button><button class="primary-button" data-action="try-swap" data-decision="swap">我想试换一份 →</button></div></div>`:''}`;
}
function decisionDetails(){return {decision,originalSide:item(session.selection.sideId).name,replacementSide:item(session.replacementSideId).name,deltaCents:session.comparison.deltaCents};}
function syncDraft(){if(reasonDraft?.kind!=='handwritten')reasonDraft=syncReasonDraft(reasonDraft,decisionDetails());}
function choiceCard(items,q,key,{selected=false,final=false}={}){
  const tag=final?'div':'button',action=final?'':`data-action="select-plate" data-decision="${key==='A'?'keep':'swap'}" aria-pressed="${selected}"`;
  return `<${tag} class="plate-choice ${selected?'selected':''} ${final?'final-plate':''}" data-plate="${key}" data-chosen="${selected}" ${action}><div class="choice-top"><span>${key} / ${key==='A'?'原来那盘':'换一份的新盘'}</span><b>${selected?(final?'✓ 我的选择':'✓ 暂选这一盘'):(final?'另一种选择':'点一下选这盘')}</b></div><div class="choice-food">${picture(items[1])}<small>${key==='A'?'原配餐':'仅此份变化'}</small></div><h3>${esc(items[1].name)}</h3><strong class="choice-total">${money(q.totalCents)}<small>整盘总额</small></strong>${feeNote(q)?`<p class="choice-fee">含${esc(feeNote(q))}</p>`:''}</${tag}>`;
}
function compareView(){
  const c=session.comparison,original=originalItems(),replacement=getReplacementIds(session).map(item);
  return `<div class="comparison"><div class="comparison-heading"><span class="eyebrow">ONLY ONE CHANGE / 一份变化，两种答案</span><h2>${esc(comparisonCopy(c.deltaCents))}</h2><p>${esc(original[1].name)} → ${esc(replacement[1].name)} · 先选一盘，再给它盖章</p></div><div class="choice-grid">${choiceCard(original,c.originalRefresh,'A',{selected:decision==='keep'})}${choiceCard(replacement,c.newQuote,'B',{selected:decision==='swap'})}</div>${fixedStrip()}${c.baselineChangedCents?`<p class="market-note">原盘自首次揭价${c.baselineChangedCents>0?'上涨':'下降'}了 ${money(Math.abs(c.baselineChangedCents))}；上面的B对A差额采用刚重新查询的原盘，不把时价变化算作改单收益。</p>`:''}<details class="compare-evidence"><summary>两盘查询时间与口径</summary><p>${esc(time(c.originalRefresh.quotedAt))} / ${esc(time(c.newQuote.quotedAt))} · 同门店、到店取餐、各一份、不用私人券。两次独立报价，价格可能随时段变化。</p></details></div>`;
}
function reasonWorkbench(){
  syncDraft();const handwritten=reasonDraft?.kind==='handwritten';
  return `<div class="final-workbench"><span class="reason-label">${decision==='keep'?'给 A 原盘':'给 B 新盘'}，一句判词。</span><p class="reason-preview" id="reasonPreview">${esc(reasonDraft.text)}</p><button class="edit-reason" data-action="edit-reason">${reasonEditing?'收起编辑':'自己写一句 ✎'}</button><p class="handwritten-note ${handwritten?'':'hidden'}">手写判词已保留。${handwriteNotice?'你刚改了选择，请自行确认文字是否仍合适。':''}</p><div class="reason-editor ${reasonEditing?'':'hidden'}"><label for="myReason">你的原文会保留，改判也不会自动改写。</label><input id="myReason" class="custom-reason" maxlength="80" value="${esc(reasonDraft.text)}" aria-label="我的手写判词，最多80字"></div><details class="reason-suggestions"><summary>${handwritten?'主动换成一条推荐判词':'看看其他推荐判词'}</summary>${handwritten?'<p>点击下面的推荐句，会替换你当前的手写文字。</p>':''}<div class="reason-options">${reasonOptions(decisionDetails()).map((x,i)=>`<button class="reason-chip" data-action="reason" data-index="${i}">${esc(x)}</button>`).join('')}</div></details><button class="primary-button stamp-button" data-action="stamp"><span class="stamp-button-symbol" aria-hidden="true">判</span>给 ${decision==='keep'?'A 原盘':'B 新盘'} 盖章 <span aria-hidden="true">↓</span></button></div>`;
}
function rebirth(){
  const original=originalItems(),recommended=item(previewSideId),hasSwap=!!session.replacementSideId;
  return `${heading('03 / THE REWRITE','亲手换一份，再判一次。','主食与饮品不动。点选或拖入一份配餐，才算你真正换过。')}<div class="swap-workbench"><div><p class="swap-label">${hasSwap?'你已亲手替换配餐':'餐盘还是原样 / 等你动手'}</p>${mealTray(original,{swappable:true})}</div><aside class="candidate-panel"><p class="swap-label">${hasSwap?'还可以试试别的配餐':'推荐先试这一份'}</p><div class="candidate-list">${session.context.sideOptions.filter(x=>x.id!==session.selection.sideId).map(x=>`<button class="candidate ${x.id===session.replacementSideId?'selected':''} ${!hasSwap&&x.id===previewSideId?'recommended':''}" data-action="swap-side" data-id="${esc(x.id)}" draggable="true" aria-pressed="${x.id===session.replacementSideId}" ${busy?'disabled':''}>${picture(x)}<span>${esc(x.name)}</span><small>${x.id===session.replacementSideId?'✓ 已放进餐盘':!hasSwap&&x.id===previewSideId?'推荐 · 点我放进去':'点选或拖入'}</small></button>`).join('')}</div>${!hasSwap?`<p class="candidate-hint">${esc(recommended.name)} 只是候选虚影，原单还没变。</p>`:''}<button class="primary-button compare-button" data-action="compare" ${busy||!hasSwap?'disabled':''}>${busy?'正在重新查询两盘…':hasSwap?'查这两盘，差多少？':'先放入一份新配餐'} <span aria-hidden="true">↗</span></button><p class="candidate-hint">原盘始终保留在 A，最后仍可以选回来。</p></aside></div>${failure?`<div class="inline-error">${esc(failure)} <button class="resume-button" data-action="compare">保留改单，重试报价</button></div>`:''}${session.comparison?compareView()+reasonWorkbench():''}`;
}
function verdictView(){
  const v=verdict,m=verdictPresentation(v);
  return `<div class="verdict-sheet verdict-v2"><div class="verdict-top"><span class="eyebrow">我的这一口判决书 / McMULTIVERSE</span><div class="verdict-stamp">${v.decision==='keep'?'偏爱<br>成立':'改判<br>成立'}<small>MY CHOICE</small></div></div><h1>${esc(m.question)}</h1><p class="verdict-direction">${esc(m.direction)}</p><div class="choice-grid">${choiceCard(v.original.items,v.original.quote,'A',{selected:v.decision==='keep',final:true})}${choiceCard(v.replacement.items,v.replacement.quote,'B',{selected:v.decision==='swap',final:true})}</div><div class="verdict-fixed"><span>${picture(v.original.items[0])}${esc(v.original.items[0].name)}</span><span>${picture(v.original.items[2])}${esc(v.original.items[2].name)}</span><small>主食和饮品，两盘都没动。</small></div><div class="verdict-choice"><b>${esc(m.chosenLabel)}</b><span>${esc(m.chosenExplanation)}</span></div><blockquote class="verdict-line">${esc(v.reason)}</blockquote>${m.estimateNote?`<p class="verdict-estimate">${esc(m.estimateNote)}</p>`:''}<p class="verdict-foot">${esc(v.store.name)} · 到店取餐 · 未使用私人券<br>${esc(time(v.original.quote.quotedAt))} / ${esc(time(v.replacement.quote.quotedAt))} · MCP 官方查询${v.baseline.changedCents?`<br>原盘时价另有 ${money(v.baseline.changedCents)} 变化，已与改单差额分开。`:''}<br>历史查询记录，非订单；当前价格、库存以实际点餐时为准。<br>非官方创意作品 · 餐品图版权归各权利人</p></div><div class="button-row"><button class="primary-button" data-action="download">保存高清判决书 ↓</button><button class="secondary-button" data-action="copy">分享这道选择题</button></div><p class="download-note">图片里已经写好问题，把它发给朋友，让对方选 A 或 B。</p><div class="button-row"><button class="back-button" data-action="back-swap">← 我再想想这一盘</button><button class="back-button" data-action="new-round">换一对新餐品，再玩 ↗</button></div>`;
}

let loadingRound=false;
function render(focus=false){
  updateStore();
  const content=view==='home'?'':loadingRound?waiting():view==='oracle'?oracle():view==='court'?court():view==='rebirth'?rebirth():verdictView();
  app.innerHTML=view==='home'?home():`<section class="stage stage-v2">${nav(view==='verdict'?'rebirth':view)}${view==='verdict'&&failure?`<div class="inline-error">${esc(failure)}</div>`:''}${content}</section>`;
  swapMotion=null;bindDrag();
  if(focus){window.scrollTo({top:0,behavior:'instant'});app.querySelector('h1')?.focus({preventScroll:true});}
}
function enter(next){
  if(busy)return;
  failure='';
  if(!session){toast('真实菜单还在准备，连接完成后就能开始。');return;}
  if(next==='court'&&!session.selection.sideId){toast('先在神谕阁选好主食和配餐，审判庭才有餐盘可以揭价。');if(view==='home'){app.querySelector('.entry-start')?.classList.add('entry-nudge');return;}next='oracle';}
  if(next==='rebirth'&&!session.originalQuote){toast(session.selection.sideId?'先在审判庭揭开原盘价格，再来试换。':'先从神谕阁选两份，轮回司会接住这盘选择。');if(view==='home'){app.querySelector('.entry-start')?.classList.add('entry-nudge');return;}next=session.selection.sideId?'court':'oracle';}
  view=next;
  if(next==='oracle'&&!session.originalQuote)round=session.selection.mainId?'side':'main';
  if(next==='rebirth'&&!previewSideId)previewSideId=session.context.sideOptions.find(x=>x.id!==session.selection.sideId).id;
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
  try{const q=await api('/api/quote',{sessionId:current.context.sessionId,itemIds:getOriginalIds(current)});if(session===current)session=setOriginalQuote(current,q);}
  catch(error){failure=error.message;}
  finally{busy=false;render();if(session.originalQuote&&view==='court'&&innerWidth<=620)document.querySelector('.price-block')?.scrollIntoView({block:'start',behavior:motionBehavior()});}
}
async function compare(){
  if(busy||!session?.replacementSideId)return;
  busy=true;failure='';render();const current=session;
  try{
    const a=await api('/api/quote',{sessionId:current.context.sessionId,itemIds:getOriginalIds(current)});
    const b=await api('/api/quote',{sessionId:current.context.sessionId,itemIds:getReplacementIds(current)});
    if(session===current){session=setComparison(current,a,b);syncDraft();}
  }catch(error){failure=error.message;}
  finally{busy=false;render();if(session.comparison&&view==='rebirth')document.querySelector('.comparison')?.scrollIntoView({block:'start',behavior:motionBehavior()});}
}
function swap(id){
  if(busy||id===session.replacementSideId)return;
  const from=session.replacementSideId||session.selection.sideId;
  session=replaceSide(session,id);swapMotion={from,to:id};
  if(reasonDraft?.kind==='handwritten')handwriteNotice=true;
  failure='';render();toast(`已放入${item(id).name}，只改了这一份配餐。`);
  setTimeout(()=>document.querySelector('.side-out')?.remove(),500);
}
function selectPlate(next){
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
  const turn=++operation;busy=true;failure='';
  document.querySelector('#storeStatus').textContent='正在核验真实菜单、独立单品和默认规格…';
  try{
    const seen=seenByStore.get(store.code)||{mains:[],sides:[]};
    const c=await api('/api/context',{storeCode:store.code,...(newRound?{excludeMainIds:seen.mains,excludeSideIds:seen.sides}:{})});
    if(turn!==operation)return false;
    const next=createSession(c);
    if(!newRound)seenByStore.delete(c.store.code);
    session=next;recordSeen(c);replayInfo=c.replay;roundNumber=newRound?roundNumber+1:1;
    verdict=null;round='main';decision='keep';reasonDraft=null;reasonEditing=false;handwriteNotice=false;
    guessText='';estimateFrozen=false;previewSideId=null;swapMotion=null;loadingRound=false;
    storeDialog.close();if(view!=='home')view='oracle';
    render();toast(newRound?(replayInfo?.exhausted?'本店的可核验餐品已轮过，可以另选门店。':'新餐品已就位，这次试试没见过的。'):'真实餐品已就位，从神谕阁开始。');
    return true;
  }catch(error){failure=error.message;document.querySelector('#storeStatus').textContent=error.message;return false;}
  finally{if(turn===operation){busy=false;loadingRound=false;render();}}
}
async function freshRound(){
  if(busy||!session)return;
  const oldView=view;loadingRound=true;view='oracle';render(true);
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
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`这一口判决书-v2-${current.original.quote.quotedAt.slice(0,10)}.png`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('高清判决书已交给浏览器下载。');
  }catch(error){toast(`保存失败：${error.message}`);}finally{if(button?.isConnected){button.disabled=false;button.textContent='保存高清判决书 ↓';}}
}
function stamp(){
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
    else if(action==='try-swap'){decision=button.dataset.decision;enter('rebirth');}
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
