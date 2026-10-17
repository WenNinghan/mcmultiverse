# workbuddy.md · WorkBuddy 开发对话上下文

> 本文件用于 WorkBuddy 专项奖励核验，需包含使用 WorkBuddy 开发本项目的完整对话上下文。

## 使用说明（提交前请替换本节）

本项目全程在 WorkBuddy 中开发。正式提交前，请从 WorkBuddy 导出本项目的完整开发对话（Markdown 格式），替换本文件「对话记录」一节的内容。

导出内容应覆盖以下关键过程：

1. **需求与创意构思**：从麦当劳 MCP 能力出发，确定「神谕阁 / 审判庭 / 轮回司」三殿合一的项目形态
2. **MCP 连接器配置**：在 WorkBuddy 中通过【连接器 → 自定义连接器 → 配置 MCP】接入 `https://mcp.mcd.cn`（配置见 `mcp-config-example.json`）
3. **核心开发过程**：index.html 的结构设计、三大玩法逻辑、UI 风格迭代
4. **MCP 真实调用验证**：调用 `query-meals`、`query-store-coupons`、`campaign-calendar` 等 Tool 并导出 `data/mcd-real-data.json` 的过程
5. **调试与修复**：开发中遇到的问题及修复记录

## 对话记录

### 2026-10-17 晚 · 线上部署轮（WorkBuddy 实际执行纪要）

本轮对话由用户交接「三殿 V3 本机版已完成，需在 WorkBuddy 中完成部署与线上验收」开始，全程在 WorkBuddy 中执行，关键过程如下：

1. **交接摸底**：用户指定 V3 目录 `mcmultiverse-triad-v3-20261017`（V2 保留于 `-v2-`，本机端口 8781/8782），并给出八条体验规则（盲选、封存猜价、只改单份配餐、A/B 无默认、手写判词逐字保留、判决首屏、PNG 分享口径、复玩引用真实数据）与凭证位置（项目外 `G:\WorkBuddy\secrets\mcmultiverse-mcp.env`，仅服务端读取）。
2. **部署形态决策**：确认 WorkBuddy 应用发布只暴露单端口、要求监听 `PORT` 并绑定 `0.0.0.0`、无环境变量注入参数 → 选择**整站同源部署**（同一 Node 服务提供静态页与 `/api/*`），前端零改动，不存在「首页可开但查价失效」的中间态。
3. **服务端公网化改造**（`server/triad-server.mjs`，默认本机行为不变）：新增 `access` 配置——`publicMode`、Host 白名单、Origin 白名单、信任反代头、按 IP 限流（180 次/分）、每 IP 局数上限（8）；`deploy-start.mjs` 作为线上启动器，从部署副本内的 `deploy-secret.env` 读凭证注入进程环境（不出现在命令行/日志/响应）。新增 5 项公网边界测试，合计 **109 项通过**。
4. **部署副本与凭证隔离**：部署副本放在 Git 仓库之外（`-online` 目录），凭证以 `cp` 复制、全程未读取内容；`.gitignore` 排除 `deploy-secret.env`。
5. **上线与两次修复**：首次部署后 `health` 直连正常，但浏览器同源请求被 403——排查确认部署平台反代会改写 `Host` 且不透传 `x-forwarded-host`，无法可靠还原自域名；最终策略改为「未显式配置 Origin 白名单时交给 `Sec-Fetch-Site` 与限流把关，配置白名单后严格校验」，重新部署后线上同源 200、跨站 403。
6. **线上真实验收**（公开 URL 全流程）：连接 MCP（5 个只读工具）→ 搜索并选择真实门店（上海黄浦华旭国际大厦餐厅）→ 盲选主食/配餐 → 揭价（真实 `calculate-price`，整盘 ¥43.50）→ 换入中薯条自动双盘查价（A ¥41.50 / B ¥46.50）→ 亲手选 B → 盖章 → 判决页；390×844 手机视口复跑同样到达判决页；「分享高清判决」实际下载 PNG（A/B 两盘、真实门店、两次查询时间戳、手写判词原样、版权脚注齐全）。
7. **凭证泄露扫描**：抓取线上全部前端资源检索凭证痕迹 0 命中；用真实 token 值对线上资源做静默全文比对 0 命中；`/deploy-secret.env`、`/deploy-start.mjs`、`/server/*` 均不可访问（403/404）；`/api/health` 响应无凭证。
8. **冒烟与测试**：`tools/online-smoke.mjs` 线上只读冒烟 14/14 通过（含无凭证泄漏断言）；`node --test` 五组测试 109/109。

本轮涉及文件：`deploy-start.mjs`（新增）、`server/triad-server.mjs`（公网边界）、`test/triad-server.test.mjs`（+5 项公网测试）、`.gitignore`、`README.md`（线上部署章节）、`WORKBUDDY_HANDOFF.txt`、`tools/online-smoke.mjs`。提交 `383706e feat: 三殿V3上线——同源部署、公网边界与线上冒烟`。

（后续对话记录请从 WorkBuddy 导出后继续追加）
