/* 饭搭子纯因果引擎：食物守恒分配、口味、信任与18:30占位。数值均为游戏规则。 */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./session-core.js'));
  else root.McFriends=factory(root.McSessionCore);
})(typeof globalThis!=='undefined'?globalThis:this,function(Core){
  'use strict';
  const BUDGET=4000,START=18*60+10,SEAT_DEADLINE=20;
  const INITIAL=Object.freeze({elapsed:0,wallet:BUDGET,ownSatiety:20,friendSatiety:10,trust:40});
  const FOODS=Object.freeze([
    {name:'麦香鸡',prep:2,satiety:40,main:true,preference:1,taste:0,facts:['并行出餐2分钟','整份饱腹＋40','温和汉堡；TA没有特殊偏好']},
    {name:'麦辣鸡腿堡',prep:6,satiety:65,main:true,preference:0,taste:-30,facts:['并行出餐6分钟','整份饱腹＋65','TA今天不想吃辣；收到整份信任−30']},
    {name:'麦香鱼',prep:4,satiety:45,main:true,preference:2,taste:12,facts:['并行出餐4分钟','整份饱腹＋45','TA喜欢；收到整份信任＋12']},
    {name:'麦乐鸡(5块)',prep:3,satiety:30,main:false,preference:1,taste:0,facts:['并行出餐3分钟','整份饱腹＋30；小食可均分','优惠签：每满两份只付一份']},
    {name:'中薯条',prep:3,satiety:25,main:false,preference:1,taste:0,facts:['并行出餐3分钟','整份饱腹＋25；小食可均分','TA没有特殊偏好']},
    {name:'中杯可乐',prep:1,satiety:5,main:false,preference:1,taste:0,facts:['并行出餐1分钟','整份饱腹＋5；饮料可均分','饮料不够代替一顿晚饭']}
  ]);
  const ENDINGS=Object.freeze([
    {id:'friend-dialogue',name:'晚饭之外的那句话',text:'两个人都吃够，也有人认真记住了口味。TA终于把那句“最近有点撑不住”说完；饭吃了，话聊开了，自习室的座位也赶上了。'},
    {id:'friend-missed-seat',name:'聊开了，座位没了',text:'这顿饭足够让你们聊开，却没有暂停时间。回到自习室，原来想坐的双人位已经被占；信任留下了，今晚只能另找地方。'},
    {id:'friend-spicy-silence',name:'辣到沉默',text:'TA今天不想吃辣，托盘里却真的分到了辣堡。总价和总份数都没算错，口味这笔账漏了；你们吃着饭，聊天却停在了“没事”。'},
    {id:'friend-left-hungry',name:'留下一张空餐纸',text:'你吃够了，TA分到的却不足一顿晚饭。留下一个空位很容易，留够一份食物更难；TA还得另找东西吃。'},
    {id:'friend-self-hungry',name:'你的半顿，TA的一顿',text:'TA实际吃够了，你却没有。照顾人的收益写在TA的托盘上，代价写在你的饥饿里；这一单没有把两个人都照顾好。'},
    {id:'friend-both-hungry',name:'薯条不能当晚饭',text:'两个人确实分到了食物，也确实都没吃够。小票上的便宜没有自动变成两顿晚饭，坐下之前还得承认这一点。'},
    {id:'friend-room-delivery',name:'自习室的双人晚饭',text:'两份吃得够、合口味的晚饭送到了自习室。打包多花两元，深入聊天留到了下次；今晚保住的是一起自习的位置。'},
    {id:'friend-quiet-meal',name:'饭够了，话没接上',text:'分量够两个人吃，却还没积攒到能聊开这件心事的信任。你们完成了一顿饭；TA说的“想坐会儿”，还有另一层意思。'}
  ]);
  const clone=value=>Core.clone(value);
  const money=value=>'¥'+(value/100).toFixed(2);
  const clamp=value=>Math.max(0,Math.min(100,value));
  const meta=Object.freeze({
    id:'friend',name:'给饭搭子留一份',budget:BUDGET,startMinutes:START,choiceField:'allocation',actionField:'response',
    choiceTitle:'两个人，实际怎么分？',actionTitle:'坐下来，还是送过去？',
    hook:'便宜的一单，真的够两个人吃吗？',
    intro:'18:10，口袋里有¥40。TA说今天不想吃辣，想坐一会儿；18:30前还得回自习室占位。点什么、谁先挑、在哪里吃，都会留下真实的得失。',
    sceneTitle:'18:10 · 取餐台旁的双人桌',personName:'饭搭子',initialResources:INITIAL,
    ruleText:'游戏规则：你饱腹20、TA10、信任40；双方各到50算吃够。神谕花1分钟。等餐取最慢餐品时间，每超过两份另加1分钟；超过6分钟信任−6。分餐花1分钟。TA吃够信任＋15，没吃够−10；实际收到麦香鱼每份＋12、辣堡每份−30，半份按一半计算。需求签信任＋5；持签再花2分钟举证，才可让TA先挑。坐下吃聊12分钟，双方吃够且信任≥60才聊开，成功再＋8信任；结束晚于18:30会失去自习座位。打包送达花5分钟和¥2，留住座位但没有这次深谈。停下来阅读不耗时；份量与饱腹是虚构游戏值，饱腹不封顶。',
    couponText:'仅优惠签可启用麦乐鸡(5块)演示券：每满两份只付一份，单份无优惠（两份付一份、三份付两份、四份付两份）。每次核验花2分钟；数量不足或券已失效，仍核验并按快照原价继续。',
    resources:[{key:'elapsed',label:'已用时间',format:'minutes'},{key:'wallet',label:'剩余预算',format:'money'},{key:'ownSatiety',label:'你的饱腹',format:'count'},{key:'friendSatiety',label:'TA的饱腹',format:'count'},{key:'trust',label:'信任',format:'score'}],
    oracles:[
      {id:'listen',title:'需求签 · 先听TA说完',text:'“今天不想吃辣。想吃鱼，也想坐会儿。18:30得回去占位。”',effect:'花1分钟，信任＋5；审判庭可再花2分钟举证，开放“让TA先挑”。'},
      {id:'deal',title:'优惠签 · 一份钱，两份鸡',text:'麦乐鸡(5块)每满两份只付一份；一份没有买赠。便宜不保证两人吃够。',effect:'花1分钟；可勾选演示券，核验再花2分钟。不能同时持有需求签。'}
    ]
  });

  function createEngine(quoteOrder){
    if(!Core||typeof Core.createTools!=='function')throw Error('饭搭子需要共享短局模块。');
    const tools=Core.createTools(quoteOrder,{
      id:'friend',foods:FOODS,budget:BUDGET,
      defaults:{oracle:null,coupon:false,argument:'accept',allocation:'equal',response:'sit'},
      fields:{oracle:[null,'listen','deal'],coupon:[false,true],argument:['accept','evidence'],allocation:['equal','self','friend'],response:['sit','drop']}
    });
    const clock=elapsed=>tools.clock(elapsed,START);
    function splitFood(items,cart,allocation){
      const entries=items.filter(f=>cart[f.name]).map((f,index)=>({food:f,index,qty:cart[f.name]}));
      const main=entries.filter(e=>e.food.main).sort((a,b)=>allocation==='friend'?
        b.food.preference-a.food.preference||b.food.satiety-a.food.satiety||a.index-b.index:
        b.food.satiety-a.food.satiety||a.index-b.index);
      const first=main[0]?.food.name;
      const trays={self:[],friend:[]};let ownFood=0,friendFood=0,taste=0,friendSpicy=0;
      for(const {food,qty} of entries){
        let ownQty=qty/2,friendQty=qty/2;
        if(food.main&&allocation!=='equal'){
          const chosen=food.name===first?1:0;
          ownQty=allocation==='self'?chosen:qty-chosen;
          friendQty=qty-ownQty;
        }
        const tasteText=food.taste>0?'喜欢':food.taste<0?'偏辣，不想吃':food.main?'温和':'可分享';
        if(ownQty)trays.self.push({name:food.name,servings:ownQty,points:food.satiety*ownQty,taste:tasteText});
        if(friendQty)trays.friend.push({name:food.name,servings:friendQty,points:food.satiety*friendQty,taste:tasteText});
        ownFood+=food.satiety*ownQty;friendFood+=food.satiety*friendQty;taste+=food.taste*friendQty;
        if(food.taste<0)friendSpicy+=friendQty;
      }
      return {trays,ownFood,friendFood,taste,friendSpicy,totalFood:ownFood+friendFood};
    }
    function calculate(run){
      const {items,count,snapshot}=tools.validate(run);
      const sameId=snapshot.coupons.filter(c=>c&&c.id==='nuggetbogo'&&c.type!=='full');
      const couponRuleMatches=sameId.length>0&&sameId.every(c=>c.rule==='bogo'&&c.target==='麦乐鸡(5块)'&&c.buy===1&&c.free===1);
      const quote=tools.quote(run,run.oracle==='deal'&&couponRuleMatches?['nuggetbogo']:[]);
      const errors=[],warnings=[],orderErrors=[];
      if(!run.oracle)orderErrors.push('先选一张神谕，再点晚饭。');
      if(!count)orderErrors.push('请点至少一份餐品；本局最多四份。');
      if(run.coupon&&run.oracle!=='deal')orderErrors.push('只有优惠签可以核验麦乐鸡买一送一。');
      if(quote.finalCents>BUDGET)orderErrors.push('本单需'+money(quote.finalCents)+'，超过¥40.00；尚未扣钱或等餐。');
      const wait=count?Math.max(...items.filter(f=>run.cart[f.name]).map(f=>f.prep))+Math.max(0,count-2):0;
      const verifyMinutes=run.coupon?2:0,oracleMinutes=run.oracle?1:0;
      const oracleResources={...INITIAL,elapsed:oracleMinutes,trust:INITIAL.trust+(run.oracle==='listen'?5:0)};
      if(run.coupon&&!quote.couponApplied)warnings.push(sameId.length&&!couponRuleMatches?
        '优惠快照中的 nuggetbogo 已改成其他规则，不是本局约定的“麦乐鸡(5块)买1送1”；不套用这张券，仍花2分钟核验，按原价'+money(quote.finalCents)+'继续。':
        '已锁定核券意图；数量不足或券失效，仍花2分钟核验，按原价'+money(quote.finalCents)+'继续。');
      const orderValid=orderErrors.length===0;
      const orderResources=orderValid?{...oracleResources,elapsed:oracleMinutes+wait+verifyMinutes,wallet:BUDGET-quote.finalCents,trust:clamp(oracleResources.trust-(wait>6?6:0))}:{...oracleResources};
      const courtAvailable=run.argument==='accept'||run.oracle==='listen';
      const courtError=courtAvailable?'':'没有需求签，无法花2分钟拿出TA的需求证据。';
      const argumentMinutes=run.argument==='evidence'&&courtAvailable?2:0;
      const courtResources={...orderResources,elapsed:orderResources.elapsed+(orderValid?argumentMinutes:0)};
      const allocationAvailable=run.allocation!=='friend'||run.oracle==='listen'&&run.argument==='evidence';
      const allocationError=allocationAvailable?'':'让TA先挑需要需求签，并在审判庭选择拿出需求证据。';
      const distribution=splitFood(items,run.cart,run.allocation);
      const choiceValid=orderValid&&courtAvailable&&allocationAvailable;
      const ownSatiety=INITIAL.ownSatiety+distribution.ownFood,friendSatiety=INITIAL.friendSatiety+distribution.friendFood;
      const friendFed=friendSatiety>=50,ownFed=ownSatiety>=50;
      const choiceResources=choiceValid?{...courtResources,elapsed:courtResources.elapsed+1,ownSatiety,friendSatiety,trust:clamp(courtResources.trust+(friendFed?15:-10)+distribution.taste)}:{...courtResources};
      errors.push(...orderErrors);if(courtError)errors.push(courtError);if(allocationError)errors.push(allocationError);
      return {valid:choiceValid,errors,warnings,orderErrors,orderValid,courtAvailable,courtError,allocationAvailable,allocationError,quote,count,wait,verifyMinutes,oracleMinutes,argumentMinutes,
        initialResources:{...INITIAL},oracleResources,orderResources,courtResources,choiceResources,
        distribution,trays:clone(distribution.trays),allocation:{own:distribution.trays.self.map(t=>({name:t.name,qty:t.servings})),friend:distribution.trays.friend.map(t=>({name:t.name,qty:t.servings}))},
        ownFed,friendFed,dialogueReady:choiceValid&&ownFed&&friendFed&&choiceResources.trust>=60};
    }
    function actionOptions(p){
      const valid=p.valid,base=p.choiceResources;
      const sit={...base,elapsed:base.elapsed+12,trust:clamp(base.trust+(p.dialogueReady?8:0))};
      const drop={...base,elapsed:base.elapsed+5,wallet:Math.max(0,base.wallet-200)};
      return [
        {id:'sit',title:'坐下吃，留十二分钟',text:'一起吃聊12分钟。双方饱腹≥50且信任≥60才会聊开，成功再＋8信任；结束晚于18:30，自习室双人位会被占。',effect:'＋12分钟，'+(p.dialogueReady?'能聊开，信任＋8':'当前无法深入交谈')+'；'+clock(sit.elapsed)+'结束'+(sit.elapsed>SEAT_DEADLINE?'，错过占位。':'，赶得上占位。'),available:valid,reason:valid?'':p.errors.join(' '),minutes:12,costCents:0,resources:sit},
        {id:'drop',title:'打包送到自习室',text:'游戏打包费¥2.00，送达5分钟。实际分到的晚饭不变；保留一起自习的机会，这次没有坐下深谈。',effect:'−¥2.00，＋5分钟，'+clock(drop.elapsed)+'送达；没有深谈的＋8信任。',available:valid&&base.wallet>=200,reason:!valid?p.errors.join(' '):base.wallet<200?'打包需要¥2.00，当前只剩'+money(base.wallet)+'；保留原意图，不能偷偷改为坐下。':'',minutes:5,costCents:200,resources:drop}
      ];
    }
    function preview(run){const p=calculate(run);p.availableActions=actionOptions(p);return p;}
    function argumentsFor(run){
      tools.validate(run);
      return [
        {id:'accept',title:'接受总价判词',text:'法官：“金额合规，两人吃好不在本庭保证范围。”',effect:'不增加时间；均分、自己先拿均可继续。',available:true,reason:'',resources:calculate({...run,argument:'accept'}).courtResources},
        {id:'evidence',title:'拿出TA的需求证据',text:'“总价低，不代表TA吃得够、吃得合口味。”需求签写着不吃辣、喜欢鱼、想坐会儿。',effect:'花2分钟，开放“让TA先挑”；不会自动改订单或分配。',available:run.oracle==='listen',reason:run.oracle==='listen'?'':'先持有需求签，才能拿出这份证据。',resources:calculate({...run,argument:'evidence'}).courtResources}
      ];
    }
    function choices(run){
      tools.validate(run);
      const descriptions=[
        {id:'equal',title:'每种食物，两人各半',text:'每种餐品数量各分一半；半份的饱腹和口味影响也按一半计算。',effect:'分餐花1分钟；所有餐品严格各半。'},
        {id:'self',title:'自己先拿一份主食',text:'你拿饱腹最高的一份汉堡，其余整份汉堡给TA；小食和饮料始终各半。没有汉堡时，全部各半。',effect:'分餐花1分钟；同饱腹按菜单顺序，规则固定。'},
        {id:'friend',title:'让TA先挑一份主食',text:'TA先拿一份最喜欢的汉堡：麦香鱼＞麦香鸡＞麦辣鸡腿堡；其余整份汉堡给你，小食和饮料各半。',effect:'分餐花1分钟；需求签＋2分钟举证才能开放。'}
      ];
      return descriptions.map(choice=>{const p=calculate({...run,allocation:choice.id}),available=choice.id!=='friend'||run.oracle==='listen'&&run.argument==='evidence';return {...choice,available,reason:available?'':'需要需求签，并在审判庭拿出需求证据。',resources:p.choiceResources,trays:p.trays};});
    }
    function actions(run){return actionOptions(calculate(run));}
    function resolve(run){
      const p=preview(run),timeline=[];let resources={...INITIAL};
      function node(id,stage,title,text,next,extra={}){if(next)resources={...next};timeline.push({id,stage,title,text,resources:{...resources},...extra});}
      function output(blocked,reason,ending,scene={}){return {timeline,resources:{...resources},ending:ending||null,blocked,reason:reason||'',quote:p.quote,preview:p,availableActions:p.availableActions,
        scene:{message:'TA：“今天不想吃辣，想坐会儿；18:30得回去占位。”',status:blocked?'这条时间线出现断点':'',trays:clone(p.trays),allocation:clone(p.allocation),...scene}};}
      const oracle=meta.oracles.find(o=>o.id===run.oracle);
      node('oracle','oracle','神谕阁 · '+(oracle?oracle.title:'尚未持签'),oracle?oracle.text+' '+oracle.effect:'先选择需求签或优惠签。',p.oracleResources);
      if(!p.orderValid){node('order','order','点单断点',p.orderErrors.join(' '),p.orderResources,{blocked:true});return output(true,p.orderErrors.join(' '),null,{trays:{self:[],friend:[]}});}
      node('order','order','取餐台 · '+p.wait+'分钟等餐',Object.entries(run.cart).map(([name,qty])=>name+' ×'+qty).join('、')+'。最慢餐品出餐＋超过两份的装载时间，共'+p.wait+'分钟；'+(run.coupon?'核券另花2分钟，'+(p.quote.couponApplied?'买赠有效':'没有有效优惠，仍按原价')+'；':'')+'实付'+money(p.quote.finalCents)+'。'+(p.wait>6?'久等超过6分钟，信任−6。':''),p.orderResources);
      if(!p.courtAvailable){node('court','court','审判庭 · 举证断点',p.courtError,p.courtResources,{blocked:true});return output(true,p.courtError);}
      node('court','court',run.argument==='evidence'?'审判庭 · 需求证据成立':'审判庭 · 金额合规',run.argument==='evidence'?'你把“不吃辣、想吃鱼、想坐会儿”摆上法庭。举证花2分钟，开放让TA先挑；法官：“本庭承认，总价不是两人体验的总和。”':'法官：“本庭只证明你付了'+money(p.quote.finalCents)+'，不保证这是两顿好晚饭。”未花申辩时间。',p.courtResources);
      if(!p.allocationAvailable){node('allocation','choice','分餐断点',p.allocationError,p.choiceResources,{blocked:true});return output(true,p.allocationError);}
      const describe=tray=>tray.length?tray.map(t=>t.name+' ×'+t.servings).join('、'):'没有食物';
      const tasteMessage=p.distribution.friendSpicy?'TA实际拿到了'+p.distribution.friendSpicy+'份辣堡：“今天真的不想吃辣。”':p.distribution.taste>0?'TA实际拿到了喜欢的麦香鱼。':'这一份没有TA特别喜欢或避开的口味。';
      node('allocation','choice','双人托盘 · '+({equal:'每种各半',self:'你先拿主食',friend:'TA先挑主食'}[run.allocation]),'整理分餐花1分钟。你：'+describe(p.trays.self)+'；TA：'+describe(p.trays.friend)+'。饱腹分别为'+p.choiceResources.ownSatiety+' / '+p.choiceResources.friendSatiety+'。'+tasteMessage+' 信任变为'+p.choiceResources.trust+'。',p.choiceResources);
      const action=p.availableActions.find(a=>a.id===run.response);
      if(!action.available){node('action','action','行动断点 · '+action.title,action.reason,p.choiceResources,{blocked:true});return output(true,action.reason,null,{message:tasteMessage});}
      node('action','action',action.title,action.effect,action.resources);
      const late=resources.elapsed>SEAT_DEADLINE,conversation=run.response==='sit'&&p.dialogueReady;
      let id;
      if(p.distribution.friendSpicy)id='friend-spicy-silence';
      else if(!p.friendFed&&p.ownFed)id='friend-left-hungry';
      else if(p.friendFed&&!p.ownFed)id='friend-self-hungry';
      else if(!p.friendFed&&!p.ownFed)id='friend-both-hungry';
      else if(!p.dialogueReady)id='friend-quiet-meal';
      else if(run.response==='drop')id='friend-room-delivery';
      else id=late?'friend-missed-seat':'friend-dialogue';
      const base=ENDINGS.find(e=>e.id===id),ending={...base,text:base.text+' '+clock(resources.elapsed)+(run.response==='drop'?'送达':'结束')+'；余额'+money(resources.wallet)+'；你饱腹'+resources.ownSatiety+'，TA饱腹'+resources.friendSatiety+'，信任'+resources.trust+'。'+(late?'18:30占位窗口已过。':'仍在18:30占位窗口内。')};
      node('result','result','轮回司 · '+ending.name,ending.text);
      return output(false,'',ending,{message:conversation?'TA：“谢谢你真的听完了。最近我有点撑不住，能再说两句吗？”':run.response==='drop'?'TA收到托盘：“一起自习吧，聊天下次补。”':tasteMessage,status:late?'18:30已过，双人位被占':conversation?'晚饭和心事都接住了':p.friendFed?'晚饭吃够了，深谈条件未满足':'TA还没有吃够',conversation,reservedSeat:!late,tasteMessage});
    }
    return {meta,makeRun:tools.makeRun,catalog:tools.catalog,restore:tools.restore,preview,resolve,
      compare:(run,replacement)=>tools.compare(run,replacement,resolve),encode:run=>tools.encode(run,resolve),decode:(fragment,snapshot)=>tools.decode(fragment,snapshot,resolve),
      arguments:argumentsFor,choices,actions,endings:ENDINGS};
  }
  return {createEngine};
});
