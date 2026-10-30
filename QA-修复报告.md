# 德州之夜（Dezhou Night）修复报告

- **修复日期**：2026-10-24
- **对应审计**：[QA-测试报告.md](QA-测试报告.md)（修复前）
- **范围**：报告中的 P0 / P1 全部修复，P2 已修复可落地项；微信登录与支付按要求不实现；持久化/旧 APK 等需要单独工程的事项见“剩余风险”
- **验证**：128 项自动化检查全部通过 + 多轮真实浏览器/移动端验证 + 1 轮 800 客户端容量测试
- **已上线**：APK 1.0.67（versionCode 68）已打包签名；生产 `http://192.144.159.220:8080` 已部署 1.0.67 并验证。TLS/域名尚未配置，当前为 HTTP。

> **2026-10-24 第三/四轮体验改造**：摊牌结算列表公开所有剩余玩家底牌、最佳五张、牌型细节与输赢原因，弃牌获胜也展示赢家底牌；准备时间统一 15 秒；主页面显示在线人数；登录/退出等收进设置；删除兑换码；大厅与移动端重做。详见 [界面改造说明.md](界面改造说明.md) 与 [RELEASE-1.0.67.md](RELEASE-1.0.67.md)；回归总数为 128 项 + 单机真实牌局结算验证。

---

## 一、最重要的变化：牌局改为服务端权威

修复前，洗牌、发牌、下注、结算全在“房主”浏览器里运行，服务器只转发房主发来的 JSON。这是 P0-4 的根因，靠打补丁无法修复。

修复后：

```
客户端（所有人，包括房主）          服务器
  GuestTable 2D 牌桌        <--->   GameEngine
  - 只发 action 意图                - 洗牌 / 发牌（crypto.randomInt）
  - 只渲染 state                    - 合法动作校验 / 下注轮转
  - 自己的底牌单播 direct            - 边池 / 摊牌 / 筹码结算
                                    - 15 秒超时自动过牌/弃牌
```

- 新增 `server/lib/game-engine.js`（服务端牌局引擎）与 `server/lib/poker.js`。
- 新增 `GET /api/rooms/:code/events` 的服务端 state 广播；`/state`、`/round`、`/direct` 对客户端一律返回 **403**，房主不再有牌局写权限。
- 在线对局统一使用现有的 2D `GuestTable`；**单机 3D 牌桌保留**（`Game` 只跑单机）。
- 每手扣 1 次“次数”，结算写回筹码与对局数；注册送 10 次、每日 +5 次。
- 匹配房固定为 **4 个 × 8 座 = 32 人**，按 1→2→3→4 顺序填满。

> 取舍说明：在线牌桌从 3D 变为 2D。这是为了保证公平性（房主不能看底牌/改结果）而做的产品取舍；单机 3D 不受影响。

---

## 二、修复清单与验证

### P0

| # | 问题 | 修复 | 验证 |
|---|---|---|---|
| P0-1 | `Host: a b` 一条请求打崩进程 | `server.js` 用 `try/catch` 解析 URL，并给整个请求处理加兜底；`clientError` 返回 400 | `run-security`：原始非法 Host 请求返回 200/400，进程存活；`run-api` 51 项全过 |
| P0-2 | 好友房 100% 失败（`userKey is not defined`）+ 幽灵房 | 补 `const userKey = normalizeUsername(...)`；`rooms.set` 移到校验/`addPlayer` 之后；失败不再留房 | `run-integration`：创建 201；失败创建不增加房间；`run-rooms` 全过 |
| P0-3 | 房主可控牌面 XSS 盗号 | 客户端 `cardTile` 只接受 2..14 + `s/h/d/c`，非法渲染 `?`；昵称/榜单统一 `escapeHtml`；服务端 `sanitizeName` 去标签；`/state` 禁止客户端写 | `run-browser`：注入 `<img onerror>` 后 `window.__xss=0`、DOM 为 `?`；全站无 JS 错误 |
| P0-4 | 房主可看底牌/改结果/改筹码 | 服务端 `GameEngine` 接管洗牌、发牌、下注、边池、摊牌、结算；客户端只有 action 意图；筹码由服务端写回 | `engine-test` 10/10；`run-integration` 15/15；`run-online-browser` 两浏览器打完整手并结算；`run-load` 100 局并发 |
| P0-5 | 全站明文 HTTP + 硬编码 IP | Web 客户端默认同源 API（`vite.config.js` 默认 `UPDATE_BASE=''`，客户端移除 `if (!base) throw`）；新增 `deploy/Caddyfile`、`deploy/nginx.conf.example`、`deploy/README.md`；Android 资源单独用 `UPDATE_BASE` 构建 | Web 构建产物无 `192.144.159.220`；两浏览器**同源**在线对局通过；生产仍为 HTTP，TLS 尚未配置 |

