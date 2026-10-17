# 麦门·这一口我判了：三殿真实 MCP 本机试玩设计

日期：2026-10-17。状态：已确认的三殿方案进入实现。仅 G 盘新副本，暂不上线。

## 用户确认及范围
用户原话：“可以，就按这个三殿方案做，先打通真实 MCP，做出‘盲选→揭价→换一份→分享判决书’的完整体验。首页回到神谕阁、审判庭、轮回司三个入口，别再加人生模拟和剧情。美工也要做好，保留现版，在 G 盘副本修改，先给我试玩，暂时不上线。”
这次确认沿用上一轮已向用户呈现的完整三殿设计：两次视觉盲选、官方价格证据、只换一份、用户判词与判决书。接入实现细节为完成这一已确认需求所必需。没有新增人生/人物/剧情机制。

## G1 机械判定
实际计划文件：index.html、assets/triad.css、assets/triad-ui.js、assets/triad-core.mjs、assets/triad/still-life.png、server/mcp-client.mjs、server/triad-server.mjs、server/menu-adapter.mjs、test/triad.test.mjs、test/triad-server.test.mjs、mcp-config.example.json、README.md、MCP_INTEGRATION.md、.gitignore。14 个实现/配置/说明文件；生成资源与验收记录另计。
|条件|命中|依据|
|---|---|---|
|H1|是|上述文件 >=5|
|H2|否|无数据库，无表/字段/索引变化|
|H3|是|新增 localhost 只读菜单/门店/报价接口|
|H4|是|官方 Bearer Token 本机读取与同源限制|
|H5|是|真实 calculate-price 金额（不创建订单）|
|H6|否|新入口隔离旧共享模块，不改旧引擎|
|H7|是|接入真实远程 MCP 服务；不装第三方库|
|H8|是|浏览器 + 本机 Node 桥接|
|H9|是|本机启动与外部环境文件|
|H10|否|用户已确认三殿操作及只换一份；使用公开示例门店仅试玩，支持用户另搜门店|
命中 7 条，判定：大。未降级。

## 现状与证据
- 原生产目录保留：G:/WorkBuddy/2026-10-15-23-43-50/mcmultiverse。复制到 mcmultiverse-triad-20261017，复制后 index.html 两边均 244566 字节。
- MCP_INTEGRATION.md:3、20、33 明确旧项目没有真实 MCP 调用，quoteOrder 是本地计算。
- index.html:385 quoteOrder；2183 saveReceipt 可复用整数分表达与 Canvas 折行/导出思路，但不能把本地计价当成官方结果。
- index.html:86、90-92 存在原三殿入口；轮回司以前是人生模式，本次新首页不引用它。
- 当前实际 MCP initialize 成功：serverInfo mcd-mcp 1.0.0，protocolVersion 2024-11-05；tools/list 返回 35 Tools。实际 schema 已存工作区 work/mcd-tools-current.json（无 Token）。
- 官方真实字段：query-meals data.meals 为 map，currentPrice 为元字符串；calculate-price data.price/originalPrice/discount/productList.subtotal 为整数分。query-meal-detail 提供 rounds/defaults。以实际成功响应继续核实。
- Token 在项目外 G:/WorkBuddy/secrets/mcmultiverse-mcp.env，不能写入页面、repo、日志、分享。

## 能力地图核对
|类型|处理|复用/新增原因|
|---|---|---|
|页面/图像|扩展|复用 assets/menu 中文 PNG；重新制作三殿入口、餐盘与翻价/判章反馈|
|共享状态/工具|新增|旧 morning/session 引擎包含人生资源与剧情，不符合新范围；新纯状态引擎只记录两个盲选、固定餐盘、一次替换、两次真实报价|
|后端|新增|旧项目是静态页面，MCP_INTEGRATION.md 明示没有真实报价能力；需要本机凭证隔离与只读转接|
|权限/异常|新增|旧静态页不持 Token；仅固定官方 URL、五种只读 Tool；不开放 arbitrary tool/URL；限制同源与本机 Host|
|数据库/测试数据|不涉及/新增|无数据库；纯状态与适配器使用合成 fixtures 验证契约，页面不拿 fixtures 冒充实时数据|
|说明|扩展|复用 README/MCP_INTEGRATION，标记新副本范围和实际调用证据|

