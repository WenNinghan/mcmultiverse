/* Two distinct short games share navigation and receipts, never their mechanics. */
(function () {
  'use strict';
  const IDS = ['midnight', 'friend'];
  const STAGES = ['oracle', 'order', 'court', 'choice', 'action', 'result'];
  const states = {};
  let section, activeId = 'midnight', initialized = false;
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const money = value => '¥' + (Number(value || 0) / 100).toFixed(2);
  const number = value => Number.isFinite(Number(value)) ? String(Math.round(Number(value) * 10) / 10) : '—';
  const signed = value => (value > 0 ? '+' : '') + number(value);
  const current = () => states[activeId];
  const clock = (meta, elapsed) => { const value = Math.round(Number(meta.startMinutes || 0) + Number(elapsed || 0)); return String(Math.floor(value / 60) % 24).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0'); };
  function makeSeed() { if (window.crypto?.getRandomValues) { const value = new Uint32Array(1); crypto.getRandomValues(value); return value[0] || 1; } return (Date.now() >>> 0) || 1; }
  function preview(s) { return s.engine.preview(s.run); }
  function catalog(s) { return s.engine.catalog(s.run); }
  function readStorage(id) { try { const raw = localStorage.getItem('mcm_session_' + id + '_v1'); return raw ? JSON.parse(raw) : null; } catch (error) { return null; } }
  function persist(s) {
    if (STAGES.includes(s.stage)) s.actualStage = s.stage;
    try { localStorage.setItem('mcm_session_' + s.id + '_v1', JSON.stringify({version: 1, run: s.run, stage: s.actualStage, collection: s.collection})); }
    catch (error) { s.storageWarning = true; }
  }
  function unlock(s, result) {
    if (result?.ending && !result.blocked) {
      s.collection[result.ending.id] = {id: result.ending.id, name: result.ending.name, text: result.ending.text, date: s.run.snapshot.date};
      persist(s);
    }
  }
  function clearReplayHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    if (['ep', 'am', 'mc'].some(key => params.has(key))) history.replaceState(null, '', location.pathname + location.search);
  }
  async function ready() { if (window.MC_DATA_READY) await window.MC_DATA_READY; if (!initialized) init(); }
  function openSection() {
    if (typeof SECTIONS !== 'undefined' && !SECTIONS.includes('deepSession')) SECTIONS.push('deepSession');
    if (typeof go === 'function') go('deepSession'); else section.classList.remove('hidden');
  }
  async function startDeepSession(id) {
    await ready();
    if (!IDS.includes(id)) return;
    activeId = id; const s = current();
    try {
      s.run = s.engine.makeRun(window.McJourney.captureData(), makeSeed());
      s.stage = s.actualStage = 'oracle'; s.comparison = null; s.notice = ''; s.sharedLink = ''; s.from = ''; s.to = ''; s.afterword = false; s.guideKey = '';
      clearReplayHash(); openSection(); persist(s); render(true);
    } catch (error) { openSection(); renderError(error.message); }
  }
  async function resumeDeepSession(id) {
    await ready(); if (!IDS.includes(id)) return;
    activeId = id; const s = current();
    if (!s.run) return startDeepSession(id);
    s.stage = s.actualStage; s.comparison = null; s.notice = ''; s.sharedLink = '';
    clearReplayHash(); openSection(); render(true);
  }
  async function showSessionArchive(id) {
    await ready(); if (!IDS.includes(id)) return;
    activeId = id; const s = current();
    if (!s.run) { s.run = s.engine.makeRun(window.McJourney.captureData(), makeSeed()); s.actualStage = 'oracle'; }
    s.stage = 'archive'; s.notice = ''; s.comparison = null; openSection(); render(true);
  }
  function button(text, action, value, style, disabled) {
    return '<button class="ds-button ' + (style || '') + '" data-ds-action="' + action + '"' + (value != null ? ' data-ds-value="' + esc(value) + '"' : '') + (disabled ? ' disabled' : '') + '>' + text + '</button>';
  }
  function heading(kicker, title, text) { return '<header class="ds-stage-head"><span class="ds-kicker">' + esc(kicker) + '</span><h2>' + esc(title) + '</h2><p>' + esc(text) + '</p></header>'; }
  function rules(s) { return '<details class="ds-rules"><summary>展开这一局的完整规则 · 选择前可以核对</summary><p>' + esc(s.engine.meta.ruleText) + '</p><p>所有等待、精力、饱腹、口味、质量与券均为虚构游戏规则，不代表真实营养、制作时间、活动或消费。阅读不消耗游戏时间。</p></details>'; }
  function resourceText(meta, resource, value) {
    if (resource.format === 'money') return money(value);
    if (resource.format === 'minutes') return number(value) + '′';
    return number(value) + (resource.format === 'score' ? '/100' : '');
  }
  function resourceStrip(s, resources, small) {
    const meta = s.engine.meta;
    const fields = (meta.resources || []).filter(resource => s.stage !== 'result' || small || resource.key !== 'elapsed');
    return '<div class="ds-resource-strip' + (small ? ' ds-resource-small' : '') + '">' + fields.map(resource => '<div><span>' + esc(resource.label) + '</span><b>' + esc(resourceText(meta, resource, resources?.[resource.key])) + '</b></div>').join('') + '</div>';
  }
  function resourcesAt(s, p) {
    const initial = p.initialResources || s.engine.meta.initialResources || {};
    if (s.stage === 'oracle' || s.stage === 'archive') return initial;
    if (s.stage === 'order' || s.stage === 'court') return p.orderResources || initial;
    if (s.stage === 'choice') return p.courtResources || initial;
    if (s.stage === 'action') return p.choiceResources || initial;
    return s.engine.resolve(s.run).resources || initial;
  }
  function hud(s, data) {
    const meta = s.engine.meta, elapsed = Number(data.elapsed || 0), midnight = s.id === 'midnight';
    const label = s.stage === 'order' ? '订单预估 · 尚未付款取餐' : s.stage === 'court' ? '已付款取餐 · 尚未申辩' : s.stage === 'choice' ? '庭审结束 · 尚未作出下一选择' : s.stage === 'action' ? '前序选择已执行 · 尚未行动' : s.stage === 'oracle' ? '起局状态' : '这条线的实际状态';
    return '<div class="ds-hud"><div class="ds-clock"><span>' + (midnight ? '提交窗口 / GAME CLOCK' : '餐桌时刻 / GAME CLOCK') + '</span><strong>' + clock(meta, elapsed) + '</strong><small>' + (midnight ? '截稿 ' + clock(meta, meta.deadlineMinutes) + ' · ' + (elapsed <= meta.deadlineMinutes ? '还剩 ' + number(meta.deadlineMinutes - elapsed) + ' 分钟' : '已超时 ' + number(elapsed - meta.deadlineMinutes) + ' 分钟') : '从 ' + clock(meta, 0) + ' 起 · 已用 ' + number(elapsed) + ' 分钟') + '</small></div>' + resourceStrip(s, data) + '</div><p class="ds-state-caption">' + label + '</p>';
  }
  function progress(s) {
    const names = ['问神谕', '点一单', '上法庭', s.id === 'midnight' ? '准备开工' : '分餐', s.id === 'midnight' ? '提交策略' : '怎样相处', '看回响'];
    const index = STAGES.indexOf(s.stage);
    return '<nav class="ds-progress" aria-label="本局进度">' + names.map((name, i) => '<span class="' + (i === index ? 'ds-current' : i < index ? 'ds-done' : '') + '"' + (i === index ? ' aria-current="step"' : '') + '><i>' + (i + 1) + '</i>' + name + '</span>').join('') + '</nav>';
  }
  function chooseCards(s, entries, action) {
    const p = preview(s), base = resourcesAt(s, p);
    return '<div class="ds-choices">' + entries.map((entry, index) => {
      const title = entry.title || entry.name || entry.id;
      const cost = entry.minutes ?? (entry.resources ? Math.max(0, Number(entry.resources.elapsed) - Number(base.elapsed)) : null);
      const cues = [];
      if (cost != null) cues.push('用时 ' + number(cost) + ' 分钟');
      if (entry.costCents) cues.push('另付 ' + money(entry.costCents));
      let risk = '';
      if (entry.available === false) risk = entry.reason || '当前条件不足';
      else if (action === 'oracle') risk = entry.effect || '';
      else if (s.id === 'midnight') {
        if (action === 'argument') risk = entry.id === 'evidence' ? '用一次核验，修复一处已知错误。' : '直接继续，错误仍要自己处理。';
        else if (action === 'choice') risk = entry.id === 'break' ? '恢复状态，但评审窗口不会暂停。' : '省下休息时间，仓促会损失质量。';
        else risk = (entry.resources.elapsed > s.engine.meta.deadlineMinutes ? '会迟交；' : '可准时；') + (entry.resources.errors > 0 ? '仍会留下错误。' : '已知错误可清掉。');
      } else {
        if (action === 'argument') risk = entry.id === 'evidence' ? '让TA先挑，需要先把需求举证。' : '只认可总价，不替你保证两人吃好。';
        else if (action === 'choice') {
          const spicy = entry.trays?.friend?.some(item => item.name === '麦辣鸡腿堡' && item.servings > 0);
          risk = spicy ? 'TA会分到今天不想吃的辣堡。' : entry.resources.friendSatiety < 50 ? 'TA分到的还不够一顿。' : entry.resources.ownSatiety < 50 ? 'TA能吃够，你自己还饿着。' : '两人都能吃够，再看口味与相处。';
        } else risk = entry.id === 'drop' ? '付打包费，保留座位；这次不深谈。' : (entry.resources.elapsed > 20 ? '会错过占位；' : '赶得上占位；') + (p.dialogueReady ? '可以把话聊开。' : '当前还不足以聊开。');
      }
      return '<article class="ds-choice' + (entry.available === false ? ' ds-choice-unavailable' : '') + '"><span class="ds-choice-number">0' + (index + 1) + '</span><h3>' + esc(title) + '</h3>' +
        (action === 'oracle' ? '<p>' + esc(entry.text || '') + '</p>' : '') +
        '<div class="ds-choice-cues">' + cues.map(cue => '<span>' + esc(cue) + '</span>').join('') + '</div><p class="ds-choice-risk">' + esc(risk) + '</p>' +
        button(esc(title) + ' <b aria-hidden="true">↗</b>', action, entry.id, 'ds-choice-select', entry.available === false) +
        '<details class="ds-prediction"><summary>查看精确预估与条件</summary><p>' + esc(entry.text || '') + '</p><p>' + esc(entry.effect || '') + '</p>' + (entry.reason ? '<p>' + esc(entry.reason) + '</p>' : '') + (entry.resources ? resourceStrip(s, entry.resources, true) : '') + '</details></article>';
    }).join('') + '</div>';
  }
  function oracleView(s) {
    const meta = s.engine.meta;
    return heading('01 / 神谕阁 · 一种帮助，一种代价', meta.hook, s.id === 'midnight' ? '你们小组的网页演示要在02:00提交。首页打不开、按钮没反应、手机布局溢出：三项检查还没过。你只有28元，剩下36分钟。' : meta.intro) +
      '<div class="ds-opening-note">' + (s.id === 'midnight' ? '你能让它更完整，也得决定什么叫“交得出去”。' : '一张订单，两个人。便宜、吃饱和被理解，不是同一本账。') + '</div>' +
      chooseCards(s, meta.oracles || [], 'oracle') + rules(s);
  }
  function couponState(s) {
    if (!s.engine.meta.couponText) return '';
    const p = s.engine.preview(Object.assign(clone(s.run), {coupon: true}));
    const available = !!(p.couponApplied || p.quote?.applied?.length || p.quote?.appliedCoupons?.length || p.quote?.finalCents < p.quote?.originCents);
    if (s.run.oracle !== 'deal') return '<div class="ds-note">这一张神谕没有带券。<small>菜单价格与游戏等待都明示在餐品上。</small></div>';
    return '<label class="ds-coupon"><input id="dsCoupon" type="checkbox"' + (s.run.coupon ? ' checked' : '') + (!available && !s.run.coupon ? ' disabled' : '') + '><span><b>启用神谕里的演示券</b><small>' + esc(s.engine.meta.couponText) + '</small>' + (!available ? '<small>当前订单未满足券条件；改单失效时不会偷偷修改你的核券意图。</small>' : '') + '</span></label>';
  }
  function orderView(s) {
    const p = preview(s), items = catalog(s), count = Object.values(s.run.cart || {}).reduce((sum, n) => sum + n, 0);
    return heading('02 / 取餐台 · 每份餐都有自己的后果', s.id === 'midnight' ? '吃什么，决定怎么把这一版交出去。' : '点的是一单，吃的是两个人。', '从空订单开始。先看每份的游戏效果，再决定数量；所有预估都会随订单重算。') +
      '<div class="ds-menu">' + items.map(item => '<article class="ds-food' + (s.run.cart[item.name] ? ' ds-selected' : '') + '"><div class="ds-food-visual"><span>制作 ' + number(item.prep) + '′</span><img src="' + esc(item.img) + '" alt="' + esc(item.name) + '"></div><div class="ds-food-body"><h3>' + esc(item.name) + '</h3><ul>' + (item.facts || []).map(fact => '<li>' + esc(fact) + '</li>').join('') + '</ul><div class="ds-food-bottom"><b>' + money(item.priceCents) + '</b><div class="ds-qty"><button data-ds-action="qty" data-ds-value="' + esc(item.name) + '" data-ds-delta="-1" aria-label="减少一份' + esc(item.name) + '"' + (!s.run.cart[item.name] ? ' disabled' : '') + '>−</button><span aria-live="polite">' + (s.run.cart[item.name] || 0) + '</span><button data-ds-action="qty" data-ds-value="' + esc(item.name) + '" data-ds-delta="1" aria-label="增加一份' + esc(item.name) + '"' + (count >= 4 ? ' disabled' : '') + '>+</button></div></div></div></article>').join('') + '</div>' +
      couponState(s) + '<div class="ds-order-total"><span>共 ' + count + ' 份 · 预算 ' + money(s.engine.meta.budget) + '</span><strong>' + (p.quote?.originCents > p.quote?.finalCents ? '<del>' + money(p.quote.originCents) + '</del>' : '') + money(p.quote?.finalCents) + '</strong></div>' +
      (count && !p.valid ? '<p class="ds-alert">' + (p.errors || []).map(esc).join('；') + '</p>' : '') +
      (p.warnings || []).map(text => '<p class="ds-alert">' + esc(text) + '</p>').join('') + rules(s) +
      '<div class="ds-action-line">' + button('付款取餐，交给法官 ↗', 'next', 'court', 'ds-primary', !p.valid) + button('重选神谕', 'back', 'oracle', 'ds-outline') + '</div>';
  }
  function courtView(s) {
    const p = preview(s), midnight = s.id === 'midnight';
    return heading('03 / 审判庭 · 法官的账，还缺一页', midnight ? '“能提交，就算写完了吗？”' : '“总价便宜，就算两个人都吃好了吗？”', midnight ? '餐已取到。版本保全签能让复现证据更快成立；庭审修正会真实进入之后的质量与错误。' : '餐已取到。你可以接受价钱判词，也可以拿出朋友的需求作证；这决定怎样分餐才有依据。') +
      '<article class="ds-court-paper"><span class="ds-stamp">只审一半</span><small>McCOURT / ' + (midnight ? '凌晨提交案' : '双人晚饭案') + '</small><h3>' + (midnight ? '钱包的账结了。<br>报错的账，谁来查？' : '钱省没省，本庭算。<br>谁吃到什么，要拿证据。') + '</h3><div class="ds-ledger"><div>这单实付<b>' + money(p.quote?.finalCents) + '</b></div><div>开庭时刻<b>' + clock(s.engine.meta, p.orderResources?.elapsed) + '</b></div></div></article>' +
      chooseCards(s, s.engine.arguments(s.run), 'argument') + rules(s) + '<div class="ds-action-line">' + button('← 回取餐台改订单', 'back', 'order', 'ds-outline') + '</div>';
  }
  function choiceView(s) {
    return heading(s.id === 'midnight' ? '04 / 轮回司 · 先决定怎样开工' : '04 / 轮回司 · 先决定怎么对待眼前的人', s.engine.meta.choiceTitle, s.id === 'midnight' ? '精力、烦躁与版本状态都已进入现场。现在的准备方式，会改变下一步真正需要的工作时间。' : '每一种分配都有确定规则。餐盘会按规则实际分开，谁吃饱、谁吃到喜欢的，都进入后面的回应。') + chooseCards(s, s.engine.choices(s.run), 'choice') + rules(s) + '<div class="ds-action-line">' + button('← 回审判庭', 'back', 'court', 'ds-outline') + '</div>';
  }
  function actionView(s) {
    return heading('05 / 轮回司 · 把意图做成行动', s.engine.meta.actionTitle, s.id === 'midnight' ? '这里显示的是本单与前序选择共同决定的实际耗时。窗口失效的策略不能选，改单时也不会自动替你另选。' : '分餐已经落实。坐下还是打包，是最后一次取舍；钱、时间、实际份量和口味一起决定这一晚。') + chooseCards(s, s.engine.actions(s.run), 'action') + rules(s) + '<div class="ds-action-line">' + button(s.id === 'midnight' ? '← 再想想怎样开工' : '← 再想想怎样分餐', 'back', 'choice', 'ds-outline') + '</div>';
  }
  function timeline(s, result, small, divergence) {
    const events = result.timeline || [];
    return '<ol class="ds-timeline' + (small ? ' ds-timeline-small' : '') + '">' + events.map(event => '<li class="' + (event.id === divergence || event.blocked || event.id === 'blocked' ? 'ds-divergence' : '') + '"><span class="ds-event-time">' + clock(s.engine.meta, event.resources?.elapsed) + '</span><strong>' + esc(event.title) + '</strong>' + (event.stage === 'result' ? '' : '<p>' + esc(event.text) + '</p>') + '<div class="ds-event-state">' + (s.engine.meta.resources || []).map(resource => esc(resource.label) + ' ' + esc(resourceText(s.engine.meta, resource, event.resources?.[resource.key]))).join(' · ') + '</div></li>').join('') + '</ol>';
  }
  function linkField(s) { return s.sharedLink ? '<label class="ds-link-field">公开重玩链接 · 可选中后手动复制<input id="dsReplayLink" type="text" readonly value="' + esc(s.sharedLink) + '"></label>' : ''; }
  function replayGuide(s) {
    const key = (window.McReplayGuide ? 'guide:' : 'manual:') + JSON.stringify(s.run);
    if (s.guideKey !== key || !s.guide) {
      s.guide = window.McReplayGuide ? window.McReplayGuide.analyze(s.engine, s.run) : {best: null, candidates: [], blocked: [], total: 0, headline: '可以手动换一份，查看原计划怎样变化。', detail: '保持所有后续选择，比较由原引擎重新结算。'};
      s.guideKey = key;
    }
    return s.guide;
  }
  function outcomeChips(s, result) {
    const r = result.resources;
    const chips = s.id === 'midnight' ? [
      {text: r.elapsed <= s.engine.meta.deadlineMinutes ? '准时提交' : '迟交 ' + number(r.elapsed - s.engine.meta.deadlineMinutes) + ' 分钟', good: r.elapsed <= s.engine.meta.deadlineMinutes},
      {text: r.errors ? '遗留 ' + r.errors + ' 处错误' : '已知错误清零', good: !r.errors},
      {text: r.quality >= 75 ? '质量达到打磨门槛' : '细节还欠打磨', good: r.quality >= 75}
    ] : [
      {text: r.ownSatiety >= 50 && r.friendSatiety >= 50 ? '两个人都吃够' : r.friendSatiety < 50 ? 'TA还没吃够' : '你还饿着', good: r.ownSatiety >= 50 && r.friendSatiety >= 50},
      {text: result.scene.conversation ? '把话聊开了' : '这次没有深谈', good: !!result.scene.conversation},
      {text: result.scene.reservedSeat ? '保住双人位' : '错过双人位', good: !!result.scene.reservedSeat}
    ];
    return '<div class="ds-outcomes">' + chips.map(chip => '<span class="' + (chip.good ? 'ds-gain' : 'ds-loss') + '">' + esc(chip.text) + '</span>').join('') + '</div>';
  }
  function friendAfterword(s, result) {
    const r = result.resources, spicy = result.scene.trays?.friend?.some(item => item.name === '麦辣鸡腿堡' && item.servings > 0);
    let prompt, reply;
    if (spicy) { prompt = '接一句：刚才没听仔细。'; reply = 'TA把辣堡旁边的餐纸叠了一下：“下次先问我吧。便宜和我想吃什么，可以一起算。”'; }
    else if (r.friendSatiety < 50) { prompt = '接一句：这一份确实留少了。'; reply = 'TA笑了笑：“我知道你想省一点。下次先看看，我们是不是都能吃够。”'; }
    else if (r.ownSatiety < 50) { prompt = '接一句：下次换你来点。'; reply = 'TA看看你的餐盘：“成交。下次也给你留够一份，别总拿自己的那半顿去凑。”'; }
    else if (result.scene.conversation) { prompt = '接一句：我在，你慢慢说。'; reply = result.scene.reservedSeat ? 'TA终于把肩膀放松下来：“也不是要你马上帮我解决，就是想有人听完。”' : 'TA看看已经被占的座位，又看向你：“地方再找一个吧。刚才那句话，我还想说完。”'; }
    else if (s.run.response === 'drop') { prompt = '接一句：那句话，下次再聊。'; reply = 'TA把餐盒放在书旁：“好。下次我们早点吃，不用一边看钟，一边想怎么开口。”'; }
    else { prompt = '接一句：你刚才还想说什么？'; reply = 'TA停了一下：“今天先吃饭吧。”有些话，不能靠一顿合格的晚饭立刻换来。'; }
    return '<div class="ds-afterword"><span>餐桌后话 · 时间停在 ' + clock(s.engine.meta, r.elapsed) + '</span><p class="ds-afterword-prompt">' + esc(result.scene.message) + '</p>' + button(s.afterword ? '收起餐桌后话' : prompt, 'afterword', null, 'ds-outline') + (s.afterword ? '<p class="ds-afterword-reply" role="status">' + esc(reply) + '</p>' : '') + '</div>';
  }
  function midnightAfterword(s, result) {
    const r = result.resources, onTime = r.elapsed <= s.engine.meta.deadlineMinutes;
    const received = onTime ? '昨晚的提交准时收到了。' : '我看到你在' + clock(s.engine.meta, r.elapsed) + '补交了版本。迟交记录还在，不能用质量抵掉；我们得一起把说明补上。';
    const version = r.errors > 0 ? '演示里还留着' + number(r.errors) + '处已知错误，今天先列给组里，别让上台的人临时踩坑。不是让你一个人继续熬，我们一起查。' : r.quality >= 75 ? '首页、交互和手机布局都核验过了，说明也达到了完整版本的要求。早上打开时能看见你留下的打磨，谢谢你把这份演示认真收好了。' : '核心路径能演示，已知错误也清掉了。表达和边界还欠一点，今天就按可运行版的范围讲；余下的细节，我们一起补。';
    const strategy = s.run.work === 'peer' ? '昨晚评审那一轮的记录还在，接下来不用从头猜。' : s.run.work === 'polish' ? '你选了深度打磨，时间的代价和留下的成果都写在这版里。' : '先交可运行版，是一次明确的取舍；今天把它能做到什么讲清楚就好。';
    const evidence = s.run.argument === 'evidence' ? '复现步骤也留下了，我能顺着记录接手。' : '下一轮我们先整理复现步骤，让核验早点进入进度。';
    return '<details class="ds-afterword ds-midnight-afterword"><summary>翌日，小林看到了提交</summary><span>次日上午的消息 · 本局停在 ' + clock(s.engine.meta, r.elapsed) + '</span><p class="ds-afterword-reply">' + esc('小林：“' + received + version + '”') + '</p><p class="ds-afterword-context">' + esc(strategy + evidence) + '</p></details>';
  }
  function resultView(s) {
    const result = s.engine.resolve(s.run);
    if (result.blocked) return heading('轮回司 / 因果断点', '这一条线，未能完成。', result.reason) + timeline(s, result) + '<div class="ds-action-line">' + button('重新选择行动', 'back', 'action', 'ds-primary') + button('回去改订单', 'back', 'order', 'ds-outline') + '</div>';
    unlock(s, result);
    const guide = replayGuide(s), candidate = guide.best;
    const shortText = result.ending.text.split('。')[0] + '。';
    return '<header class="ds-result-heading"><span class="ds-kicker">轮回司 / 这一单留下的得失</span><h2>' + esc(result.ending.name) + '</h2>' + outcomeChips(s, result) + '<p>' + esc(shortText) + '</p></header>' +
      '<div class="ds-tear-prompt ds-experiment"><span class="ds-kicker">只换一份 / 一个新问题</span><strong>' + esc(candidate ? candidate.question : guide.headline) + '</strong>' +
      '<p>' + esc(candidate ? '其他选择都锁定。亲自看看，从哪一步开始不一样。' : guide.detail) + '</p>' + button(esc(candidate ? candidate.buttonLabel.replace(/\s*↗\s*$/, '') : '手动换一份，查看断点') + ' <span aria-hidden="true">↗</span>', 'compare-open', null, 'ds-primary ds-experiment-button') + '</div>' +
      (s.id === 'friend' ? friendAfterword(s, result) : midnightAfterword(s, result)) +
      '<details class="ds-causal-details"><summary>展开完整因果链 · 看这一单怎样走到这里</summary><p class="ds-full-ending">' + esc(result.ending.text) + '</p>' + timeline(s, result) + '</details>' +
      '<div class="ds-share-row">' + button('保存命运小票 PNG', 'receipt') + button('复制公开重玩链接', 'link') + button('这一局的档案', 'archive') + '</div>' + linkField(s) + rules(s) +
      '<details class="ds-session-note"><summary>本局数据记录</summary><p>种子 ' + s.run.seed + ' · ' + esc(s.run.snapshot.date) + ' · 数据已冻结 · ' + esc(s.run.snapshot.source || '内置演示菜单') + '</p></details><div class="ds-action-line">' + button('回取餐台调整订单', 'back', 'order', 'ds-outline') + button('全新的一局', 'new', s.id, 'ds-outline') + '</div>';
  }
  function prepareComparison(s, manual) {
    const names = Object.keys(s.run.cart).filter(name => s.run.cart[name] > 0), items = catalog(s);
    if (!manual) { const best = replayGuide(s).best; if (best) { s.from = best.from; s.to = best.to; } }
    if (!names.includes(s.from)) s.from = names[0] || '';
    if (!items.some(item => item.name === s.to) || s.to === s.from) s.to = items.find(item => item.name !== s.from)?.name || '';
    s.comparison = s.engine.compare(s.run, {from: s.from, to: s.to});
    if (!s.comparison.alternate.blocked) unlock(s, s.comparison.alternate);
  }
  function compareColumn(s, label, result, cart, first) {
    return '<article class="ds-compare-column"><span class="ds-kicker">' + label + '</span><h3>' + esc(result.blocked ? '未完成 · 停在断点' : result.ending.name) + '</h3><p class="ds-compare-cart">' + Object.entries(cart || {}).map(([name, qty]) => esc(name) + ' × ' + qty).join(' · ') + '</p>' + timeline(s, result, true, first?.id) + '<div class="ds-compare-ending' + (result.blocked ? ' ds-blocked' : '') + '"><strong>' + esc(result.blocked ? '保留原意图，无法继续' : result.ending.name) + '</strong><p>' + esc(result.blocked ? result.reason : result.ending.text) + '</p></div></article>';
  }
  function compareView(s) {
    if (!s.comparison) prepareComparison(s);
    const comp = s.comparison, a = comp.original.resources, b = comp.alternate.resources, first = comp.firstDivergence;
    const names = Object.keys(s.run.cart).filter(name => s.run.cart[name] > 0), items = catalog(s);
    const delta = (s.engine.meta.resources || []).map(resource => {
      const amount = Number(b[resource.key] || 0) - Number(a[resource.key] || 0);
      const unfinishedMoney = comp.alternate.blocked && resource.format === 'money';
      const label = unfinishedMoney ? '最终' + resource.label : resource.label + (comp.alternate.blocked ? '差*' : '变化');
      const value = unfinishedMoney ? '未完成' : resource.format === 'money' ? (amount > 0 ? '+' : amount < 0 ? '−' : '') + money(Math.abs(amount)) : signed(amount);
      return '<div><small>' + esc(label) + '</small><b>' + esc(value) + '</b></div>';
    }).join('');
    const oracle = s.engine.meta.oracles.find(value => value.id === s.run.oracle);
    const lockedChoices = [oracle?.title || s.run.oracle, s.run.coupon ? '核券意图保留' : '不用券', s.engine.arguments(s.run).find(value => value.id === s.run.argument)?.title, s.engine.choices(s.run).find(value => value.id === s.run[s.engine.meta.choiceField])?.title, s.engine.actions(s.run).find(value => value.id === s.run[s.engine.meta.actionField])?.title].filter(Boolean);
    return heading('轮回司 / 一行订单，两条因果', '只换一份，其他选择原封不动。', '保持同一菜单快照和种子。换品让原计划失效时，就停在真实断点，不自动帮你换策略。') +
      '<p class="ds-comparison-summary">' + esc(window.McReplayGuide ? window.McReplayGuide.describe(s.engine, s.run, comp) : '只替换一份 ' + s.from + ' → ' + s.to + '，其余输入保持相同。') + '</p>' +
      '<div class="ds-replace-form"><label>拿走原订单中的一份<select id="dsReplaceFrom">' + names.map(name => '<option value="' + esc(name) + '"' + (s.from === name ? ' selected' : '') + '>' + esc(name) + '</option>').join('') + '</select></label><span aria-hidden="true">→</span><label>只放回另一份<select id="dsReplaceTo">' + items.filter(item => item.name !== s.from).map(item => '<option value="' + esc(item.name) + '"' + (s.to === item.name ? ' selected' : '') + '>' + esc(item.name) + '</option>').join('') + '</select></label></div>' +
      '<p class="ds-locks">已锁定：' + lockedChoices.map(esc).join(' / ') + '。</p><div class="ds-deltas"><div><small>' + (comp.alternate.blocked ? '完成时间' : '完成时间差') + '</small><b>' + (comp.alternate.blocked ? '未完成' : signed(b.elapsed - a.elapsed) + '′') + '</b></div>' + delta + '</div>' +
      '<div class="ds-first-divergence"><strong>第一次分岔</strong><p>' + esc(first ? first.title + '。' + first.text : '本次替换没有改变后续资源与结局。') + '</p></div>' +
      (comp.alternate.blocked ? '<p class="ds-alert">* 替换线停在 ' + clock(s.engine.meta, b.elapsed) + '，未完成原行动。资源按断点状态对照，不能解释为最终收益或更快完成。</p>' : '') +
      '<div class="ds-compare-columns">' + compareColumn(s, 'A / 原订单', comp.original, s.run.cart, first) + compareColumn(s, 'B / 只换一份', comp.alternate, comp.changedCart || comp.alternateRun.cart, first) + '</div><div class="ds-action-line">' + button('← 回原来的结局', 'return', null, 'ds-primary') + button('重新点一整单', 'reorder', null, 'ds-outline') + '</div>';
  }
  function archiveView(s) {
    const endings = s.engine.endings || [];
    const hints = {
      'midnight-on-high': '在截止前交出无错误、质量达到75的版本。',
      'midnight-on-runnable': '先保住截止和可运行，允许细节还没打磨完。',
      'midnight-on-buggy': '准时按下提交键，看看遗留错误会跟到哪里。',
      'midnight-late-high': '为了完整版本，愿不愿意承担迟交记录？',
      'midnight-late-runnable': '错误清掉了，时间有没有一起照顾到？',
      'midnight-late-buggy': '醒着和多熬，并不保证写对；试着看看那条代价。',
      'friend-dialogue': '让两人吃够、信任达到60，还赶得上18:30占位。',
      'friend-missed-seat': '给彼此留出聊天时间，座位又会发生什么？',
      'friend-spicy-silence': 'TA说了今天不想吃辣，这句话进了订单吗？',
      'friend-left-hungry': '你吃够了的时候，TA的餐盘里还有多少？',
      'friend-self-hungry': '把好的一份留给TA，也看看自己付出的饥饿。',
      'friend-both-hungry': '总价便宜，不代表小食能变成两顿晚饭。',
      'friend-room-delivery': '两人吃够又合口味，把这次深谈留到以后。',
      'friend-quiet-meal': '饭够了，信任是否足以接住另一句话？'
    };
    return heading('轮回司 / ' + s.engine.meta.name + '专属档案', '这些后果，你亲自走过。', '只记录已经完成的因果线；没有通关的存档，仍然从原来的阶段继续。') +
      '<div class="ds-collection">' + endings.map((ending, index) => { const saved = s.collection[ending.id]; return '<article class="ds-collection-card' + (!saved ? ' ds-locked' : '') + '"><span>' + (saved ? '已走过的回响' : '线索 ' + String(index + 1).padStart(2, '0')) + '</span><h3>' + esc(saved ? ending.name : '还有一种可能') + '</h3><p>' + esc(saved ? saved.text || ending.text : hints[ending.id] || '再换一份，看看哪个后果先改变。') + '</p></article>'; }).join('') + '</div><p class="ds-session-note">已完成 ' + Object.keys(s.collection).length + ' / ' + endings.length + ' 种结局。档案保存在当前浏览器；清除站点数据会移除。</p><div class="ds-action-line">' + button('继续这一局', 'return', null, 'ds-primary') + button('全新的一局', 'new', s.id, 'ds-outline') + '</div><div class="ds-cross-links"><span>翻到另一页</span>' + button('早八档案', 'morning-archive') + button(s.id === 'midnight' ? '饭搭子档案' : '凌晨档案', 'other-archive', s.id === 'midnight' ? 'friend' : 'midnight') + '</div>';
  }
  function foodImages(s, names) {
    const items = catalog(s);
    return names.map(name => { const item = items.find(value => value.name === name); return item ? '<img src="' + esc(item.img) + '" alt="' + esc(name) + '">' : ''; }).join('');
  }
  function midnightMessage(s, data, result) {
    const elapsed = Number(data.elapsed || 0), title = s.engine.meta.personName || '组员小林';
    if (result && s.run.work === 'peer' && !result.blocked) {
      const started = result.timeline.find(event => event.stage === 'choice')?.resources?.elapsed || 0;
      return {label: title + ' · ' + clock(s.engine.meta, started) + ' 评审时记录', text: data.errors ? '核心路径看过了，但最终版本又留下了回归错误。演示前记得把它写进已知问题。' : '首页、按钮和手机布局都过了核验。版本现在能演示；还没写透的地方，别假装它已经完整。'};
    }
    if (elapsed > 12) return {label: title + ' · 01:36 离线前留言', text: '“我先睡了，评审窗口到这里。你还可以自己完成提交，别把待检查当成已通过。”'};
    const label = title + ' · ' + clock(s.engine.meta, elapsed) + (s.stage === 'order' ? ' 订单预估时刻' : ' 在线');
    if (s.stage === 'oracle') return {label, text: '我们小组明天要演示网页。首页、按钮、手机布局这三项先保住，再想怎么把它讲完整。'};
    if (s.stage === 'order') return {label, text: '夜宵能改变你的状态，不能替你点开那三个检查项。先看你准备拿多少分钟去换。'};
    if (s.stage === 'court') return {label, text: '金额没有问题。网页的问题有没有复现步骤？有的话，先拿出来查一遍。'};
    if (s.stage === 'choice') return {label, text: data.errors < 3 ? '复现记录收到，至少有一项已经查清。现在是继续冲，还是缓一下再看？' : '三项还在待检查列表。省下核验时间，问题不会自己消失。'};
    if (s.stage === 'action') return {label, text: s.run.approach === 'break' ? '你歇过这一口气了。要我评审就赶在窗口内发来；自己打磨也记得看截止线。' : '你选了继续冲。现在能交哪一版，得把时间和可能留下的错误一起看。'};
    return {label, text: data.errors ? '提交记录有了，已知问题也记上。明早演示时，我们得把边界说清楚。' : '能演示的核心保住了。之后再一起补细节，别靠一个绿色按钮判断全部完成。'};
  }
  function projectChecks(data) {
    const errors = Math.max(0, Number(data.errors || 0)), names = ['首页可以打开', '按钮完成核心交互', '手机布局不溢出'];
    return '<ul class="ds-project-checks" aria-label="小组网页演示检查单">' + names.map((name, index) => { const passed = index < Math.max(0, 3 - errors); return '<li class="' + (passed ? 'ds-check-pass' : 'ds-check-pending') + '"><span aria-hidden="true">' + (passed ? '✓' : '!') + '</span><strong>' + name + '</strong><small>' + (passed ? '已核验' : '待修复') + '</small></li>'; }).join('') + (errors > 3 ? '<li class="ds-check-pending"><span aria-hidden="true">!</span><strong>另有 ' + number(errors - 3) + ' 处回归错误</strong><small>待修复</small></li>' : '') + '</ul>';
  }
  function midnightScene(s, data) {
    const elapsed = Number(data.elapsed || 0), final = ['result', 'compare'].includes(s.stage), result = final ? s.engine.resolve(s.run) : null;
    const status = result?.scene?.status || (s.stage === 'oracle' ? '分支尚未创建' : s.stage === 'order' ? '订单预估 / 未执行' : s.stage === 'court' ? '等待复现证据' : s.stage === 'choice' ? '准备开工' : '等待提交决策');
    const message = midnightMessage(s, data, result);
    return '<aside class="ds-scene ds-midnight-scene" aria-label="凌晨编辑器现场"><div class="ds-window-bar"><span class="ds-window-dots" aria-hidden="true">● ● ●</span><span>小组网页演示 / campus-demo.html</span></div><div class="ds-editor-tabs"><span class="ds-tab-active">演示检查单</span><span>review.log</span><span>' + esc(status) + '</span></div>' + projectChecks(data) + '<div class="ds-terminal"><span>PROBLEMS / 当前版本</span><p class="' + (data.errors ? 'ds-code-red' : 'ds-code-green') + '">' + (Number(data.errors) ? number(data.errors) + ' 个未修复错误' : '没有遗留错误') + '</p><p>烦躁 ' + number(data.strain) + '/100 · 已用 ' + number(elapsed) + ' 分钟</p><p>' + (final ? '这条因果线已停止执行。' : '只在作出选择时推进。') + '</p></div><div class="ds-scene-message"><span>' + esc(message.label) + '</span><p>' + esc(message.text) + '</p></div><div class="ds-desk-food">' + (Object.keys(s.run.cart).length ? foodImages(s, Object.keys(s.run.cart)) : '<span>空餐盘，旁边是还没提交的演示网页。</span>') + '</div></aside>';
  }
  function trayView(s, data, who, trays) {
    const self = who === 'self', tray = trays?.[who], amount = self ? data.ownSatiety : data.friendSatiety;
    let contents = '';
    if (Array.isArray(tray)) contents = tray.map(item => { const name = item.name || item.food; return '<div class="ds-tray-item">' + foodImages(s, [name]) + '<span>' + esc(name) + ' × ' + number(item.servings ?? item.quantity ?? item.qty ?? item.share) + '</span>' + (item.taste ? '<small>' + esc(item.taste) + '</small>' : '') + '</div>'; }).join('');
    else if (tray?.items) contents = tray.items.map(item => '<div class="ds-tray-item">' + foodImages(s, [item.name]) + '<span>' + esc(item.name) + ' × ' + number(item.quantity ?? item.qty ?? item.share) + '</span></div>').join('');
    return '<div class="ds-person-tray ' + (self ? 'ds-my-tray' : 'ds-friend-tray') + '"><div><strong>' + (self ? '你的餐盘' : 'TA 的餐盘') + '</strong><span>饱腹 ' + number(amount) + ' 分</span></div><div class="ds-tray-food">' + (contents || '<span>' + (['action', 'result', 'compare'].includes(s.stage) ? '按所选规则分配 · 份量进入饱腹' : '先点单，再决定谁吃到什么') + '</span>') + '</div></div>';
  }
  function friendsScene(s, data, p) {
    const final = ['result', 'compare'].includes(s.stage), result = final ? s.engine.resolve(s.run) : null;
    const allocated = ['action', 'result', 'compare'].includes(s.stage);
    const trays = allocated ? result?.scene?.trays || p.trays || data.trays : null;
    const received = trays?.friend || [], hasSpicy = received.some(item => item.name === '麦辣鸡腿堡' && item.servings > 0), hasFish = received.some(item => item.name === '麦香鱼' && item.servings > 0);
    const message = !allocated ? (s.stage === 'oracle' ? '我还没吃。今天不想吃辣，想吃喜欢的那一口，也想和你坐一会儿。' : s.stage === 'order' ? '你先看看菜单。点什么、怎么分，咱们可以说清楚。' : s.stage === 'court' ? '总价不等于我们每个人都吃好了。你听见我想吃什么了吗？' : '餐在这里了。你准备怎么分？') :
      hasSpicy ? '我今天真的不想吃辣。餐盘里这份辣堡，和刚才说的有点不一样。' : data.friendSatiety < 50 ? '谢谢你留了一口。不过这点还不够一顿，我还得找点吃的。' : data.ownSatiety < 50 ? '我的够了，你那边是不是太少？别总拿自己的半顿来凑。' : result?.scene.conversation ? '你真的听完了。最近我有点撑不住，能再说两句吗？' : final ? (s.run.response === 'drop' ? '晚饭收到。先一起自习吧，想聊的那句话，下次补上。' : hasFish ? '你记得我想吃鱼，这一口我喜欢。刚才想说的……今天先慢慢来。' : '晚饭吃够了。刚才那句话……今天先不急着说完。') : hasFish ? '你记得我想吃鱼。这一口我喜欢，等会儿我们怎么安排？' : '我这份够了。现在轮到我们决定，要不要坐下来。';
    return '<aside class="ds-scene ds-friends-scene" aria-label="饭搭子双人餐桌现场"><div class="ds-table-label"><span>TABLE FOR TWO / 18:10</span><span>' + (final ? '这一晚已归档' : '还有一句话没说完') + '</span></div><div class="ds-table-message"><span>' + esc(s.engine.meta.personName || '饭搭子') + ' / ' + clock(s.engine.meta, data.elapsed) + '</span><p>' + esc(message) + '</p></div><div class="ds-table-surface"><div class="ds-seat ds-seat-one">你</div>' + trayView(s, data, 'self', trays) + '<div class="ds-table-between"><span>' + (allocated ? esc(s.engine.choices(s.run).find(choice => choice.id === s.run.allocation)?.title || '') : '尚未分餐') + '</span><i aria-hidden="true">✦</i></div>' + trayView(s, data, 'friend', trays) + '<div class="ds-seat ds-seat-two">TA</div></div><div class="ds-table-trust"><span>信任</span><strong>' + number(data.trust) + '<small> 游戏分</small></strong><p>' + esc(result?.scene?.status || '份量、口味与相处，会让这张桌子发生变化。') + '</p></div></aside>';
  }
  function frame(s, body, p, data) {
    const meta = s.engine.meta, count = Object.keys(s.collection).length, total = s.engine.endings.length;
    const masthead = '<div class="ds-top"><span>' + (s.stage === 'result' ? esc(meta.name) + ' / 本局结局' : 'McMULTIVERSE / FIELD ' + (s.id === 'midnight' ? '002' : '003')) + '</span><div>' + button('← 回大殿', 'home') + button('档案 ' + count + '/' + total, 'archive') + '</div></div><div class="ds-title-row"><div><span class="ds-kicker">' + (s.id === 'midnight' ? 'ONE MORE COMMIT. ONE LESS MINUTE.' : 'ONE ORDER. TWO DIFFERENT APPETITES.') + '</span><h1>' + esc(meta.name) + '<span>。</span></h1></div><p>思考不会走时。<br>每一次选择，才留下后果。</p></div>';
    const notice = '<p class="ds-notice" id="dsNotice" role="status" aria-live="polite">' + esc(s.notice || (s.storageWarning ? '当前浏览器限制本地存储；这一局仍可玩，关闭后不会保存。' : '')) + '</p>';
    const wide = ['compare', 'archive'].includes(s.stage);
    return masthead + (s.stage === 'archive' ? '' : hud(s, data)) + '<div class="ds-layout' + (wide ? ' ds-wide' : '') + '"><div class="ds-main">' + (['archive', 'compare', 'result'].includes(s.stage) ? '' : progress(s)) + body + notice + '</div>' + (wide ? '' : s.id === 'midnight' ? midnightScene(s, data) : friendsScene(s, data, p)) + '</div><footer class="ds-footer"><span>虚构情景与游戏规则 · 无真实倒计时</span><span>一份订单，不只结算价钱。</span></footer>';
  }
  function render(moveFocus) {
    const s = current(); if (!s?.run) return;
    const p = preview(s), data = resourcesAt(s, p), views = {oracle: oracleView, order: orderView, court: courtView, choice: choiceView, action: actionView, result: resultView, compare: compareView, archive: archiveView};
    section.classList.toggle('ds-midnight', s.id === 'midnight'); section.classList.toggle('ds-friend', s.id === 'friend');
    section.classList.toggle('ds-is-result', s.stage === 'result');
    section.innerHTML = frame(s, (views[s.stage] || oracleView)(s), p, data);
    if (moveFocus) { const heading = section.querySelector('.ds-main h2'); if (heading) { heading.tabIndex = -1; heading.focus({preventScroll: true}); } section.scrollIntoView({block: 'start', behavior: 'instant'}); }
  }
  function renderError(message) { section.innerHTML = '<div class="ds-error"><h2>这一张重玩单暂时读不了。</h2><p>' + esc(message) + '</p><div class="ds-action-line">' + button('从当前菜单开启新局', 'new', activeId, 'ds-primary') + button('回大殿', 'home') + '</div></div>'; }
  async function copyLink(s) {
    if (!/^https?:$/.test(location.protocol)) { s.notice = '公开重玩链接需要 HTTP 地址，可以先保存命运小票。'; render(false); return; }
    s.sharedLink = location.origin + location.pathname + s.engine.encode(s.run); render(false);
    try { await navigator.clipboard.writeText(s.sharedLink); s.notice = '已复制公开重玩链接。菜单版本一致时，会重现这一单与所有选择。'; }
    catch (error) { s.notice = '请选中下面的重玩链接，手动复制。'; }
    const node = section.querySelector('#dsNotice'); if (node) node.textContent = s.notice;
  }
  async function saveReceipt(s) {
    const result = s.engine.resolve(s.run); if (result.blocked) return;
    const lines = [...Object.entries(s.run.cart).map(([name, qty]) => name + ' × ' + qty), '实付 ' + money(result.quote.finalCents) + ' · 完成 ' + clock(s.engine.meta, result.resources.elapsed), ...(s.engine.meta.resources || []).map(resource => resource.label + ' ' + resourceText(s.engine.meta, resource, result.resources[resource.key])), ...result.timeline.map(event => clock(s.engine.meta, event.resources?.elapsed) + ' ' + event.title), '结局 ' + result.ending.id, '种子 ' + s.run.seed + ' · ' + s.run.snapshot.date, '虚构情景与游戏规则 · 非真实消费凭证'];
    await window.McJourney.saveReceipt({title: '麦门宇宙 · ' + s.engine.meta.name, subtitle: result.ending.name, lines});
    s.notice = '命运小票已生成，请查看浏览器下载。'; const node = section.querySelector('#dsNotice'); if (node) node.textContent = s.notice;
  }
  function resetAfterOrder(s) {
    const fresh = s.engine.makeRun(s.run.snapshot, s.run.seed);
    s.run.argument = fresh.argument; s.run[s.engine.meta.choiceField] = fresh[s.engine.meta.choiceField]; s.run[s.engine.meta.actionField] = fresh[s.engine.meta.actionField];
  }
  async function handleClick(event) {
    const target = event.target.closest('[data-ds-action]'); if (!target || !section.contains(target) || target.disabled) return;
    const action = target.dataset.dsAction, value = target.dataset.dsValue;
    if (action === 'home') { if (typeof go === 'function') go('hall'); return; }
    if (action === 'new') return startDeepSession(value || activeId);
    if (action === 'other-archive') return showSessionArchive(value);
    if (action === 'morning-archive') { window.showMorningCollection?.(); return; }
    const s = current(); if (!s?.run) return;
    if (action === 'afterword') { s.afterword = !s.afterword; render(false); section.querySelector('[data-ds-action="afterword"]')?.focus({preventScroll: true}); return; }
    s.notice = ''; let moveFocus = true;
    try {
      if (action === 'oracle') { s.run.oracle = value; s.run.coupon = false; resetAfterOrder(s); s.stage = 'order'; }
      else if (action === 'qty') { const qty = (s.run.cart[value] || 0) + Number(target.dataset.dsDelta); if (qty > 0) s.run.cart[value] = qty; else delete s.run.cart[value]; resetAfterOrder(s); moveFocus = false; }
      else if (action === 'next') { if (!preview(s).valid) return; s.stage = value; }
      else if (action === 'argument') { const item = s.engine.arguments(s.run).find(entry => entry.id === value); if (!item || item.available === false) return; s.run.argument = value; s.stage = 'choice'; }
      else if (action === 'choice') { const item = s.engine.choices(s.run).find(entry => entry.id === value); if (!item || item.available === false) return; s.run[s.engine.meta.choiceField] = value; s.stage = 'action'; }
      else if (action === 'action') { const item = s.engine.actions(s.run).find(entry => entry.id === value); if (!item || item.available === false) return; s.run[s.engine.meta.actionField] = value; s.stage = 'result'; s.sharedLink = ''; s.afterword = false; }
      else if (action === 'back') { s.stage = value; if (value === 'order' || value === 'oracle') resetAfterOrder(s); }
      else if (action === 'compare-open') { s.stage = 'compare'; s.comparison = null; prepareComparison(s); }
      else if (action === 'archive') s.stage = 'archive';
      else if (action === 'return') { if (s.stage === 'archive') clearReplayHash(); s.stage = s.stage === 'archive' ? s.actualStage : 'result'; s.comparison = null; }
      else if (action === 'reorder') { s.run.cart = {}; s.run.coupon = false; resetAfterOrder(s); s.stage = 'order'; s.comparison = null; s.sharedLink = ''; }
      else if (action === 'link') return copyLink(s);
      else if (action === 'receipt') return saveReceipt(s);
      if (['oracle', 'qty', 'next', 'argument', 'choice', 'action', 'back', 'reorder'].includes(action)) clearReplayHash();
      persist(s); render(moveFocus);
      if (action === 'qty') { const equivalent = Array.from(section.querySelectorAll('[data-ds-action="qty"]')).find(node => node.dataset.dsValue === value && node.dataset.dsDelta === target.dataset.dsDelta && !node.disabled); equivalent?.focus({preventScroll: true}); }
    } catch (error) { s.notice = error.message; render(false); }
  }
  function handleChange(event) {
    const s = current(); if (!s?.run) return;
    s.notice = '';
    try {
      if (event.target.id === 'dsCoupon') { s.run.coupon = event.target.checked; resetAfterOrder(s); clearReplayHash(); persist(s); render(false); section.querySelector('#dsCoupon')?.focus({preventScroll: true}); }
      else if (event.target.id === 'dsReplaceFrom' || event.target.id === 'dsReplaceTo') { s.from = section.querySelector('#dsReplaceFrom').value; s.to = section.querySelector('#dsReplaceTo').value; const id = event.target.id; prepareComparison(s, true); render(false); section.querySelector('#' + id)?.focus({preventScroll: true}); }
    } catch (error) { s.notice = error.message; render(false); }
  }
  async function replayFromLocation() {
    const params = new URLSearchParams(location.hash.slice(1)); if (!params.has('ep')) return;
    await ready(); const id = params.get('s');
    if (!IDS.includes(id)) { openSection(); renderError('公开重玩单的情景不受支持。'); return; }
    activeId = id; const s = current();
    try { s.run = s.engine.decode(location.hash, window.McJourney.captureData()); s.stage = s.actualStage = 'result'; s.comparison = null; s.sharedLink = ''; s.afterword = false; s.notice = '公开重玩单已载入：同一份订单、同一神谕和所有选择。'; openSection(); persist(s); render(true); }
    catch (error) { openSection(); renderError(error.message); }
  }
  function init() {
    if (initialized) return;
    if (!window.McMidnight || !window.McFriends || !window.McJourney?.captureData) throw Error('两局模块未完整加载，请刷新后再试。');
    IDS.forEach(id => {
      const engine = (id === 'midnight' ? window.McMidnight : window.McFriends).createEngine(quoteOrder);
      const s = states[id] = {id, engine, run: null, stage: 'oracle', actualStage: 'oracle', collection: {}, comparison: null, notice: '', sharedLink: '', from: '', to: '', storageWarning: false};
      const saved = readStorage(id); if (!saved || saved.version !== 1) return;
      if (saved.collection && typeof saved.collection === 'object' && !Array.isArray(saved.collection)) {
        engine.endings.forEach(ending => { const entry = saved.collection[ending.id]; if (entry && typeof entry.text === 'string' && typeof entry.name === 'string') s.collection[ending.id] = {id: ending.id, name: ending.name, text: entry.text.slice(0, 700), date: String(entry.date || '').slice(0, 20)}; });
      }
      if (saved.run && STAGES.includes(saved.stage)) {
        try { const restored = engine.restore(saved.run); if (saved.stage !== 'oracle' && !restored.oracle) return; if (!['oracle', 'order'].includes(saved.stage) && !engine.preview(restored).valid) return; s.run = restored; s.stage = s.actualStage = saved.stage; }
        catch (error) { s.run = null; }
      }
    });
    section = document.createElement('section'); section.id = 'deepSession'; section.className = 'hidden'; section.setAttribute('aria-label', '麦门宇宙 · 深度情景'); document.querySelector('main').appendChild(section);
    if (typeof SECTIONS !== 'undefined' && !SECTIONS.includes('deepSession')) SECTIONS.push('deepSession');
    section.addEventListener('click', handleClick); section.addEventListener('change', handleChange); section.addEventListener('focusin', event => { if (event.target.id === 'dsReplayLink') event.target.select(); });
    window.addEventListener('hashchange', replayFromLocation); initialized = true;
  }
  window.startDeepSession = startDeepSession; window.resumeDeepSession = resumeDeepSession; window.showSessionArchive = showSessionArchive;
  window.McSessionsUI = {start: startDeepSession, resume: resumeDeepSession, archive: showSessionArchive};
  function boot() { ready().then(replayFromLocation).catch(error => console.error(error)); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
