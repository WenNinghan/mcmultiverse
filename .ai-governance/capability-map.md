# 能力地图

登记日期：2026-10-16。基线为 `1b9744b`，实施后按实际入口回写。

## 前端组件 / 页面模式
| 能力 | 复用入口 | 适用场景 | 本次处理 |
|---|---|---|---|
| 单文件导航与三殿 | index.html: go / SECTIONS | 离线静态页面 | 扩展，保留独立入口 |
| 产品图与菜单 | index.html: DATA.menu / renderMenu | 商品展示与数量选择 | 复用 |
| 结算与判决 | index.html: openSettle / showVerdict | 展示计算证据 | 扩展 |
| 长篇分支剧情 | index.html: SCENES / renderScene / pick | 八条人生路线 | 扩展，保留剧情内容 |

## 共享状态 / 工具函数
| 能力 | 复用入口 | 适用场景 | 本次处理 |
|---|---|---|---|
| 存储降级 | index.html: store | 本地收藏与游戏状态 | 扩展 |
| 订单计算 | index.html: cartCalc / idealCalc | 演示报价 | 扩展为整数分、明确数量条件 |
| 人生结算 | index.html: pick / reincarnate / finishLife | 天赋、记忆与结局 | 扩展 |
| 三殿短局 / 单决策复玩 | index.html: 拟新增 journey 模块 | 公开情景的确定性复玩 | 新增：原三殿无共享任务和决策日志 |
| 小票导出 | index.html: 拟新增 Canvas 分享 | 保存结果与公开种子链接 | 新增：原按钮仅返回大厅 |

## 后端 Service / Mapper
不涉及。零依赖静态页面，无真实订单或支付。

## 权限 / 审计 / 异常 / 日志
不涉及认证。快照校验失败保留演示模式；不向公开页面放入凭证。

## 数据库脚本 / 测试数据
无数据库。复用 `test/galgame.test.cjs`、`test/menu-assets.test.cjs` 与 `data/mcd-real-data.example.json`；新增订单与短局回归。

## 文档 / 流程
复用 `README.md`、`MCP_INTEGRATION.md`。参赛声明、许可证、素材与维护脚本保留。

## 已知禁区
- 组合券不得按单份固定价格相乘；无效或涨价券不抵扣。
- 静态导出快照不得标为实时 MCP；虚构游戏属性不得标为真实营养预测。
- 测试不得依赖本机 C 盘绝对路径。
- 不删除或改名中文素材；不编造 WorkBuddy 开发对话。

## 2026-10-16 实施后回写
| 可复用能力 | 实际入口 | 验收 |
|---|---|---|
| 纯整数分订单与券 | index.html: quoteOrder / calculateIdeal | order 29/0 |
| 天赋与稳定终幕 | index.html: resolveChoice / selectLifeEnding | galgame 389/0 |
| 完整快照校验 | index.html: validateSnapshot / applySnapshot | 切换后过滤失效购物车，29项订单回归覆盖 |
| 确定性短局与链接 | index.html: window.McJourney | journey 15/0 |
| Canvas小票与档案 | index.html: saveReceipt / registerLifeEnding / showJourneyCollection | 实际PNG下载与浏览器恢复 |
| 结算键盘与庭审退出 | index.html: openSettle包装 / cancelTrial | 焦点进入弹层；回调恰好完成一次回归 |

## 早八因果局（2026-10-16）
| 能力 | 实际入口 | 复用边界 |
|---|---|---|
| 四资源与交通因果 | assets/morning-engine.js: McMorning.createEngine(quoteOrder) | 复用生产整数分报价；等待/饱腹/关系/交通均为独立虚构规则 |
| 仅改单份与断点 | assets/morning-engine.js: compare | 锁定全部非订单输入；预算或原交通失效时停止，不偷偷换路 |
| 严格新版本复玩 | assets/morning-engine.js: encode/decode | #am=1，与旧#mc=1隔离，冻结快照、日期与选择 |
| 早八现场与独立存档 | assets/morning-ui.js / morning.css | 原生DOM；独立浏览器收藏，保留旧三殿与短局 |
| 引擎验收 | test/morning.test.cjs | 实际生产quoteOrder；20项通过，3312组合、8结局可达；UI/线上验收另见归档 |
| 进行中恢复 | assets/morning-engine.js: restore / morning-ui.js: lastGameStage | 校验版本/快照/白名单，档案视图不覆盖游戏阶段 |

