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
