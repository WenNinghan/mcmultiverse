/* The new short game is isolated from the original three temples and mc=1 links. */
(function () {
  'use strict';
  const STORE_KEY = 'mcm_morning_v1';
  const STAGES = ['oracle', 'order', 'court', 'share', 'route', 'result'];
  const STAGE_NAMES = ['问神谕', '点早餐', '上法庭', '分一口', '去早八', '看回响'];
  let engine, section, run = null, stage = 'oracle', lastGameStage = 'oracle', collection = {}, comparison = null;
  let fromItem = '', toItem = '', notice = '', sharedLink = '', initialized = false, storageWarning = false;
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, s => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[s]));
  const money = cents => '¥' + (Number(cents || 0) / 100).toFixed(2);
  const clock = elapsed => { const value = 462 + Number(elapsed || 0); return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0'); };
  const clone = value => JSON.parse(JSON.stringify(value));
  function seed() { if (window.crypto && crypto.getRandomValues) { const value = new Uint32Array(1); crypto.getRandomValues(value); return value[0] || 1; } return (Date.now() >>> 0) || 1; }
  function getPreview(value) { return engine.preview(value || run); }
  function getCatalog() { return run ? engine.catalog(run) : []; }
  function resourceOf(result) { return result.resources || result; }
  function safeStorage() { try { const text = localStorage.getItem(STORE_KEY); return text ? JSON.parse(text) : null; } catch (e) { return null; } }
  function persist() {
    if (STAGES.includes(stage)) lastGameStage = stage;
    try { localStorage.setItem(STORE_KEY, JSON.stringify({version: 1, run, stage: lastGameStage, collection})); }
    catch (e) { storageWarning = true; }
  }
  function unlock(result) {
    if (result && result.ending && !result.blocked) {
      collection[result.ending.id] = {id: result.ending.id, name: result.ending.name, text: result.ending.text, date: run.snapshot.date};
      persist();
    }
  }
  function focusStage() {
    const heading = section.querySelector('.am-main h2');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({preventScroll: true}); }
  }
  function openSection() {
    if (typeof SECTIONS !== 'undefined' && !SECTIONS.includes('morning')) SECTIONS.push('morning');
    if (typeof go === 'function') go('morning');
    else section.classList.remove('hidden');
    window.scrollTo({top: 0, behavior: 'instant'});
  }
  async function ready() {
    if (window.MC_DATA_READY) await window.MC_DATA_READY;
    if (!initialized) init();
  }
  async function startMorning() {
    await ready();
    try {
      run = engine.makeRun(window.McJourney.captureData(), seed());
      stage = 'oracle'; lastGameStage = 'oracle'; comparison = null; sharedLink = ''; notice = '';
      clearReplayHash();
      openSection(); persist(); render(true);
    } catch (e) { openSection(); renderError(e.message); }
  }
  async function resumeMorning() {
    await ready();
    if (!run) return startMorning();
    comparison = null; sharedLink = ''; notice = '';
    if (!STAGES.includes(stage)) stage = lastGameStage;
    openSection(); render(true);
  }
  async function showMorningCollection() {
    await ready();
    if (!run) { run = engine.makeRun(window.McJourney.captureData(), seed()); lastGameStage = 'oracle'; }
    stage = 'archive'; comparison = null; notice = '';
    openSection(); render(true);
  }
  function clearReplayHash() {
    if (new URLSearchParams(location.hash.slice(1)).has('am')) history.replaceState(null, '', location.pathname + location.search);
  }
  function heading(kicker, title, description) {
    return '<header class="am-stage-head"><span class="am-kicker">' + kicker + '</span><h2>' + title + '</h2><p>' + description + '</p></header>';
  }
  function button(label, action, value, className, disabled) {
    return '<button class="am-action ' + (className || '') + '" data-am-action="' + action + '"' + (value != null ? ' data-am-value="' + esc(value) + '"' : '') + (disabled ? ' disabled' : '') + '>' + label + '</button>';
  }
  function choice(icon, label, title, text, footer, action, value, yellow, disabled) {
    return '<button class="am-choice' + (yellow ? ' am-choice-yellow' : '') + '" data-am-action="' + action + '" data-am-value="' + esc(value) + '"' + (disabled ? ' disabled' : '') + '><span class="am-choice-icon" aria-hidden="true">' + icon + '</span><small>' + label + '</small><strong>' + title + '</strong><p>' + text + '</p><span class="am-choice-footer">' + footer + '<b aria-hidden="true">↗</b></span></button>';
  }
  function rules() {
    return '<p class="am-rule-note"><strong>这一局的规则：</strong>餐品同时制作，等最慢的一份，再装袋 1 分钟。核券 +2 分钟，申辩 +1 分钟；自己吃 1 分钟，分餐 2 分钟。朋友分到至少 20 饱腹，关系 +30，否则只 +10；独食关系 −5。步行通常 12 分钟，近路 9 分钟；自己饱腹低于 55，再慢走 3 分钟。打车 ¥6 / 6 分钟。走到校车站还需 2 分钟，07:48 发车；08:00 前到场算准时。</p>';
  }
  function progress() {
    const current = stage === 'compare' || stage === 'archive' ? 5 : STAGES.indexOf(stage);
    return '<div class="am-progress" aria-label="本局进度">' + STAGE_NAMES.map((name, index) => '<span class="' + (index === current ? 'am-current' : index < current ? 'am-done' : '') + '"' + (index === current ? ' aria-current="step"' : '') + '>' + name + '</span>').join('') + '</div>';
  }
  function hud(result, estimated) {
    const data = resourceOf(result), elapsed = Number(data.elapsed || 0), wallet = data.wallet == null ? 1800 : data.wallet;
    const satiety = data.satiety == null ? 20 : data.satiety, relationship = data.relationship == null ? 40 : data.relationship;
    const remaining = 18 - elapsed;
    return '<div class="am-hud" aria-label="当前游戏状态">' + [
      {label: estimated ? '出发时余量' : '离早八', value: (remaining >= 0 ? remaining : '+' + Math.abs(remaining)) + '′', text: remaining >= 0 ? '剩余游戏时间' : '已经超过八点', percent: Math.max(0, remaining / 18 * 100), alert: remaining < 5},
      {label: estimated ? '预计余额' : '口袋里的钱', value: money(wallet), text: '起点 ¥18.00', percent: Math.max(0, wallet / 1800 * 100), alert: wallet < 0},
      {label: estimated ? '预计独食饱腹' : '饱腹', value: satiety + '/100', text: satiety < 55 ? '走路会慢 3 分钟' : '可以正常步行', percent: satiety, alert: satiety < 55},
      {label: estimated ? '独食后关系' : '饭搭子关系', value: relationship + '/100', text: relationship >= 60 ? '有人和你站一边' : '那条消息还悬着', percent: relationship, alert: false}
    ].map(item => '<div class="am-resource' + (item.alert ? ' am-alert' : '') + '"><small>' + item.label + '</small><strong>' + esc(item.value) + '</strong><span>' + item.text + '</span><div class="am-resource-meter" aria-hidden="true"><i style="width:' + Math.max(0, Math.min(100, item.percent)) + '%"></i></div></div>').join('') + '</div>';
  }
  function friendMessage(result) {
    if (stage === 'oracle' || stage === 'order') return '帮我带一份呗，昨晚没吃。<br>这节课还要签到……';
    if (stage === 'court') return '我到店门口了。<br>等你拿好，一起走吗？';
    if (stage === 'share') return '我就在旁边，分我一口也行。<br>你自己也得吃啊。';
    const resources = resourceOf(result);
    if (['result', 'compare', 'archive'].includes(stage) && result.ending) {
      if (resources.relationship >= 65) return result.onTime ? (resources.satiety >= 55 ? '位置留好了。<br>下顿换我给你带，成交！' : '先坐，签到我帮你递。<br>听见你肚子叫了，下顿我请。') : '签到表收走了……<br>来后排吧，笔记我给你留着。';
      return result.onTime ? '你到了就好。<br>我去买点吃的，先不等你了。' : '你也迟到了啊。<br>我还得自己去找份早餐。';
    }
    if (run.sharing === 'share') return resources.relationship >= 60 ? '你真分给我了！<br>笔记我给你留着，一起走。' : '收到啦。<br>别为了带饭把自己饿着。';
    return '行，你先顾好自己。<br>我再去小卖部看看。';
  }
  function scene(result) {
    const data = resourceOf(result), elapsed = Number(data.elapsed || 0), names = Object.keys(run.cart || {}).filter(name => run.cart[name] > 0), items = getCatalog();
    const arrived = ['result', 'compare', 'archive'].includes(stage) && !!result.ending;
    let images = names.slice(0, 3).map(name => { const item = items.find(x => x.name === name); return item ? '<img src="' + esc(item.img) + '" alt="' + esc(name) + '">' : ''; }).join('');
    if (!images) images = '<span class="am-tray-empty">你的托盘，还是空的。</span>';
    const bus = arrived ? (result.onTime ? '签到已完成 · 这一局已归档' : '签到表已收 · 这一局已归档') : elapsed <= 6 ? '校车还有 ' + (6 - elapsed) + ' 分钟' : '末班校车已经出发';
    return '<aside class="am-scene" aria-label="早八现场"><div class="am-station"><div class="am-station-top"><span>' + (arrived ? '教学楼 · 教室门口' : stage === 'order' ? '取餐台 · 出发预估' : stage === 'route' ? '校园南门 · 出发' : '校园南门 · 取餐台') + '</span><i class="am-live-light" aria-hidden="true"></i></div><div class="am-clock" aria-label="游戏时刻">' + clock(elapsed) + '</div><p class="am-clock-caption">早八签到 <b>08:00</b><br>' + (arrived ? '这一天的来处，都在小票上。' : stage === 'order' ? '未选分餐前，暂按独食估算。' : '思考不耗时，选择才走时。') + '</p><div class="am-bus-line">' + bus + '</div></div><div class="am-message"><div class="am-chat-label">饭搭子<span>新消息</span></div><p class="am-bubble">' + friendMessage(result) + '</p></div><div class="am-tray"><div class="am-tray-label"><span>' + (arrived ? '这一单留下的回声' : '取餐号 A08') + '</span><span>' + (names.length ? '订单已落笔' : '等待你点单') + '</span></div><div class="am-tray-food">' + images + '</div><p>' + (stage === 'oracle' ? '门外的车还在。<br>你可以先问神谕，再决定拿什么。' : names.length ? names.map(name => esc(name) + ' × ' + run.cart[name]).join(' · ') : '选一份早餐。没有默认答案。') + '</p></div><div class="am-signal"><span>McMULTIVERSE / FIELD 001</span><span>' + (arrived ? '● ARCHIVED' : '● LIVE') + '</span></div></aside>';
  }
  function oracleView() {
    return heading('01 / 神谕阁 · 一张签，只能带走一种帮助', '便宜这一口，<br>会不会错过<em>那班车？</em>', '07:42。你只有 18 块钱，校车六分钟后发车。饭搭子没吃早餐，你也饿着。先选一张签，再去取餐台。') +
      '<div class="am-opening-note">没有完美的一单。钱、时间、饱腹和关系，会一起留下后果。</div><div class="am-choices">' +
      choice('◷', 'THE CLOCK / 时刻签', '钱包之外，<br>时钟也要记账。', '给你一条步行近路的线索。到审判庭花 1 分钟申辩，才能获得路线。', '得线索 · 不直接减价', 'oracle', 'clock', true) +
      choice('▤', 'THE COUPON / 优惠签', '早餐可以便宜，<br>但核券不包赶车。', '猪柳蛋麦满分＋咖啡两件 ¥9.90，或两份薯饼 ¥9.90。启用演示券核验，花 2 分钟。', '得演示券 · 用券需 +2′', 'oracle', 'coupon', false) +
      '</div><p class="am-rule-note">游戏数值与券均为虚构演示，不代表真实营养、制作时间、活动或消费。没有真实倒计时。</p>';
  }
  function orderView() {
    const preview = getPreview(), menu = getCatalog(), count = Object.values(run.cart).reduce((sum, value) => sum + value, 0);
    const couponAvailable = run.oracle === 'coupon' && getPreview(Object.assign(clone(run), {coupon: true})).couponApplied;
    const foodTags = {'猪柳蛋麦满分': '热的，需要等', '火腿扒麦满分': '快一点，少一点', '脆薯饼': '一口脆，垫个底', '中杯鲜煮咖啡': '醒着，不等于饱着'};
    return heading('02 / 取餐台 · 让订单成为真正的起因', '今天吃什么，<br><em>后面就会不一样。</em>', '餐品同时制作，等最慢的一份，再装袋 1 分钟。最多四份，至少一份麦满分或薯饼；咖啡可以陪早餐，不能单独算早餐。') +
      '<div class="am-menu">' + menu.map(item => '<article class="am-food' + (run.cart[item.name] ? ' am-selected' : '') + '"><div class="am-food-visual"><span class="am-food-tag">' + esc(foodTags[item.name] || '早八候选') + '</span><img src="' + esc(item.img) + '" alt="' + esc(item.name) + '"></div><div class="am-food-body"><h3>' + esc(item.name) + '</h3><div class="am-food-properties"><span>制作 ' + item.prep + ' 分钟</span><span>饱腹 +' + item.satiety + '</span></div><div class="am-food-bottom"><b>' + money(item.priceCents) + '</b><div class="am-qty"><button data-am-action="qty" data-am-value="' + esc(item.name) + '" data-am-delta="-1" aria-label="减少一份' + esc(item.name) + '"' + (!run.cart[item.name] ? ' disabled' : '') + '>−</button><span aria-live="polite">' + (run.cart[item.name] || 0) + '</span><button data-am-action="qty" data-am-value="' + esc(item.name) + '" data-am-delta="1" aria-label="增加一份' + esc(item.name) + '"' + (count >= 4 ? ' disabled' : '') + '>+</button></div></div></div></article>').join('') + '</div>' +
      (run.oracle === 'coupon' ? '<label class="am-coupon"><input type="checkbox" id="amCoupon"' + (run.coupon ? ' checked' : '') + (!couponAvailable && !run.coupon ? ' disabled' : '') + '><span><strong>启用优惠签里的演示券核验</strong><small>猪柳蛋麦满分＋中杯鲜煮咖啡，两件 ¥9.90；或每两份脆薯饼 ¥9.90。先点齐适用餐品，再决定用券；核验 +2 分钟。</small></span></label>' : '<div class="am-evidence">时刻签已放进口袋。<small>它不让早餐变便宜，但能在审判庭换一条近路。</small></div>') +
      '<div class="am-order-bottom"><div class="am-order-total"><span>共 ' + count + ' 份 · 暂按独食预计 ' + preview.elapsed + ' 分钟后出发</span><b>' + (preview.quote.originCents > preview.quote.finalCents ? '<del>' + money(preview.quote.originCents) + '</del>' : '') + money(preview.quote.finalCents) + '</b></div>' + (count && !preview.valid ? '<p class="am-inline-alert">' + (preview.errors || []).map(esc).join('；') + '</p>' : '') + (preview.warnings || []).map(message => '<p class="am-inline-alert">' + esc(message) + '</p>').join('') + '</div>' + rules() +
      '<div class="am-action-line">' + button('把这一单交给法官 <span class="am-action-arrow" aria-hidden="true">↗</span>', 'next', 'court', 'am-primary', !preview.valid) + button('重选神谕', 'back', 'oracle', 'am-outline') + '</div>';
  }
  function courtView() {
    const preview = getPreview(), saved = Math.max(0, preview.quote.originCents - preview.quote.finalCents);
    const cheapest = !saved ? '这单没用券。钱包账很清楚，时间账还没开庭。' : '本庭确认：你省下了 ' + money(saved) + '。但核验消耗的两分钟，不在本庭账上。';
    return heading('03 / 审判庭 · 钱包和时钟，谁来作证', '法官说：<br>“<em>本庭只审钱包。</em>”', '取餐已经消耗了时间。接受判词可以立刻走；只有带着时刻签的人，能拿出近路线索申辩。') +
      '<article class="am-court-paper"><small>McCOURT / 第 008 号判词</small><span class="am-stamp" aria-hidden="true">只审钱包</span><h3>钱省没省，本庭算。<br>早八赶不赶，你自己看。</h3><p>' + cheapest + '</p><div class="am-ledger"><div>早餐实付<b>' + money(preview.quote.finalCents) + '</b></div><div>取餐与核验<b>' + (preview.wait + preview.verifyMinutes) + ' 分钟</b></div><div>开庭时刻<b>' + clock(preview.wait + preview.verifyMinutes) + '</b></div></div></article>' +
      (run.oracle === 'clock' ? '<div class="am-evidence"><b>你有证物：时刻签里的近路。</b><small>申辩花 1 分钟，步行从 12 分钟缩到 9 分钟。低饱腹的额外 3 分钟仍然存在。</small></div>' : '<div class="am-evidence">你带的是优惠签，口袋里没有近路证物。<small>这一次，钱省下了多少、时间花掉了多少，都得一起承担。</small></div>') +
      '<div class="am-choices">' + choice('✓', 'ACCEPT / 不再争辩', '判词收好，<br>现在就走。', '不花额外时间。下一步决定，要不要把早餐分给朋友。', '时间 +0′ · 没有近路', 'argument', 'accept', run.oracle !== 'clock') +
      choice('↗', 'APPEAL / 拿出时间证物', '法官，<br>时间也得算。', run.oracle === 'clock' ? '拿时刻签申辩。花 1 分钟，让步行近路成为真正可走的选项。' : '缺少时刻签，无法证明近路。可以下一局换一张签再试。', '申辩 +1′ · 步行 −3′', 'argument', 'time', run.oracle === 'clock', run.oracle !== 'clock') + '</div>' +
      '<div class="am-action-line">' + button('← 回取餐台改订单', 'back', 'order', 'am-outline') + '</div>';
  }
  function shareView() {
    const own = getPreview(Object.assign(clone(run), {sharing: 'self'})), shared = getPreview(Object.assign(clone(run), {sharing: 'share'}));
    return heading('04 / 饭搭子的消息 · 不是所有事都能一起圆满', '早餐在手里，<br>那条消息<em>还悬着。</em>', '朋友已经到店门口。留给自己，或者把这一单分一半；你会马上看到代价，轮回司也会记住。') +
      '<div class="am-choices">' +
      '<button class="am-choice" data-am-action="sharing" data-am-value="self"><div class="am-sharing-tray" aria-hidden="true"><span></span></div><small>FOR MYSELF / 先顾好自己</small><strong>今天这口，<br>先留给我。</strong><p>吃完需要 1 分钟，自己吃下整单。朋友另找早餐，关系会冷一点。</p><div class="am-mini-delta"><span>吃完 1′</span><span>饱腹 ' + own.satiety + '</span><span>关系 ' + own.relationship + '</span></div><span class="am-choice-footer">有边界，也有代价<b aria-hidden="true">↗</b></span></button>' +
      '<button class="am-choice am-choice-yellow" data-am-action="sharing" data-am-value="share"><div class="am-sharing-tray" aria-hidden="true"><span class="am-half"></span><span class="am-half"></span></div><small>HALF FOR YOU / 留一半给你</small><strong>一起吃吧，<br>不够再说。</strong><p>分餐共花 2 分钟，朋友分到 ' + shared.friendSatiety + ' 饱腹。' + (shared.friendSatisfied ? '这够当一份早餐，朋友记得你这份心意。' : '这点还不够一份早餐，朋友感谢你，但仍得自己找吃的。') + '</p><div class="am-mini-delta"><span>分餐 2′</span><span>自己饱腹 ' + shared.satiety + '</span><span>关系 ' + shared.relationship + '</span></div><span class="am-choice-footer">分出去多少，关系就回应多少<b aria-hidden="true">↗</b></span></button></div>' + rules() +
      '<div class="am-action-line">' + button('← 回到审判庭', 'back', 'court', 'am-outline') + '</div>';
  }
  function routeView() {
    const preview = getPreview();
    const icons = {bus: '▣', walk: '↗', taxi: '▰'};
    return heading('05 / 校门口 · 现在，走哪条路', '车和你，<br>总有一个<em>得先走。</em>', '你点的早餐、用过的券、庭上的申辩和分出的那一半，都已经进入时钟。现在决定怎么到教室。') +
      '<div class="am-map" aria-hidden="true"><div class="am-map-point"><i></i>取餐台<br>' + clock(preview.elapsed) + '</div><div class="am-map-track"><span>' + (run.argument === 'time' ? '近路线索已兑现' : '钱 / 时间 / 体力') + '</span></div><div class="am-map-point"><i></i>教学楼<br>08:00 签到</div></div><div class="am-route-list">' + (preview.availableRoutes || []).map(route => {
        const arrival = clock(preview.elapsed + route.minutes);
        return '<button class="am-route' + (!route.available ? ' am-disabled' : '') + '" data-am-action="route" data-am-value="' + esc(route.id) + '"' + (!route.available ? ' disabled' : '') + '><span class="am-route-icon" aria-hidden="true">' + icons[route.id] + '</span><span><strong>' + esc(route.name) + '</strong><p>' + esc(route.reason || '可出发') + (route.available ? ' · 预计 ' + arrival + ' 到达' : '') + '</p></span><span class="am-route-price">' + money(route.costCents) + '<small>' + route.minutes + ' 分钟' + (route.available ? ' →' : ' · 不可用') + '</small></span></button>';
      }).join('') + '</div><p class="am-rule-note">选定路线就进入结局。校车 07:48 准时发车；晚到不能追上。步行始终可走，打车需要至少 ¥6 余额。</p><div class="am-action-line">' + button('← 再想想怎么分餐', 'back', 'share', 'am-outline') + '</div>';
  }
  function timeline(result, small, divergenceId) {
    const events = (result.timeline || []).slice();
    if (result.blocked && !events.some(event => event.blocked || event.id === 'blocked')) events.push({id: 'blocked', title: '这条路在这里断开', text: result.reason, elapsed: resourceOf(result).elapsed, wallet: resourceOf(result).wallet, satiety: resourceOf(result).satiety, relationship: resourceOf(result).relationship});
    return '<ol class="am-timeline' + (small ? ' am-timeline-small' : '') + '">' + events.map(event => '<li class="' + (event.id === divergenceId || event.id === 'blocked' || event.blocked ? 'am-break' : '') + '"><span class="am-timeline-time">' + clock(event.elapsed) + '</span><strong>' + esc(event.title) + '</strong>' + (event.id === 'arrival' ? '' : '<p>' + esc(event.text) + '</p>') + '<div class="am-timeline-state">' + money(event.wallet) + ' · 饱腹 ' + event.satiety + ' · 关系 ' + event.relationship + '</div></li>').join('') + '</ol>';
  }
  function resultView() {
    const result = engine.resolve(run), resources = resourceOf(result);
    if (result.blocked) return heading('轮回司 / 路线断点', '这条路，<br><em>现在走不通。</em>', esc(result.reason)) + timeline(result) + '<div class="am-action-line">' + button('回校门口重新选路', 'back', 'route', 'am-primary') + '</div>';
    unlock(result);
    const ending = result.ending;
    return '<header class="am-result-heading"><span class="am-kicker">06 / 轮回司 · 小选择，已经变成了这一天</span><span class="am-result-id">' + esc(ending.id) + ' / ARRIVAL ' + esc(result.arrivalClock || clock(result.arrival)) + '</span><h2>' + esc(ending.name) + '</h2><p class="am-result-text">' + esc(ending.text) + '</p><div class="am-outcome"><span class="' + (result.onTime ? '' : 'am-loss') + '">' + (result.onTime ? '签到赶上了' : '签到错过了') + '</span><span class="' + (resources.satiety >= 55 ? '' : 'am-loss') + '">' + (resources.satiety >= 55 ? '自己吃饱了' : '自己还饿着') + '</span><span class="' + (resources.relationship >= 60 ? '' : 'am-loss') + '">' + (resources.relationship >= 60 ? '朋友站在你这边' : '朋友自己找了早餐') + '</span></div></header><div class="am-causal-header"><strong>这一单，怎样变成这一天？</strong><span>FOLLOW THE CAUSE</span></div>' + timeline(result) +
      '<div class="am-tear-prompt"><strong>如果，刚才换掉一份呢？</strong><p>撕下一行订单，其他选择原封不动。并排看两条时间线，找到第一个分岔。</p>' + button('只换一份，看看另一条宇宙 ↗', 'compare-open', null, '') + '</div>' +
      '<div class="am-share-row"><button data-am-action="receipt">保存命运小票 PNG</button><button data-am-action="link">复制公开重玩链接</button><button data-am-action="archive">早八档案 ' + Object.keys(collection).length + '/8</button></div>' + linkField() + sessionNote() +
      '<div class="am-action-line">' + button('重新点单，保留这张神谕', 'reorder', null, 'am-outline') + button('开启全新的一局', 'new', null, 'am-outline') + '</div>';
  }
  function linkField() { return sharedLink ? '<label class="am-link-field">公开重玩链接（也可以选中后手动复制）<input id="amReplayLink" type="text" readonly value="' + esc(sharedLink) + '"></label>' : ''; }
  function sessionNote() { return '<details class="am-session-note"><summary>本局规则与来源记录</summary><p>种子 ' + run.seed + ' · ' + esc(run.snapshot.date) + ' · 数据已冻结<br>' + esc(run.snapshot.source || run.snapshot.mode || '内置演示菜单') + '<br>四项状态、制作时长、交通与关系都是游戏规则。分享只包含公开餐品和游戏选择。收藏保存在当前浏览器。</p></details>'; }
  function prepareComparison() {
    const names = Object.keys(run.cart).filter(name => run.cart[name] > 0), catalog = getCatalog();
    if (!names.includes(fromItem)) fromItem = names[0] || '';
    if (!catalog.some(item => item.name === toItem) || toItem === fromItem) toItem = (catalog.find(item => item.name !== fromItem) || {}).name || '';
    comparison = engine.compare(run, fromItem, toItem);
    if (!comparison.alternate.blocked) unlock(comparison.alternate);
  }
  function compareView() {
    if (!comparison) prepareComparison();
    const original = comparison.original, alternate = comparison.alternate, a = resourceOf(original), b = resourceOf(alternate), first = comparison.firstDivergence;
    const names = Object.keys(run.cart).filter(name => run.cart[name] > 0), options = getCatalog();
    const signed = (n, suffix) => (n > 0 ? '+' : '') + n + (suffix || '');
    const moneyDelta = b.wallet - a.wallet;
    return heading('轮回司 / 只撕下一行，看看因果怎样偏移', '只换一份，<br><em>其他都不许变。</em>', '同一张神谕，同一次申辩，同一个分餐决定，同一种交通意图。这里没有悄悄替你选择最优路线。') +
      '<div class="am-replace-form"><label>从原订单拿走一份<select id="amReplaceFrom">' + names.map(name => '<option value="' + esc(name) + '"' + (name === fromItem ? ' selected' : '') + '>' + esc(name) + '</option>').join('') + '</select></label><span class="am-replace-arrow" aria-hidden="true">→</span><label>只放回另一份<select id="amReplaceTo">' + options.filter(item => item.name !== fromItem).map(item => '<option value="' + esc(item.name) + '"' + (item.name === toItem ? ' selected' : '') + '>' + esc(item.name) + '</option>').join('') + '</select></label></div>' +
      '<p class="am-replace-locks">已锁定：' + (run.oracle === 'clock' ? '时刻签' : '优惠签') + ' / ' + (run.coupon ? '用券核验' : '不用券') + ' / ' + (run.argument === 'time' ? '申辩' : '接受判词') + ' / ' + (run.sharing === 'share' ? '分一半' : '留给自己') + ' / ' + routeName(run.route) + '。用券意图锁定后，换品使券失效也仍花核验时间。</p><div class="am-deltas" aria-label="替换后相对原线的变化">' +
      [{label: '到达时间差', value: alternate.blocked ? '未到达' : signed(b.elapsed - a.elapsed, '′')}, {label: alternate.blocked ? '断点钱包差*' : '最终钱包差', value: (moneyDelta > 0 ? '+' : moneyDelta < 0 ? '−' : '') + money(Math.abs(moneyDelta))}, {label: '饱腹变化', value: signed(b.satiety - a.satiety)}, {label: '关系变化', value: signed(b.relationship - a.relationship)}].map(item => '<div><small>' + item.label + '</small><b>' + esc(item.value) + '</b></div>').join('') + '</div>' +
      '<div class="am-first-break"><b>第一个分岔：</b>' + esc(first ? first.title + '。' + (first.text || '') : '这次替换没有改变后续结果。') + '</div>' +
      (alternate.blocked ? '<p class="am-rule-note">* 替换线停在 ' + clock(b.elapsed) + '，没有到达教室。钱包、饱腹与关系按断点状态对照，不代表替换线的最终结局。原交通意图保持不变。</p>' : '') +
      '<div class="am-compare-columns">' + compareColumn('A / 原来的那一天', original, run.cart, first && first.id) + compareColumn('B / 只换一份之后', alternate, comparison.changedCart || alternate.cart, first && first.id) + '</div>' +
      '<div class="am-action-line">' + button('← 回到原来的结局', 'return-result', null, 'am-primary') + button('重新点一整单', 'reorder', null, 'am-outline') + '</div>';
  }
  function routeName(id) { return {bus: '坐校车', walk: '步行', taxi: '打车'}[id] || id; }
  function compareColumn(title, result, cart, divergenceId) {
    return '<article class="am-compare-column"><small>' + title + '</small><h3>' + (result.blocked ? '这条路断开了' : esc(result.arrivalClock || clock(result.arrival)) + ' 到达') + '</h3><p>' + Object.entries(cart || {}).map(([name, quantity]) => esc(name) + ' × ' + quantity).join(' · ') + '</p>' + timeline(result, true, divergenceId) + '<div class="am-compare-ending' + (result.blocked ? ' am-blocked' : '') + '"><b>' + esc(result.blocked ? '没有偷偷换一条路' : result.ending.name) + '</b>' + esc(result.blocked ? result.reason : result.ending.text) + '</div></article>';
  }
  function archiveView() {
    const endings = engine.endings || window.McMorning.ENDINGS || [];
    return heading('轮回司 / 早八专属档案', '你走过的早晨，<br><em>都留着回响。</em>', '八种结局来自是否准时、是否吃饱、关系是否温暖的真实组合。同一个名字不因换文案重复计数。') +
      '<div class="am-collection">' + endings.map(ending => { const saved = collection[ending.id]; return '<article class="am-collection-card' + (saved ? '' : ' am-locked') + '"><small>' + esc(ending.id) + '</small><h3>' + esc(saved ? ending.name : '还有一种早晨') + '</h3><p>' + esc(saved ? saved.text || ending.text : '在时间、饱腹和关系之间，再走一条不同的路。') + '</p></article>'; }).join('') + '</div><p class="am-rule-note">已留下 ' + Object.keys(collection).length + ' / 8 个早晨。档案仅在当前浏览器；清除站点数据会移除，可以先保存小票。</p><div class="am-action-line">' + button('回到这一局', 'return-result', null, 'am-primary') + button('开启全新的一局', 'new', null, 'am-outline') + '</div>';
  }
  function frame(body, result) {
    const masthead = '<div class="am-top"><span class="am-edition">McMULTIVERSE / FIELD NOTE 001</span><div class="am-top-actions"><button class="am-back" data-am-action="home">← 回大殿</button><button class="am-small-button" data-am-action="archive">早八档案 ' + Object.keys(collection).length + '/8</button></div></div><div class="am-title-row"><div><span class="am-kicker">A SMALL BREAKFAST. A DIFFERENT MORNING.</span><h1>' + (stage === 'archive' ? '早八档案' : '早八之前') + '<span>。</span></h1></div><p class="am-pause"><i aria-hidden="true"></i>选择才消耗游戏时间<br>停下来读，不会错过车。</p></div>';
    const status = '<p class="am-notice" id="amNotice" role="status" aria-live="polite">' + esc(notice || (storageWarning ? '当前浏览器限制本地存储；这一局仍可玩，关闭后不会保存。' : '')) + '</p>';
    const footer = '<footer class="am-footer-note"><span>所有资源、交通与券均为虚构游戏规则。</span><span class="am-ink-label">一张订单，真的改变这一天。</span></footer>';
    if (stage === 'archive') return masthead + '<div class="am-main am-archive-main am-enter">' + body + status + '</div>' + footer;
    return masthead + hud(result, stage === 'order') + (stage === 'order' ? '<p class="am-state-label">上方是本单出发预估：未决定分餐前，暂按自己吃完计算。分餐后会重算。</p>' : '') + '<div class="am-layout"><div class="am-main am-enter">' + progress() + body + status + '</div>' + scene(result) + '</div>' + footer;
  }
  function render(moveFocus) {
    if (!run) return;
    let result = stage === 'archive' ? {elapsed: 0, wallet: 1800, satiety: 20, relationship: 40} : ['result', 'compare'].includes(stage) ? engine.resolve(run) : getPreview();
    if (stage === 'oracle') result = {elapsed: 0, wallet: 1800, satiety: 20, relationship: 40};
    if (stage === 'court' || stage === 'share') result = {elapsed: result.wait + result.verifyMinutes + (stage === 'share' ? result.argumentMinutes : 0), wallet: result.wallet, satiety: 20, relationship: 40};
    const views = {oracle: oracleView, order: orderView, court: courtView, share: shareView, route: routeView, result: resultView, compare: compareView, archive: archiveView};
    section.innerHTML = frame((views[stage] || resultView)(), result);
    if (moveFocus) {
      focusStage();
      section.scrollIntoView({block: 'start', behavior: 'instant'});
    }
  }
  function renderError(message) {
    section.innerHTML = '<div class="am-top"><button class="am-back" data-am-action="home">← 回大殿</button><span class="am-edition">McMULTIVERSE / FIELD 001</span></div><div class="am-error"><h2>这张重玩单暂时读不了。</h2><p>' + esc(message) + '</p><div class="am-action-line">' + button('从当前菜单开启新局', 'new', null, 'am-primary') + '</div></div>';
  }
  async function copyLink() {
    if (!/^https?:$/.test(location.protocol)) { notice = '公开重玩链接需要 HTTP 地址。此时可以先保存命运小票。'; render(false); return; }
    sharedLink = location.origin + location.pathname + engine.encode(run);
    render(false);
    try { await navigator.clipboard.writeText(sharedLink); notice = '已复制公开重玩链接。菜单版本相同时，会重现这一单和所有选择。'; }
    catch (e) { notice = '请选中下面的重玩链接，手动复制。'; }
    const node = section.querySelector('#amNotice'); if (node) node.textContent = notice;
  }
  async function saveReceipt() {
    const result = engine.resolve(run), data = resourceOf(result);
    if (result.blocked) return;
    const payload = {title: '麦门宇宙 · 早八命运小票', subtitle: result.ending.name, lines: [
      ...Object.entries(run.cart).map(([name, quantity]) => name + ' × ' + quantity),
      '早餐实付 ' + money(result.quote.finalCents) + ' · 到达 ' + (result.arrivalClock || clock(result.arrival)),
      '钱包 ' + money(data.wallet) + ' · 饱腹 ' + data.satiety + ' · 关系 ' + data.relationship,
      ...result.timeline.map(event => clock(event.elapsed) + ' ' + event.title),
      '结局 ' + result.ending.id, '种子 ' + run.seed + ' · ' + run.snapshot.date,
      '虚构情景与游戏规则 · 非真实消费凭证'
    ]};
    if (window.McJourney.saveReceipt) await window.McJourney.saveReceipt(payload);
    notice = '已生成早八命运小票，请查看浏览器下载。';
    const node = section.querySelector('#amNotice'); if (node) node.textContent = notice;
  }
  async function handleClick(event) {
    const target = event.target.closest('[data-am-action]');
    if (!target || !section.contains(target) || target.disabled) return;
    const action = target.dataset.amAction, value = target.dataset.amValue;
    if (action === 'home') { if (typeof go === 'function') go('hall'); return; }
    if (action === 'new') return startMorning();
    if (!run) return;
    notice = ''; let moveFocus = true;
    try {
      if (action === 'oracle') { run.oracle = value; run.coupon = false; run.argument = 'accept'; stage = 'order'; }
      else if (action === 'qty') {
        const quantity = (run.cart[value] || 0) + Number(target.dataset.amDelta);
        if (quantity > 0) run.cart[value] = quantity; else delete run.cart[value];
        moveFocus = false;
      }
      else if (action === 'next') { if (!getPreview().valid) return; stage = value; }
      else if (action === 'back') { stage = value; if (value === 'order' || value === 'court') { run.argument = 'accept'; run.sharing = 'self'; } if (value === 'share') run.sharing = 'self'; }
      else if (action === 'argument') { run.argument = value; run.sharing = 'self'; stage = 'share'; }
      else if (action === 'sharing') { run.sharing = value; stage = 'route'; }
      else if (action === 'route') { run.route = value; stage = 'result'; sharedLink = ''; }
      else if (action === 'compare-open') { stage = 'compare'; comparison = null; prepareComparison(); }
      else if (action === 'return-result') { stage = stage === 'archive' ? lastGameStage : 'result'; comparison = null; }
      else if (action === 'archive') { stage = 'archive'; }
      else if (action === 'reorder') { run.cart = {}; run.coupon = false; run.argument = 'accept'; run.sharing = 'self'; run.route = 'walk'; stage = 'order'; comparison = null; sharedLink = ''; }
      else if (action === 'link') return copyLink();
      else if (action === 'receipt') return saveReceipt();
      if (['oracle', 'qty', 'next', 'back', 'argument', 'sharing', 'route', 'reorder'].includes(action)) clearReplayHash();
      persist(); render(moveFocus);
      if (action === 'qty') {
        const buttons = section.querySelectorAll('[data-am-action="qty"]');
        const equivalent = Array.from(buttons).find(node => node.dataset.amValue === value && node.dataset.amDelta === target.dataset.amDelta && !node.disabled);
        equivalent?.focus({preventScroll: true});
      }
    } catch (e) { notice = e.message; render(false); }
  }
  function handleChange(event) {
    if (!run) return;
    notice = '';
    try {
      if (event.target.id === 'amCoupon') { run.coupon = event.target.checked; clearReplayHash(); persist(); render(false); section.querySelector('#amCoupon')?.focus({preventScroll: true}); }
      else if (event.target.id === 'amReplaceFrom' || event.target.id === 'amReplaceTo') {
        fromItem = section.querySelector('#amReplaceFrom').value;
        toItem = section.querySelector('#amReplaceTo').value;
        const id = event.target.id; prepareComparison(); render(false); section.querySelector('#' + id)?.focus({preventScroll: true});
      }
    } catch (e) { notice = e.message; render(false); }
  }
  async function replayFromLocation() {
    const params = new URLSearchParams(location.hash.slice(1));
    if (!params.has('am')) return;
    await ready();
    try {
      run = engine.decode(location.hash, window.McJourney.captureData());
      stage = 'result'; lastGameStage = 'result'; comparison = null; sharedLink = ''; notice = '公开重玩单已载入：同一订单、同一神谕和所有选择。';
      openSection(); persist(); render(true);
    } catch (e) { openSection(); renderError(e.message); }
  }
  function init() {
    if (initialized) return;
    if (!window.McMorning || !window.McJourney?.captureData) throw Error('早八模块未完整加载，请刷新后再试。');
    engine = window.McMorning.createEngine(quoteOrder);
    section = document.createElement('section'); section.id = 'morning'; section.className = 'hidden'; section.setAttribute('aria-label', '早八之前 · 一张订单，两条时间线');
    document.querySelector('main').appendChild(section);
    if (typeof SECTIONS !== 'undefined' && !SECTIONS.includes('morning')) SECTIONS.push('morning');
    section.addEventListener('click', handleClick); section.addEventListener('change', handleChange);
    section.addEventListener('focusin', event => { if (event.target.id === 'amReplayLink') event.target.select(); });
    initialized = true;
    const saved = safeStorage();
    if (saved && saved.version === 1) {
      if (saved.collection && typeof saved.collection === 'object' && !Array.isArray(saved.collection)) {
        const allowed = new Set((engine.endings || window.McMorning.ENDINGS || []).map(ending => ending.id));
        Object.keys(saved.collection).forEach(id => { const entry = saved.collection[id]; if (allowed.has(id) && entry && typeof entry.name === 'string' && typeof entry.text === 'string') collection[id] = {id, name: entry.name.slice(0, 80), text: entry.text.slice(0, 600), date: String(entry.date || '').slice(0, 20)}; });
      }
      if (saved.run) {
        try {
          const validated = engine.restore(saved.run);
          if (STAGES.includes(saved.stage)) { run = validated; stage = saved.stage; lastGameStage = stage; }
        } catch (e) { run = null; }
      }
    }
    window.addEventListener('hashchange', replayFromLocation);
  }
  window.startMorning = startMorning; window.resumeMorning = resumeMorning; window.showMorningCollection = showMorningCollection;
  window.McMorningUI = {start: startMorning, resume: resumeMorning};
  function boot() { ready().then(() => replayFromLocation()).catch(error => { console.error(error); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
