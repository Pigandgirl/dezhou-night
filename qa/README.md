# QA 测试脚本（修复后）

这些脚本用于复跑《德州之夜》修复后的服务端、牌局引擎、房间、容量与浏览器测试。
全部使用 `server/` 的临时副本，不会改动仓库数据或生产环境。

## 环境

- Node.js 22+（实测 v26.3.1）
- Windows（RSS 采样用 `tasklist`；浏览器测试默认 Edge 路径）
- 无需 `npm install`

## 套件

| 脚本 | 内容 | 规模 |
|---|---|---|
| `engine-test.mjs` | 服务端牌局引擎：盲注、单挑/多人、边池、摊牌、超时、离开、结算守恒、好友房自定义筹码、输家观战 | 12 项 |
| `run-logic.mjs` | 牌型评估、10 万手交叉验证、20 万手分布、洗牌、边池、机器人 | 23 项 |
| `run-integration.mjs` | 注册/登录、限流、改密踢会话、好友房自定义、SSE、服务端权威对局、观战脱敏、筹码结算 | 16 项 |
| `run-rooms.mjs` | 房间口令、防爆破、8 座 + 32 观战、跨房 Token、房主移交、连接复用、房间配额、房主配置 | 9 项 |
| `run-match.mjs` | 4 个匹配房、1→4 顺序填满、自动开局、重连、房主转移、32 座容量上限 | 8 项 |
| `run-security.mjs` | Host 头崩溃、异步 scrypt、登录锁定、房间配额、SSE 复用、操作洪泛 | 8 项 |
| `run-api.mjs` | 账号/管理后台/筹码榜/路径穿越/APK/安全头/6 小时筹码/快速匹配门槛/全局权限开关 | 51 项 |
| `run-load.mjs` | HTTP 吞吐、100 房 × 8 人、800 SSE、500 次行动广播、RSS | 1 轮 |
| **合计** | **128 项自动化检查** | |
| `run-browser.mjs` | Edge headless 单机 3D、XSS 载荷失效验证 | 1 轮 |
| `run-online-browser.mjs` | 两个真实浏览器客户端在线对局、状态/底牌/行动/完整结算列表/弃牌获胜底牌/在线人数 | 1 轮 |
| `run-single-settle.mjs` | 单机真实 2 人 3D 牌局、第一人称结算列表、相机不动、弃牌获胜底牌、3D 待机动作/环境声 | 1 轮 |
| `shot-lobby.mjs` | 大厅访客/登录/修改昵称/设置截图与 DOM 校验、退出按钮右上角 | 1 轮 |
| `shot-mobile.mjs` | 844×390 横屏与 390×844 竖屏适配、结算列表布局 | 1 轮 |
| `shot-admin.mjs` | 后台登录/概览/确认无兑换码入口 | 1 轮 |

## 运行

在项目根目录：

```powershell
node qa/engine-test.mjs
node qa/run-logic.mjs
node qa/run-integration.mjs
node qa/run-rooms.mjs
node qa/run-match.mjs
node qa/run-security.mjs
node qa/run-api.mjs
node qa/run-load.mjs
node qa/run-browser.mjs
node qa/run-online-browser.mjs
```

结果写入 `qa/out/*.json`，截图：

- `qa/out/lobby.png` / `lobby-user.png`（新主界面）
- `qa/out/lobby-settings.png` / `lobby-settings-user.png`（设置中心）
- `qa/out/lobby-mobile-landscape.png` / `lobby-mobile-portrait.png`（移动端）
- `qa/out/lobby-mobile-settle.png`（移动端结算列表）
- `qa/out/fold-settle.png`（弃牌获胜也公开赢家底牌）
- `qa/out/single-player.png`（单机 3D）
- `qa/out/online-table.png`（在线 2D 牌桌）
- `qa/out/online-settle.png`（完整结算列表：底牌/最佳五张/输赢原因）
- `qa/out/fold-settle.png`（弃牌获胜也公开赢家底牌）
- `qa/out/single-settle.png`（单机第一人称结算列表）
- `qa/out/single-fold-settle.png`（单机弃牌获胜也公开赢家底牌）

## 重要说明

- `run-match.mjs` 会在临时副本里把 `MATCH_COUNTDOWN_MS` 从 60 秒改成 1.2 秒，以便快速验证自动开局；生产代码仍是 60 秒。
- `run-load.mjs` 通过环境变量临时放宽房间创建/加入的 IP 限流（`RL_ROOM_CREATE` / `RL_ROOM_JOIN`），仅用于制造 100×8 的并发规模；生产默认值仍生效。
- `run-security.mjs` 的 Host 头用例现在期望服务器**存活**（修复前会崩溃）。
- 生产 `http://192.144.159.220:8080` 当前为 **1.0.67**（2026-10-24 部署）；仍为 HTTP，不要在生产上跑 `run-load.mjs` / `run-security.mjs`。
- 旧版 APK（≤1.0.26）仍使用 query token；1.0.67、Web 与后台使用 `Authorization: Bearer`，服务端保留旧版回退。