## 实现设计
1. Node 原生 http/fetch，同一 127.0.0.1:8780 提供静态页与 /api，只在本机启动。读取外部 env 文件，固定 https://mcp.mcd.cn。支持 JSON 与 SSE、session header、工具错误传播、超时。允许 query-nearby-stores/query-meals/query-meal-detail/query-store-coupons/calculate-price；无下单、领券、积分变更。
2. GET /api/health 返回连接状态与必要 Tool 名称，不含凭证；POST /api/stores {city,keyword} 查询到店取餐公共门店；POST /api/context {storeCode} 拉取菜单、必要详情与券，选择已验证可售独立单品。POST /api/quote {sessionId,itemIds} 服务器从缓存白名单生成真实商品列表、严格 1 份/项，不接收 raw Tool 或券码。报价返回总价整数分、已返回的原价/优惠、公开逐项小计、时间和门店范围。券只展示公开标题/有效条件，首局固定不用私人券，不自动领/绑。
3. 神谕阁：两轮大图盲选（主食/配餐），固定一份可售饮品；价格在两次选择完成前不进入 DOM。审判庭：官方成功报价后翻价；显示实际总额与明细，用户选择偏爱成立/我要改判。轮回司：保留主食与饮品，只替换一份配餐，原单/新单在相同门店重新官方报价；先后报价时间明示，若市场价格变化不能全归因于替换。
4. 默认候选来自可售、详情确认可独立点的同类别餐品，不能擅拆套餐。默认挑选两种不同主食、两种小食/配餐和饮料；不足则清楚说明该门店/时段无法开展此局，请换门店。
5. 分享为本机可下载 PNG 判决书与可复制文字，包含两盘、金额、替换的一项和用户判词；冻结历史报价并标注时间、门店及非订单。此轮不宣称 localhost 链接可供异地好友打开。
6. 美术：奶油底、深绿、大幅真实餐品、黄/珊瑚色点缀、纸张与判章。生成高清无字静物作装饰，真实产品依 MCP/已有官网素材，生成图不承担价格/组成事实。手机优先，大点击区；CSS 翻价与印章反馈，尊重 reduced motion。

## 不采用的方案
- 继续 Galgame/人生分支：用户明确取消，玩法重复。
- 浏览器直连放 Token：会暴露个人凭证。
- MCP 失败转旧 quoteOrder：会将估计价伪装实时，阻断真实验收。
- 为试玩新增云服务/上线：用户要求暂不上线。

## 风险与回滚
Token 失效/上游不可用：保留盲选，可重试，不展示伪报价；错误脱敏。菜品时段/库存变化：以当次门店返回为准，菜单不足即提示。套餐/特调：首局筛选可独立点单品，按详情默认特调传参；不猜组件。报价不含没返回的优惠数据，不分摊虚构优惠。网页未下单、未支付。
回滚：关闭本机 Node 会话即可；原生产和所有旧 G 盘目录未改。新目录独立，未 commit/push/部署。

## 验收
- 真实 initialize/list + 门店/菜单/详情/calculate-price 成功证据，公开脱敏摘要。
- 盲选 DOM 不泄露金额；两轮选择共享到审判庭；主食/饮品锁定，仅一份配餐改变。
- 总额及差额为服务器整数分，无局部兜底；失败保留选择、可重试；不同时间价变单独提示。
- 下载真实 PNG，中文长名称可读，含历史报价/门店/非订单。
- 桌面与手机实际完整流程；键盘/点按等效；无横向溢出。
- Token/券码不进入静态响应、截图、分享、跟踪文件。

实现前结论：沿用用户刚才对具体三殿方案的明确确认，继续已授权实现；任何新增业务口径再单独核实。

## G3实施状态
已实施，技术验收记录见 docs/历史档案/任务归档/2026-10-17_三殿真实MCP本机试玩验收.md。等待用户试玩评价；暂未上线。