### P1

| # | 问题 | 修复 | 验证 |
|---|---|---|---|
| P1-1 | `scryptSync` 阻塞事件循环 | 改为 `crypto.scrypt` 异步 + 登录/注册/改密/建房/加入/操作限流；5 次失败锁 10 分钟；IP 信任仅限本机代理 | `run-security`：32 并发登录 280ms，健康 p95 **17ms**（修复前 746ms） |
| P1-2 | 1 个账号耗尽 896 房号 + 幽灵房 | 每账号最多 3 房；全局 600 房；空房 60 秒回收；房号耗尽返回 503；失败先校验后写入 | `run-security`：3 成功第 4 个 429；`run-api`：无幽灵房 |
| P1-3 | 32 人上限 / 离线占座 / 离线房主卡死 | 匹配房 4 个（32 座，顺序填满）；离线座位 90 秒释放；房主掉线立即移交；牌局由服务端驱动，不再依赖房主在线；已开局房间有 15 分钟无活动回收 | `run-match`：32 人填满、第 33 人 409、房主掉线移交；`engine-test` 超时/离开 |
| P1-4 | 经济系统不生效 | 注册 10 次、每日 +5 次；每手服务端扣 1 次；筹码由引擎结算写回；`/round` 客户端禁用 | `run-integration`：一手后筹码合计 200、双方次数 9、局数 1 |
| P1-5 | SSE 无上限/无背压/重连顶掉自己 | 每 Token 只保留 1 条（新连接关闭旧连接）；全服 2000、每房 64；写缓冲 >1MB 断开；心跳 15 秒；`/api/health` 暴露连接数 | `run-security`：重复连接旧流关闭、连接数=1；`run-load`：800 连接稳定 |
| P1-6 | 改密码不踢旧会话 | 改密后清空 `user.tokens` 与 `tokenIndex` | `run-integration`：旧 Token 401，新密码可登录 |
| P1-7 | 管理后台弱防护 | 登录限流（10 次/10 分钟）、常量时间比较、Token 支持 `Authorization`、后台页面改用 Header；12 小时 TTL | `run-api`：错误 401、未授权 401、Header 访问 200 |

### P2

