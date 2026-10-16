# MCP 集成说明 · 麦门宇宙

本文档说明「麦门宇宙」实际使用的麦当劳 MCP Server、Tool、调用流程与业务价值。

## MCP Server

- **Server**：麦当劳中国 MCP Server
- **接入地址**：`https://mcp.mcd.cn`
- **协议**：Streamable HTTP
- **鉴权**：`Authorization: Bearer ${MCD_MCP_TOKEN}`（Token 于 [open.mcd.cn/mcp](https://open.mcd.cn/mcp) 申请，配置示例见 `mcp-config-example.json`，仅含环境变量占位符）
- **开发工具**：WorkBuddy（自定义连接器接入，见 `workbuddy.md`）

## 架构：两层设计

```
┌─────────────────────────────────────────────┐
│  展示层：index.html（三座大殿的交互与动画）      │
│  启动时尝试加载 data/mcd-real-data.json        │
│  成功 → 真实数据驱动（亮起 MCP 徽章）           │
│  失败 → 内置演示数据兜底（离线可玩）            │
├─────────────────────────────────────────────┤
│  数据层：WorkBuddy 对话中调用 mcd-mcp Tools    │
│  返回结果导出为 data/mcd-real-data.json        │
└─────────────────────────────────────────────┘
```

## 各殿使用的 Tool

### 🎲 神谕阁（每日一卦）

| Tool | 用途 |
|---|---|
| `campaign-calendar` | 查询当月营销活动日历，卦象的「今日麦运套餐」优先推荐当日真实进行中的活动餐品 |
| `query-my-coupons` | 查询用户已有优惠券，卦象推荐优先命中"你手里正好有券"的餐品 |
| `available-coupons` / `auto-bind-coupons` | 卦象生成前自动领券，确保推荐的优惠真实可领 |
| `list-nutrition-foods` | 生成「麦运指数」时参考餐品营养数据（如热量适中加分） |
| `now-time-info` | 判定是否为周四，触发疯狂星期四特别卦象 |

**调用流程**：`now-time-info`（判周四）→ `auto-bind-coupons`（一键领券）→ `campaign-calendar`（当日活动）→ `query-my-coupons`（我的券）→ 组合生成卦象推荐。

### ⚖️ 审判庭（订单审判）

| Tool | 用途 |
|---|---|
| `query-meals` | 拉取当前门店真实可售菜单与价格，作为审判庭的"物证清单" |
| `query-meal-detail` | 查看套餐组成，为"换个姿势下单"的替代方案提供依据 |
| `query-store-coupons` | 查证当前门店可用优惠券，作为法官的"呈堂证供" |
| `calculate-price` | 分别计算"原价"与"券后最优价"，差价即血亏金额 |

**调用流程**：`query-meals`（真实菜单）→ `query-store-coupons`（可用券）→ `calculate-price`（原价 vs 券后价）→ 生成庭审实录与判决书。

### 📜 轮回司（人生重开）

| Tool | 用途 |
|---|---|
| `list-nutrition-foods` | 体重属性变化以真实餐品能量数据为基准推算 |
| `query-meals` / `calculate-price` | 人生各阶段事件涉及的消费金额以真实价格累计 |
| `campaign-calendar` | 人生大事记中缝入真实年度活动（如"那年你参加了 1024 程序员节"） |
| `query-lottery-info` / `draw-lottery` | 「积分囤积癖」天赋与「麦门圣僧」结局的抽奖事件来源 |

## 业务价值

整活的外壳下，三座大殿各自对应真实的用户价值：

1. **神谕阁** = 决策辅助 + 优惠券触达。用玄学包装解决"选择困难"，顺带让用户发现"我账户里居然有券"，提升优惠券核销率。
2. **审判庭** = 订单体检 + 省钱教育。用庭审游戏化呈现"没用券亏了多少钱"，把领券动作变成"赎罪"，比任何弹窗提醒都让人印象深刻。
3. **轮回司** = 会员生命周期叙事。把积分、抽奖、活动日历、营养数据缝进一个"吃一辈子麦当劳"的故事里，本质是麦门会员体系的拟人化导览。

## 隐私与合规

- 页面不收集、不上传任何用户信息，所有交互在本地浏览器完成
- `mcd-real-data.json` 仅包含餐品/价格/券面额等公开商品数据，不含 Token、订单、地址等个人数据
- Token 仅以环境变量占位符形式出现在 `mcp-config-example.json`
