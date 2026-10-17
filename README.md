# 麦门宇宙 · 这一口，我判了。

**先盲选，再揭价，只换一份，最后给自己的偏爱盖章。**

这是使用麦当劳中国真实 MCP 菜单与报价的互动试玩。首页只有神谕阁、审判庭、轮回司三个入口，同一份选择贯穿三殿。**V3 已于 2026-10-17 由 WorkBuddy 部署上线，公开入口 [https://mcmultiverse-triad.app.workbuddy.host/](https://mcmultiverse-triad.app.workbuddy.host/)（整站同源：前端与只读 API 同一 Node 服务）；本机试玩 8782、V2 副本 8781 保留，部署细节见 [WORKBUDDY_HANDOFF.txt](WORKBUDDY_HANDOFF.txt) 与下方「线上部署」。**

## 怎么玩

1. **神谕阁 · 先盲选。** 不看价格，先选一份主食，再选一份配餐；固定饮品随盘保留。餐品来自所选门店当前返回的可售菜单。
2. **审判庭 · 可猜价，再揭价。** 可以先猜这三份单点的总额，也可以直接跳过，不预设金额引导猜测。开始首次查询前猜价即封存，重试不会改动；官方 `calculate-price` 返回总额后，翻价反馈明确说出低估、高估或猜中。估价不影响官方报价，后续时价变化也不会改写这次猜价记录。
3. **轮回司 · 亲手只换一份。** 推荐仅为候选，点选或拖入后才真正替换。主食、饮品、数量、门店和用券方式都锁定；放入配餐后自动依次查询 A 原盘与 B 新盘，明确写出“B 比 A 贵／便宜／同价”。快速更换候选时只采用最新一轮结果，旧响应不会覆盖当前餐盘。**报价完成不自动站队，必须由玩家选 A 或 B 后才能盖章。**
4. **盖章出票。** 结尾先展示“省五毛也不换”一类基于实际取舍的态度、选中配餐和整盘总价，分享与再玩入口直接可见；手机提供固定操作栏，完整 A/B 与报价依据可展开。默认判词随最终 A/B 选择、餐品和真实差价同步；本局手写判词在换候选、改判、返回和导出时逐字保留，含首尾空格。只有主动点选推荐句才会替换手写内容，开新局则重置。保存宽 **1400 像素、按内容自适应高度的 PNG 判决书**，或复制分享文字；图片突出选择态度和具体取舍题，同时保留完整判词、整盘价格及历史报价依据。

右上角可以搜索城市与门店。首页标明从神谕阁开始，后两殿显示所需步骤。结尾会根据上局真实猜价误差邀请“再猜一盘”；猜中则挑战再猜中，跳过则从实际选中的配餐邀请再做一次选择，不编造未来价格。点击再玩会重新查询同门店真实菜单，优先准备本次页面会话里未见过的主食与配餐，逐项核对可独立点餐与默认规格。供应不足时用已见商品补位并显示实际新鲜数量；当前可核验商品已轮过会明确提示，可换门店继续。每局是独立会话，重新加载页面会清空本地已见记录。当前试玩没有公开复玩链接，分享通过图片与文字完成。

## 启动本机试玩

需要支持原生 `fetch` 的现代 Node.js；本次测试使用 **Node.js v24.13.0**。无第三方依赖，无前端构建步骤。

先在项目外配置凭证文件：

```text
G:\WorkBuddy\secrets\mcmultiverse-mcp.env
```

文件内容为 `MCD_MCP_TOKEN=` 加上自己的有效 Token。凭证仅由本机 Node 桥接读取，不写入网页、图片或仓库。也支持进程环境变量 `MCD_MCP_TOKEN`；自定义凭证文件路径可设置 `MCD_MCP_ENV_FILE`。

在 PowerShell 运行：

```powershell
Set-Location 'G:\WorkBuddy\2026-10-15-23-43-50\mcmultiverse-triad-v3-20261017'
$env:TRIAD_PORT = '8782'
node server/triad-server.mjs
```

打开 [V3 本机试玩](http://127.0.0.1:8782/index.html)。桥接仅监听 `127.0.0.1`；以上命令通过 `TRIAD_PORT` 将 V3 设为 8782，保留 [V2 试玩](http://127.0.0.1:8781/index.html) 的独立目录及端口，初版仍使用 8780。直接双击 HTML 或仅运行普通静态文件服务器，无法提供本版所需的真实菜单与报价接口。

## 线上部署（2026-10-17）

线上地址：**<https://mcmultiverse-triad.app.workbuddy.host/>**（WorkBuddy 应用发布，整站同源）。

- **同源形态**：同一个 Node 服务同时提供静态页面与 `/api/*`，前端零改动、不存在「首页可开但查价失效」的中间态。服务端以 `node deploy-start.mjs` 启动：读取部署目录内的 `deploy-secret.env`（不进 Git）注入 `MCD_MCP_TOKEN`，监听 `PORT` 并绑定 `0.0.0.0`。
- **公网边界**（`server/triad-server.mjs` 的 `access` 配置，默认本机行为不变）：公网模式信任反代头、按 IP 限流（默认 180 次/分钟）、每 IP 最多 8 个进行中的局、始终拒绝 `Sec-Fetch-Site: cross-site`；如平台透传真实域名，可用 `TRIAD_ALLOWED_HOSTS` / `TRIAD_ALLOWED_ORIGINS` 收紧为白名单。
- **凭证安全**：Token 只存在于部署副本的 `deploy-secret.env` 与服务端进程内存；`.gitignore` 显式排除，不出现在命令行、日志、网页、API 响应、PNG 与 Git 历史中。服务端错误信息经 `publicMessage` 脱敏。
- **线上冒烟**：`TRIAD_BASE=https://mcmultiverse-triad.app.workbuddy.host node tools/online-smoke.mjs` 走一遍 health / 门店 / 开局 / 报价 / 图片，并断言响应不含凭证。2026-10-17 实际结果 **14/14 全过**（上海人民广场示例门店，巨无霸＋中薯条＋小杯鲜萃咖啡整盘 ¥48.50，中文文件名餐品图线上可访问）。
- GitHub 仓库只保存源码与文档；静态 GitHub Pages 不运行 Node 桥接，公开可玩入口以上述同源部署为准。

## 真实数据与边界

页面通过本机桥接调用官方 `https://mcp.mcd.cn`：查询门店、可售菜单、单品详情、门店优惠信息，再计算价格。实际调用与脱敏结果见 [MCP 集成说明](MCP_INTEGRATION.md)、[初版成功调用证据](server/public-evidence.json) 和 [V2 新餐品复玩证据](server/replay-evidence.json)。

- 开场默认查询上海“人民广场”附近的示例餐厅；这是试玩位置，不代表玩家位置。
- 价格按所选门店、到店取餐方式、查询时刻和默认规格返回；金额保留为整数分。页面不自行编造优惠或补出接口未返回的金额。
- 本局不领取、绑定或使用私人券，不创建订单、不付款，也不改变积分。门店优惠信息仅供核对，未作为券参数传入报价。
- 比较时分别重新查询 A、B 两盘；若原盘价格自首次揭价发生变化，会单独说明。两次报价仍是先后查询，不能保证同一时刻的库存或价格。
- 查询失败会保留选择并提示重试；没有用演示价代替真实报价的兜底。菜单会话有效期为 30 分钟，过期后需要重新开局。
- 判决书保留两盘的历史报价与时间，不是订单或消费凭证。当前门店价格、供应与活动以实际点餐时官方渠道为准。

这版通过 **Node 桥接**连接 MCP：本机默认监听 `127.0.0.1`，线上以只读同源服务运行（见「线上部署」）。本轮线上部署与验收由 WorkBuddy 完成；历史 [workbuddy.md](workbuddy.md) 保留原样，部署记录见 [WORKBUDDY_HANDOFF.txt](WORKBUDDY_HANDOFF.txt)。

## 验证

从项目目录运行：

```powershell
node --test test/triad.test.mjs test/triad-experience.test.mjs test/triad-flow.test.mjs test/triad-share.test.mjs test/triad-server.test.mjs
```

2026-10-17 V3 实际执行上述五组测试，**109 项通过、0 项失败**（104 项业务契约 + 5 项线上部署边界：公网 Host 白名单、显式 Origin 白名单、反代改写 Host 场景、按 IP 限流、每 IP 局数上限），覆盖真实来源契约、整数分、默认规格、只换一份、A/B 差价方向、默认与手写判词、可跳过估价、真实复玩目标、自动查价的倒序响应与失败重试、分享文字及 PNG 布局、新餐品复玩与耗尽、只读工具白名单和本机/公网访问边界。测试采用受控响应；官方真实调用证据另见 [public-evidence.json](server/public-evidence.json) 与 [replay-evidence.json](server/replay-evidence.json)。

V3 已完成真实桌面和 390×844 手机通关：猜 ¥32 的板烧、中薯与咖啡实际报价 ¥46.50，明确低估 ¥14.50；快速连续换候选只采用最后一盘，查价完成仍须亲手选择 A/B。临时阻断报价接口实际触发失败，解除后重新取得 A ¥46.50／B 玉米 ¥46.00，手写首尾空格在改选、换候选和重试中保留。下一局取得主食、配餐各两份新候选，手机键盘放入鸡翅后 A ¥46.00／B ¥47.00，跳过猜价并亲手选 B。以上均为查询时刻的历史价格。

手机结尾分享和再玩固定入口在屏内，无横向溢出。浏览器实际下载的短判词 PNG 为 **1400×1448**，80 字原文 PNG 为 **1400×1595**，均目视检查了全文、餐品及脚注；文字分享弹窗完整保留原文，未宣称系统剪贴板已验证。实际 Token 精确扫描项目为 0 命中。完整方式与图像证据见 [V3 验收归档](docs/历史档案/任务归档/2026-10-17_三殿V3验收.md)，最终展示微调的复验以归档末尾记录为准。

[V2 验收归档](docs/历史档案/任务归档/2026-10-17_三殿V2本机试玩验收.md) 保留作历史证据，其中的截图、PNG 尺寸和试玩结果属于 V2，不作为 V3 已通过的证明。

## 当前入口与文件

- `index.html`：唯一页面入口，三个大殿与判决书。
- `assets/triad-v3-ui.js`、`assets/triad-core.mjs`、`assets/triad.css`：本版交互、选择与报价契约、界面样式。
- `assets/triad-experience.mjs`、`assets/triad-share.mjs`：统一 A/B 与判词表达、判决书文字及自适应 PNG 输出。
- `assets/triad-flow.mjs`：自动查询 A/B 的调度，仅最新有效任务可以提交结果。
- `server/triad-server.mjs`、`server/mcp-client.mjs`、`server/menu-adapter.mjs`：服务端、官方 MCP 传输与数据核对（本机与线上同一套代码）。
- `deploy-start.mjs`：线上启动器，从部署目录内凭证文件读 Token 注入进程环境并以公网约束启动服务。
- `tools/online-smoke.mjs`：线上只读冒烟脚本，覆盖 health / 门店 / 开局 / 报价 / 图片并断言无凭证泄漏。
- `assets/menu/`：保留中文文件名的餐品 PNG；新静物背景及生成记录在 `assets/triad/`。
- `mcp-config.example.json`：MCP Client 示例，仅环境变量占位符。
- `WORKBUDDY_HANDOFF.txt`：本轮状态、实际验证与后续 WorkBuddy 部署接续说明。

副本内的旧版文件仍保留；当前首页不引入旧游戏引擎，也不提供其入口。**V3 已上线**：公开可玩入口为 [同源部署](https://mcmultiverse-triad.app.workbuddy.host/)，GitHub 仓库保存源码与文档（Token 不入仓）。静态 GitHub Pages 无法运行 Node 实时桥接，因此不把 Token 放进静态 Pages，也不以静态页冒充实时能力；服务端接入与访问约束的实际结果见「线上部署」一节与 [WORKBUDDY_HANDOFF.txt](WORKBUDDY_HANDOFF.txt)。

## 素材与许可

源码和文本按 [LICENSE](LICENSE) 授权；餐品图片、名称、商标及引用活动信息具有独立权利归属，不属于 MIT 授权范围。已有官网餐品素材来源见 [素材映射](tools/menu_image_map.json)；同系列规格可能复用图片，图片不代表套餐全部组成或当前可售状态。首页静物背景是新生成的装饰资产，不作为官方商品照片。

本项目为非官方创意作品，不代表麦当劳官方关联或背书。参赛声明见 [CONTEST_DECLARATION.md](CONTEST_DECLARATION.md)。开发与调用核验使用实际记录，配置示例不替代调用证据。