| # | 问题 | 修复 |
|---|---|---|
| P2-1 | 缺安全头/CSP | 所有响应加 `X-Content-Type-Options`、`X-Frame-Options: DENY`、`Referrer-Policy`、`Permissions-Policy`；HTML 加 CSP（`frame-ancestors 'none'`、`connect-src 'self'`） |
| P2-2 | APK 清单 404 | 将 `DezhouNight-1.0.67.apk` 放入 `server/public/apk/`；启动时校验清单文件；`run-api` 下载 200、大小 309141 |
| P2-3 | 更新 URL 可被 Host 污染 | `PUBLIC_ORIGIN` 优先；仅在未配置时回退 Host；`run-integration` 伪造 Host 仍返回 `https://poker.example/...` |
| P2-4 | 昵称 HTML 注入 | 服务端去标签 + 客户端 `escapeHtml`；榜单昵称也掩码 |
| P2-5 | Token 放 URL / CORS `*` | Web/后台改 `Authorization: Bearer`；服务端保留 query 回退兼容旧 APK；CORS 仍为 `*`（APK file:// 需要），已记录 |
| P2-6 | 榜单泄漏昵称 | 昵称/用户名均掩码（如 `爱***丝`） |
| P2-7 | 机器人字段错位 | `bots.js` 全部改用 `toCall`；全下只跟强牌；翻后按底池赔率弃牌 |
| P2-8 | 5 秒不点继续就退桌 | 改为 20 秒，超时**自动继续**；页面文案同步 |
| P2-9 | 已开局无法重连 | `match/join` 先返回已有座位，再判断新玩家；实测重连 200 |
| P2-10 | 同账号多房并存 | `userRooms` 索引，加入新房前退出旧房 |
| P2-11 | 全量 JSON 持久化 | 保留 JSON，debounce 500ms、优雅退出 flush；**大规模仍建议 SQLite**（见“剩余风险”） |
| P2-12 | `tokenIndex` 泄漏 | `issueToken` 清理被截断的旧 Token 索引 |
| P2-13 | 边池超额弃牌丢筹码 | 引擎 `buildPots` 对无资格池退款；单机客户端遗留逻辑保留 |
| P2-14 | 榜单/后台 O(N²) | `onlineUserKeys()` 一次构建集合；榜单仍全量排序（当前数据量小，后续可改堆/索引） |
| P2-15 | 无限建房/操作洪泛 | 房间配额 3/账号；操作 180 次/分钟；建房/加入/匹配/登录均限流 |

---

## 三、修复前后关键指标

| 指标 | 修复前 | 修复后 |
|---|---|---|
| 非法 Host 请求 | 进程 `exit 1` | HTTP 200/400，服务存活 |
| 32 个并发错误登录 | 健康 p95 746ms / 最大 853ms | 健康 p95 **17ms** / 最大 17ms，登录总耗时 280ms |
| 好友房创建 | 400 `userKey is not defined` | 201，正常加入/开局 |
| 房号耗尽 | 896 个幽灵房，内存 +55MB | 每账号 3 房，失败零残留 |
| 房主 XSS | `window.__xss=1`，可读 Token | `window.__xss=0`，牌面渲染 `?` |
| 在线人数上限 | 32 人 | **32 人**（4 房 × 8 座，顺序填满） |
| 房主掉线 | 房间永久卡在“已开局” | 立即移交，服务端继续牌局 |
| 牌局权威 | 房主浏览器 | 服务端引擎 + 15 秒超时 |
| 改密旧会话 | 仍返回 200 | 401 |
| 登录爆破 | 30 次全部可尝试 | 5 次失败后 429 锁定 10 分钟 |
| SSE 同 Token 重复连接 | 旧 socket 泄漏、投递错乱 | 新连接关闭旧流，仅 1 条 |
| 清单 APK | 404 | 200，288,661 字节 |
| 单机 3D | 正常 | 正常（`qa/out/single-player.png`） |
| 在线对局 | 房主 3D / 客人 2D | 所有人 2D 服务端权威（`qa/out/online-table.png`） |

### 容量（本机 9950X / 单 Node 进程）

| 场景 | 结果 |
|---|---|
| `GET /api/health` | 6,873 req/s，p95 23ms |
| `GET /api/leaderboard`（900 用户） | 3,896 req/s，p95 16ms |
| `GET /api/match/rooms` | 9,009 req/s，p95 6ms |
| 100 房 × 8 人 = 800 SSE | 连接 768ms，RSS 135MB |
| 100 局同时开局 | 773ms |
| 500 次行动 → 5,600 帧广播 | 2,308 帧/秒，健康 p95 52ms |
| 整轮压测峰值 RSS | 203MB（关闭后 141MB） |
| 设计上限 | 32 人同时匹配；每房 8 人 |

> 800 客户端、100 局、2,300 帧/秒在单进程内保持 p95 < 70ms。按 2C2G 云主机 1/3 折算，约 250–400 个并发客户端较稳；若要继续扩容，需要多进程 + Redis/粘性会话（见剩余风险）。

---

## 四、回归结果

