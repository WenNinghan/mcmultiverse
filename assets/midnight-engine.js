/* 凌晨的提交键：精力决定工时，烦躁留下错误；全部数值仅是游戏规则。 */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./session-core.js'));
  else root.McMidnight=factory(root.McSessionCore);
})(typeof globalThis!=='undefined'?globalThis:this,function(Core){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x)),clamp=n=>Math.min(100,Math.max(0,n));
  const INITIAL={elapsed:0,wallet:2800,energy:25,quality:40,errors:3,strain:0};
  const FOODS=[
    {name:'麦香鸡',prep:2,eat:2,energy:20,strain:0,facts:['出餐2分钟；吃一份2分钟','精力＋20；烦躁不变']},
    {name:'板烧鸡腿堡',prep:6,eat:3,energy:35,strain:0,facts:['出餐6分钟；吃一份3分钟','精力＋35；烦躁不变']},
    {name:'中杯鲜煮咖啡',prep:1,eat:1,energy:30,strain:25,facts:['出餐1分钟；喝一杯1分钟','精力＋30；烦躁＋25']},
    {name:'中杯可乐',prep:1,eat:1,energy:10,strain:5,facts:['出餐1分钟；喝一杯1分钟','精力＋10；烦躁＋5']},
    {name:'香芋派',prep:4,eat:2,energy:15,strain:0,facts:['出餐4分钟；吃一份2分钟','精力＋15；烦躁不变']}
  ];
  const ENDINGS=[
    {id:'midnight-on-high',name:'灯灭之前，交出好版本',text:'你在截稿前交出了无已知错误的完整版本。它不是熬得最久的那一版，而是你在恢复、核验和打磨之间换来的那一版。'},
    {id:'midnight-on-runnable',name:'先让它跑起来',text:'截稿保住了，已知错误也清掉了。表达和细节还没到高质量门槛；你提交的是可运行版，把未完成的打磨写进了说明。'},
    {id:'midnight-on-buggy',name:'绿色按钮，红色待办',text:'提交按钮及时变绿，已知错误却跟着文件一起出门。赶上截稿确实有价值，但“已提交”没有替你证明“没问题”。'},
    {id:'midnight-late-high',name:'完整的迟到者',text:'你交出了无已知错误的高质量版本，也确实错过了截止线。深度打磨留下了成果，迟交记录没有因此消失。'},
    {id:'midnight-late-runnable',name:'能跑，但窗口已关',text:'已知错误清掉了，细节还欠火候，提交时间却越过了两点。小票让这次迟交可解释，也提醒你解释并不能倒回时钟。'},
    {id:'midnight-late-buggy',name:'夜还很长，期限已经过了',text:'截止线已经过去，文件里仍有已知错误。多熬的分钟没自动变成质量：精力、烦躁和核验的代价，都在这份版本里留下了痕迹。'}
  ];
  const WORKS=[
    {id:'submit',title:'交可运行版',base:12,quality:10,repair:1,energy:18,text:'先把核心路径补齐，允许文字与边角还欠一点。'},
    {id:'polish',title:'深度打磨',base:24,quality:30,repair:2,energy:30,text:'逐段补齐论证和边界，质量更高，工作窗口也更长。'},
    {id:'peer',title:'请同伴评审',base:16,quality:20,repair:3,energy:22,text:'把复现步骤交给还醒着的小林；需要同伴签，并在01:36前开始。'}
  ];
  const META={
    id:'midnight',name:'凌晨的提交键',budget:2800,startMinutes:84,deadlineMinutes:36,
    initialResources:INITIAL,choiceField:'approach',actionField:'work',
    choiceTitle:'轮回司 · 先恢复，还是继续赶工？',actionTitle:'02:00 截稿 · 你准备交哪一版？',
    hook:'多喝一杯，可能省下三分钟，也可能多留一个错误。',
    intro:'01:24，提交页还有36分钟关闭。你只有28元，草稿质量40，已知错误3处。点单决定你接下来能工作多快；同伴评审并不会整夜等你。',
    sceneTitle:'A12 · 深夜提交窗口',personName:'组员小林',
    resources:[{key:'wallet',label:'余钱',format:'money'},{key:'energy',label:'精力',format:'score'},{key:'quality',label:'质量',format:'score'},{key:'errors',label:'已知错误',format:'count'}],
    oracles:[
      {id:'backup',title:'版本保全签',text:'先把能够复现的错误记下来。法官认凭据，同伴可能已经要睡了。',effect:'证据申辩只花1分钟（普通为3分钟）；仍需亲自选择申辩。'},
      {id:'peer',title:'同伴评审签',text:'小林还醒着：“最晚01:36发给我，过点我就睡。”',effect:'开放同伴评审：基础16分钟、质量＋20、修3错；开始时间不得晚于01:36。'}
    ],
    ruleText:'全部等待、精力、烦躁与质量都是虚构游戏值。01:24起，02:00（第36分钟）仍可准时提交；预算¥28，最多4份。初始精力25、质量40、已知错误3、烦躁0。餐品并行制作，等最慢餐品再装袋1分钟；吃喝时间按份数累加。证据申辩修1错、质量＋5，版本保全签用1分钟，否则3分钟。赶工不耗时，但质量−5、烦躁＋10；休息3分钟，精力＋15、烦躁−20。工作开始时精力不足40，多用8分钟；精力至少65，少用3分钟；其他不变。精力不足40、烦躁至少45，各在工作末留下1个错误。可运行版基础12分钟、质量＋10、修1错、消耗18精力；打磨基础24分钟、质量＋30、修2错、消耗30精力；评审基础16分钟、质量＋20、修3错、消耗22精力，需同伴签且最晚01:36开始。质量至少75且无错误为高质量；无错误为可运行；其余带错误。精力、质量、烦躁限制在0—100，错误最低为0。读规则和停留页面不耗游戏时间。'
  };
  function createEngine(quoteOrder){
    if(!Core||typeof Core.createTools!=='function')throw Error('凌晨需要共享情景校验与改单模块。');
    const tools=Core.createTools(quoteOrder,{id:'midnight',foods:FOODS,budget:2800,
      defaults:{oracle:null,coupon:false,argument:'accept',approach:'rush',work:'submit'},
      fields:{oracle:[null,'backup','peer'],coupon:[false],argument:['accept','evidence'],approach:['rush','break'],work:['submit','polish','peer']}});
    const clock=elapsed=>tools.clock(elapsed,META.startMinutes);
    function actionList(run,resources,valid,errors){
      const adjustment=resources.energy<40?8:resources.energy>=65?-3:0;
      const risk=Number(resources.energy<40)+Number(resources.strain>=45);
      return WORKS.map(w=>{
        let available=valid,reason=valid?'':errors.join(' ');
        if(valid&&w.id==='peer'&&run.oracle!=='peer'){available=false;reason='没有同伴评审签，小林不会接受临时评审请求。';}
        else if(valid&&w.id==='peer'&&resources.elapsed>12){available=false;reason='现在是'+clock(resources.elapsed)+'；同伴评审最晚01:36开始，小林已经下线。';}
        const minutes=w.base+adjustment,out=copy(resources);
        out.elapsed+=minutes;out.energy=clamp(out.energy-w.energy);out.quality=clamp(out.quality+w.quality);out.errors=Math.max(0,out.errors-w.repair)+risk;
        const timing='基础'+w.base+'分钟'+(adjustment<0?'，高精力减3分钟':adjustment>0?'，低精力加8分钟':'，精力不加减时')+'，实际'+minutes+'分钟，'+clock(out.elapsed)+'提交';
        const effect='质量＋'+w.quality+'，修'+w.repair+'错，消耗'+w.energy+'精力'+(risk?'；低精力/高烦躁另留'+risk+'错':'；当前无额外留错')+'。';
        if(available)reason=timing+'。'+(out.elapsed<=36?'在截止前。':'会迟交'+(out.elapsed-36)+'分钟；仍可主动选择。');
        return {id:w.id,title:w.title,text:w.text,effect,available,reason,minutes,resources:out,adjustment,risk};
      });
    }
    function preview(run){
      const {items,count}=tools.validate(run),quote=tools.quote(run),errors=[],warnings=[];
      if(!run.oracle)errors.push('请先选择一张神谕。');
      if(!count)errors.push('请先点至少一份夜宵或饮品。');
      if(quote.finalCents>2800)errors.push('订单实付超过¥28.00预算，还差¥'+((quote.finalCents-2800)/100).toFixed(2)+'。');
      const selected=items.filter(f=>run.cart[f.name]),wait=count?Math.max(...selected.map(f=>f.prep))+1:0;
      const eat=selected.reduce((sum,f)=>sum+f.eat*run.cart[f.name],0);
      const order=copy(INITIAL);order.elapsed=wait+eat;order.wallet=Math.max(0,2800-quote.finalCents);
      order.energy=clamp(order.energy+selected.reduce((sum,f)=>sum+f.energy*run.cart[f.name],0));
      order.strain=clamp(order.strain+selected.reduce((sum,f)=>sum+f.strain*run.cart[f.name],0));
      const court=copy(order),argumentMinutes=run.argument==='evidence'?(run.oracle==='backup'?1:3):0;
      if(run.argument==='evidence'){court.elapsed+=argumentMinutes;court.quality+=5;court.errors=Math.max(0,court.errors-1);}
      const choice=copy(court);
      if(run.approach==='break'){choice.elapsed+=3;choice.energy=clamp(choice.energy+15);choice.strain=clamp(choice.strain-20);}
      else{choice.quality=clamp(choice.quality-5);choice.strain=clamp(choice.strain+10);}
      if(choice.strain>=45)warnings.push('烦躁至少45：工作结束会额外留下1错，咖啡的提神有代价。');
      if(choice.energy<40)warnings.push('精力不足40：工作慢8分钟，结束时额外留下1错。');
      const valid=!errors.length,availableActions=actionList(run,choice,valid,errors);
      return {valid,errors,warnings,quote,initialResources:copy(INITIAL),orderResources:order,courtResources:court,choiceResources:choice,availableActions,count,wait,eat,argumentMinutes};
    }
    function resolve(run){
      const p=preview(run),timeline=[];let resources=copy(INITIAL);
      const node=(id,stage,title,text,r)=>{resources=copy(r);timeline.push({id,stage,title,text,resources:copy(resources)});};
      function output(blocked,reason,ending){return {timeline,resources:copy(resources),ending,blocked,reason:reason||'',quote:p.quote,availableActions:p.availableActions,preview:p,
        scene:{message:blocked?reason:ending?ending.text:'提交窗口仍在倒计时。',status:clock(resources.elapsed)+' · 质量'+resources.quality+' · 错误'+resources.errors+' · 烦躁'+resources.strain}};}
      const oracle=META.oracles.find(o=>o.id===run.oracle);
      node('oracle','oracle','01:24 · 神谕阁',oracle?oracle.title+'：'+oracle.effect:'尚未选择神谕。',INITIAL);
      if(!run.oracle||!p.count)return output(true,p.errors.join(' '),null);
      if(!p.valid){node('order','order','订单断点 · 无法付款',p.errors.join(' ')+' 未付款、未取餐，时间和精力保持原状。',INITIAL);return output(true,p.errors.join(' '),null);}
      node('order','order','取餐与恢复 · '+(p.wait+p.eat)+'分钟',Object.entries(run.cart).map(([n,q])=>n+' ×'+q).join('、')+'；等最慢餐品'+(p.wait-1)+'分钟＋装袋1分钟，吃喝'+p.eat+'分钟。实付¥'+(p.quote.finalCents/100).toFixed(2)+'；精力25→'+p.orderResources.energy+'，烦躁0→'+p.orderResources.strain+'。',p.orderResources);
      node('court','court',run.argument==='evidence'?'审判庭 · 用复现证据申辩':'审判庭 · 接受金额判词',run.argument==='evidence'?'用'+p.argumentMinutes+'分钟复现一处错误，修1错、质量＋5。'+(run.oracle==='backup'?'版本保全签已经整理好步骤，所以只用1分钟。':'没有保全签，现场整理步骤用了3分钟。'):'法官：“金额正确，本庭准予继续。”你没有核验，3处已知错误还在。',p.courtResources);
      node('choice','choice',run.approach==='break'?'轮回司 · 离屏休息3分钟':'轮回司 · 继续赶工',run.approach==='break'?'停下3分钟，精力＋15、烦躁−20。时钟向前，工作速度和留错风险也随之改变。':'不额外用时，但仓促收尾使质量−5、烦躁＋10；不是无代价的省时。',p.choiceResources);
      const action=p.availableActions.find(a=>a.id===run.work);
      if(!action.available){node('action','action','工作断点 · '+action.title,action.reason,p.choiceResources);return output(true,action.reason,null);}
      node('action','action',action.title+' · 实际'+action.minutes+'分钟',action.reason+' '+action.effect,action.resources);
      const tier=resources.errors>0?'buggy':resources.quality>=75?'high':'runnable',onTime=resources.elapsed<=36;
      const base=ENDINGS.find(e=>e.id==='midnight-'+(onTime?'on':'late')+'-'+tier),ending={...base,onTime,tier,text:base.text+' '+clock(resources.elapsed)+'提交，质量'+resources.quality+'/100，已知错误'+resources.errors+'处'+(onTime?'，还余'+(36-resources.elapsed)+'分钟。':'，迟交'+(resources.elapsed-36)+'分钟。')};
      node('result','result',ending.name,ending.text,resources);
      return output(false,'',ending);
    }
    function argumentsFor(run){
      const p=preview(run);
      return [{id:'accept',title:'接受金额判词',text:'钱算对了，就先回到草稿。',effect:'不耗时；不修错、不加质量。',available:!!run.oracle,reason:run.oracle?'':'请先选择神谕。',resources:preview({...run,argument:'accept'}).courtResources},
        {id:'evidence',title:'拿出复现证据',text:'把一处错误复现给法官看，要求把核验也算进进度。',effect:'花'+(run.oracle==='backup'?1:3)+'分钟，修1错、质量＋5。',available:!!run.oracle,reason:run.oracle?'':'请先选择神谕。',resources:preview({...run,argument:'evidence'}).courtResources}];
    }
    function choices(run){return [{id:'rush',title:'继续赶工',text:'此刻省下3分钟，把状态交给后面的工作检验。',effect:'0分钟；烦躁＋10，质量−5。',available:true,reason:'',resources:preview({...run,approach:'rush'}).choiceResources},
      {id:'break',title:'离屏休息一下',text:'回头可能更快，也可能因为这3分钟错过评审窗口。',effect:'3分钟；精力＋15，烦躁−20。',available:true,reason:'',resources:preview({...run,approach:'break'}).choiceResources}];}
    function compare(run,replacement,to){return tools.compare(run,typeof replacement==='string'?{from:replacement,to}:replacement,resolve);}
    return {meta:copy(META),makeRun:tools.makeRun,catalog:tools.catalog,restore:tools.restore,preview,resolve,compare,
      encode:run=>tools.encode(run,resolve),decode:(fragment,snapshot)=>tools.decode(fragment,snapshot,resolve),arguments:argumentsFor,choices,actions:run=>preview(run).availableActions,endings:copy(ENDINGS)};
  }
  return {createEngine};
});