## 凌晨与饭搭子因果局（2026-10-16）
| 能力 | 实际入口 | 复用边界与验收 |
|---|---|---|
| 冻结快照、单份替换与严格分享 | assets/session-core.js: createTools | 复用生产quoteOrder；只替换一份，锁定其它输入；#ep=1与旧链接隔离，保持点餐顺序 |
| 精力、错误与提交窗口 | assets/midnight-engine.js: McMidnight.createEngine | 低精力改变真实工时和留错；证据修错、恢复方式、评审截止共同作用；19项、3000组合、6结局可达 |
| 实际分餐、口味与相处 | assets/friends-engine.js: McFriends.createEngine | 份量守恒，个人饱腹分别累计；需求证据解锁优先挑选，口味与信任决定深谈；16项、3762组合、8结局可达 |
| 两种现场与通用交互 | assets/sessions-ui.js / sessions.css | 午夜编辑器、双人餐桌；阶段资源、禁用理由、改单断点、小票、独立存档与档案返回 |
| 新情景入口 | index.html: startJourney / startDeepSession | 首页与旧命运单进入深度局；早八与原短局API、存储、链接保留 |
| 完整回归 | test/*.test.cjs | 七组499项通过；390/768/1440宽度检查、实际PNG下载和两局浏览器通关，证据见任务归档 |

## 首次体验与再玩（2026-10-16）
| 能力 | 实际入口 | 复用边界与验收 |
|---|---|---|
| 真实改单候选排序 | assets/replay-guide.js: McReplayGuide.analyze / describe | 调用原compare，不改计价/数值/后续意图；可完成且结局变化优先，无候选明确说明；13项生产引擎测试 |
| 结局首屏与因果展开 | assets/morning-ui.js: resultView / assets/sessions-ui.js: resultView | 先得失与实验问题，详细因果native details；手机主CTA实测全部在首屏 |
| 精简过程与精确预测 | 两UI: rules / shareView / chooseCards | 成本风险默认可见；预测展开不误推进；早八优惠签路线短判词直达分餐 |
| 角色回应 | morning-ui.js: 课后消息 / sessions-ui.js: friendsAfterword、midnightAfterword | 按实际资源/策略生成后话；不新增游戏时间，不改存档schema或分享选择 |
| 进行中入口与跨章清理 | morning-ui.js: hasMorningProgress / 两UI: clearReplayHash | 仅有效未完成局显示续局；显式新章清除旧am/ep/mc重玩hash，刷新不回旧章 |
| 聚焦首页与旧入口 | index.html: hall / hall-free | 手机首屏三局，原三殿/完整人生/情景目录native details保留 |
| 完整验证 | test/*.test.cjs / 任务归档 | 八组512通过；四条实际通关路线、三局默认改单与手动断点、档案/续局/PNG验证 |

## 三殿真实 MCP 本机试玩（2026-10-17，当前新副本入口）
本段是新副本当前实现；上文人生/剧情记录为历史能力，新的 index.html 不加载这些模式。原生产目录及旧实验目录保留。
|能力|实际入口|复用边界与验收|
|---|---|---|
|真实只读 MCP|server/mcp-client.mjs|官方 Streamable HTTP，JSON/SSE，initialize/tools/list；固定5个查询/计价Tool，Token项目外置|
|门店与默认规格|server/menu-adapter.mjs / triad-server.mjs|query-nearby-stores/meals/detail/coupons实际成功；默认特调/独立单品核对；不自动领券或下单|
|整数分真实报价|POST /api/quote|calculate-price实际成功；主食/饮品/数量固定，配餐单份替换；无本地估价兜底|
|三殿纯状态|assets/triad-core.mjs|两轮盲选、重选清空配餐、原盘刷新、时价变化独立、公开快照白名单与费用保留；18项单测|
|本机图片代理|GET /api/menu-image/:sessionId/:itemId|只代理本局已核实官方 CDN，限大小/类型，无凭证；配合 Canvas 导出|
|高清判决书|assets/triad-ui.js|实际浏览器下载 1400×1540 PNG 并检查；文字分享提供可选中复制回退|
|三殿美术|assets/triad.css / assets/triad/still-life.png|原生1672×941生成静物 + 真实餐品，奶油/森林绿/黄色，桌面与390手机视口试玩|
|验证|test/triad.test.mjs、test/triad-server.test.mjs|35通过0失败；只验证本轮新入口，旧模式测试不作为新入口验收；详细结果见本轮归档|

## 三殿 V2：一致性、亲手改单与新菜复玩（2026-10-17，当前副本入口）
本段对应 mcmultiverse-triad-v2-20261017；原三殿试玩目录与8780、正式站保持原版本，新副本使用8781，仅本机预览。上段为初版留档，V2入口以本段为准。
|能力|实际入口|复用边界与验收|
|---|---|---|
|单一结果表达与判词草稿|assets/triad-experience.mjs / assets/triad-v2-ui.js|统一网页/PNG/文字的B对A差价方向、最终盘与默认判词；handwritten逐字保留，含首尾空格；改盘、返回、换候选和分享实测|
|可跳过猜价与首次报价存证|assets/triad-core.mjs / triad-v2-ui.js|开始首次请求前冻结guessCents，actual绑定baseline首次官方报价；桌面猜35→43.50、手机跳过42.50实测；不混入MCP计价|
|候选虚影与亲手改单|assets/triad-v2-ui.js / assets/triad.css|推荐不自动replaceSide；桌面实际拖入中薯、手机键盘Enter换麦乐鸡；仅配餐一份变化，沿用服务端main/drink/quantity锁|
|新餐品复玩与真实耗尽|POST /api/context / server/triad-server.mjs|excludeMainIds/excludeSideIds各限60、去重、忽略旧时段ID；未见优先逐份详情验证，每类最多80；返回实际fresh counts，独立新session，失败无伪价；adapter原样复用|
|高清可分享取舍题|assets/triad-share.mjs|复用Canvas与图片代理；宽1400像素、按内容测量高度；真实下载A/B、80字手写PNG，最终80字图1400×1606，标题完整一行问号归位，产品、长餐名、完整判词及脚注无截断；复制弹窗回退实测，未宣称系统剪贴板成功|
|真实平台复玩证据|server/replay-evidence.json|同店两局23次成功只读调用；第二局麦辣鸡腿汉堡/枫糖厚松饼猪柳堡及麦乐鸡/鸡翅，fresh主食2配餐2；报价有变贵和变便宜两例|
|失败保持与可重试|triad-v2-ui.js / 既有同源桥接|实际阻断/api/quote出现Failed to fetch且保留配餐，最终重载核实猜35冻结且无可改输入，解除后48.50成功；localhost未生效的首次离线模拟不计通过；所有阻断已解除|
|本轮验证与边界|test/triad.test.mjs、triad-experience.test.mjs、triad-server.test.mjs|根agent实际执行62通过0失败；桌面1280×720、手机390×844完整通关；最终手机首页无横溢，三入口在屏内、餐图分开、标签与改单按钮清楚；最终PNG重载目视通过，Token精确扫描0命中，详见V2归档|

## 三殿 V3：结尾奖励、自动报价与复玩目标（2026-10-17，当前副本入口）

本段对应 mcmultiverse-triad-v3-20261017，本机8782；V2目录/8781、生产目录与正式站保留。用户后续指定由 WorkBuddy 接续部署，本轮交付本机版本及 WORKBUDDY_HANDOFF.txt，未 commit/push 或更新 Pages。前段 V1/V2 与人生/剧情均为历史记录，V3 当前首页只保留三殿。

|能力|实际入口|复用边界与验收|
|---|---|---|
|最新任务自动报价|assets/triad-flow.mjs: createQuoteCoordinator|新增可注入、无DOM协调器；同一冻结快照先A后B独立查价，新run/cancel令旧任务失效；旧A不再发B，旧结果/错误/settled不回写；11项受控异步测试覆盖倒序、取消及失败重试|
|亲手放入后查价、最后选盘|assets/triad-v3-ui.js: swap / quoteFlow / selectPlate / stamp|沿用core和服务端单份锁；候选不自动入盘，放入才查价，快速换玉米→薯饼实际只显示最后B41.50；0获选/无盖章，必须玩家手选A/B；换门店入口即取消旧报价|
|态度、猜价反馈与真实复玩目标|assets/triad-experience.mjs: choiceAttitude / estimateFeedback / replayGoal|网页/PNG/文字共用B对A方向与实际取舍表达；猜32→46.50低估14.50实测；跳过无假猜价；新局沿用上局真实误差或选择，官方返回主食/配餐各2新|
|手写保留与候选复核|triad-v3-ui.js: syncDraft / reasonWorkbench / selectPlate|本局手写逐字保留、无trim，换候选仅清当前A/B决定并提示复核；含首尾空格原文经过改选、换候选、失败重试、网页与PNG核对；只主动推荐或显式新局才替换/重置|
|结尾首屏与手机固定入口|triad-v3-ui.js: verdictView / assets/triad.css|先获选配餐、态度与整盘总价，完整依据native details；390×844手机分享/再玩top783/bottom832，无横溢；桌面分享/再玩直接可见|
|高清判决与分享文字|assets/triad-share.mjs / test/triad-share.test.mjs|共享真实快照，保留固定主食/饮品、两盘整盘总价、手写、费用、门店/时间及独立时价变化；真实下载短1400×1448、80字1400×1595并view_image检查完整；文字弹窗原文完整，不宣称系统剪贴板成功|
|失败保持与重试|triad-v3-ui.js / triad-flow.mjs / 原同源桥接|真实阻断/api/quote换玉米出现Failed to fetch，配餐与原文保留；解除后A46.50/B46.00成功；第二局Enter放鸡翅A46.00/B47.00，必须手选B|
|本轮验证及部署交接|五组test/*.mjs / README.md / WORKBUDDY_HANDOFF.txt|根执行104通过0失败；真实桌面/手机、连续改单、重试、新菜复玩、实际PNG与Token精确扫描0命中，详细见V3归档；本轮没有公网发布，后续由WorkBuddy处理运行环境与凭证边界|