| 套件 | 结果 |
|---|---|
| `qa/engine-test.mjs` | 12/12 |
| `qa/run-logic.mjs` | 23/23（10 万手交叉验证 0 错误） |
| `qa/run-integration.mjs` | 16/16 |
| `qa/run-rooms.mjs` | 9/9 |
| `qa/run-match.mjs` | 8/8 |
| `qa/run-security.mjs` | 8/8 |
| `qa/run-api.mjs` | 51/51 |
| **合计** | **128/128** |
| `qa/run-browser.mjs` | 单机 3D 通过，XSS 载荷未执行 |
| `qa/run-online-browser.mjs` | 两浏览器同源在线对局，打到摊牌结算，无 JS 错误 |
| `qa/run-load.mjs` | 800 SSE / 100 局 / 2,308 帧/秒 |

原始数据：`qa/out/*.json`；截图：`qa/out/single-player.png`、`qa/out/online-table.png`、`qa/out/online-settle.png`。

---

## 五、剩余风险与后续项

1. **生产已部署 1.0.67**：2026-10-24 20:18（CST）已上传并重启，`/api/health`、`/api/app/latest`、`/play`、`/admin`、APK 下载均验证通过。部署前已备份到 `/opt/dezhounight/backups/pre-1.0.67-20261024-203509.tgz`（含旧 `server.js`、`lib`、`public`、`data`、`admin.env`、systemd unit）。**当前仍是 HTTP 8080，未配置 TLS/域名。**
2. **TLS 未实际签发**：已提供 Caddy/Nginx 配置，但需要域名与证书；Web 客户端已改为同源，部署到 HTTPS 后即可工作。
3. **APK 已重新打包**：`android/DezhouNight-1.0.67.apk`，versionCode 68，317,333 字节，SHA256 `E84956CB477D9A60E36B9DD3B3992A1E2164E02B0A54D62AE10EC037E1C694C6`，v2/v3 签名验证通过；使用 `http://192.144.159.220:8080`。旧 1.0.25/1.0.24/1.0.23/1.0.22/1.0.21/1.0.20/1.0.19/1.0.18/1.0.17/1.0.16/1.0.15/1.0.14 客户端需通过应用内更新或 `/download/DezhouNight-1.0.67.apk` 升级。
4. **在线牌桌为 2D**：为保证公平性移除房主 3D 牌局；如需 3D 在线，需要把服务端 state 接入 3D 场景（后续功能，不是安全修复）。
5. **持久化仍是全量 JSON**：`data/store.json` 每次变更全量重写。用户量到万级后建议换 SQLite/WAL；当前 debounce 500ms + 优雅退出 flush 已避免最坏情况。
6. **单进程**：未做 cluster/Redis；当前 32 人设计上限下单进程足够。
7. **规则简化**：短码全下不重开加注的细节、奇数筹码分配、无 time bank、在线暂无机器人；不影响资金安全，但属于后续体验完善。
8. **兼容性保留**：登录接口仍接受 query token（旧 APK），CORS 仍为 `*`（APK file://）；新客户端已改用 Header。
9. **生产 `PUBLIC_ORIGIN` 已固定为 `http://192.144.159.220:8080`**，避免下载地址随 Host 变化；配置 HTTPS/域名后应改为 `https://域名` 并重新构建 APK。

---

## 六、部署清单（摘要）

1. 备份 `/opt/dezhounight/data/store.json`。
2. 上传 `server/server.js`、`server/lib/*.js`、`server/public/web/index.html`、`server/public/admin/index.html`、`server/public/app/latest.json`、`server/public/apk/DezhouNight-1.0.67.apk`。
3. `admin.env` 已设置 `PUBLIC_ORIGIN=http://192.144.159.220:8080`；配 HTTPS 后改为 `https://域名`。
4. `systemctl daemon-reload && systemctl restart dezhounight`。
5. Caddy/Nginx 配 TLS，SSE 关闭 buffering。
6. 健康检查：`/api/health` 应返回 `rooms: 8`、`connections`、`games`。
7. 用两个账号跑一遍在线对局；确认 `/state`、`/round` 返回 403。

完整步骤：[deploy/README.md](deploy/README.md)　测试复跑：[qa/README.md](qa/README.md)
