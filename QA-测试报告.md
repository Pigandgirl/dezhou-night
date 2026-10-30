# 德州之夜（Dezhou Night）全方面测试报告

> **状态更新（2026-10-23 晚）**：本文件是**修复前**的审计报告。报告中的 P0/P1 与可执行 P2 已完成修复，修复说明、回归数据与部署清单见 [QA-修复报告.md](QA-修复报告.md)。下方描述的部分行为（好友房 400、房主 3D 牌局、32 人上限等）已被服务端权威引擎与新配置取代。

- **测试对象**：`D:\software\project\dezhou`（Web 3D 德州扑克 + Node 房间/更新服务 + Android 壳）
- **测试日期**：2026-10-23
- **测试方式**：源码审计 + 自动化接口/安全/容量/逻辑/浏览器测试，全部在本地沙箱副本上执行；对生产环境只做了只读探测（`/api/health`、`/api/app/latest`、APK HEAD）
- **测试环境**：Windows 11，AMD Ryzen 9 9950X（16C/32T），61 GB RAM，Node v26.3.1，Edge 149 headless
- **生产现状**：`http://192.144.159.220:8080`，测试时 uptime ≈ 66 分钟，注册用户 1 人，4 个匹配房

---

## 一、结论摘要

**有漏洞，而且不是小问题。** 当前版本不适合直接对外运营。

| 级别 | 问题 | 一句话影响 |
|---|---|---|
| **P0** | Host 头解析未捕获异常 | 发送 1 个 `Host: a b` 的原始请求即可让 Node 进程退出；systemd 会反复拉起，形成无限重启 |
| **P0** | 好友房创建 100% 失败 | `POST /api/rooms` 必返回 400 `userKey is not defined`，且每次失败还泄漏一个幽灵房间 |
| **P0** | 房主可控牌面 XSS | 房主下发 `state`/`direct` 中的牌面 rank 会进 `innerHTML`，可在所有客人浏览器执行任意 JS，读取 `localStorage.pokerToken` 实现盗号（已实测 `window.__xss=1`） |
| **P0** | 游戏逻辑完全在房主浏览器 | 洗牌、发牌、下注、结算、筹码全由房主端计算，服务器只转发；房主可看底牌、改结果，客人无法验证 |
| **P0** | 全站明文 HTTP | 密码、Token、管理员令牌、APK 全部明文传输；客户端还硬编码 `http://192.144.159.220:8080` |
| **P1** | `scryptSync` 阻塞事件循环 | 32 个并发错误登录可让全服健康接口 p95 达到 746 ms、最大 853 ms；约 33 次登录/秒吃满单核 |
| **P1** | 房间码可被 1 个免费账号耗尽 | 896 个房间码全被占满后返回“no room code available”，好友房功能瘫痪，内存 +55 MB |
| **P1** | 匹配上限 32 人 + 离线占座 | 4 房 × 8 人，第 33 人 409；32 个账号不连 SSE 即可冻结匹配 ≥3 分钟 |
| **P1** | 房主掉线后倒计时照开 | 开局后房主离线，房间永久卡在“已开局”，客人无法接管，只能管理员重置 |
| **P1** | 经济系统是死的 | `plays`/`points` 只增不减；`beginRound()` 不传 `stacks`，筹码永不结算 |
| **P1** | SSE 无背压/无连接上限 | 同一 Token 可开 200+ 条流；慢客户端导致写缓冲无上限增长（实测排队 84 MB，RSS +16 MB） |
| **P2** | 改密码不踢旧会话、管理后台无防爆破、缺安全头、榜单泄漏昵称、机器人 AI 严重缺陷等 | 见第四节 |

**服务器最多能承受多少人？**

- **规则上限：32 人同时在线匹配**（4 个匹配房 × 8 座），第 33 人直接 409“4 个匹配房间都已满”。
- 好友房理论 8 人/房 × 896 个房号 = 7,168 座，但**好友房创建功能当前是坏的**，实际为 0。
- **技术上**（单进程、单核）：本机实测 2,000 条 SSE 连接（约 4.8 秒建完，RSS 160 MB）、100 房 × 8 人 = 800 个在线客户端、广播 3,524 帧/秒且 100% 送达、健康接口 p95 44 ms；换成常见 2C2G 云主机大约还能保留 1/4～1/3，即 **500～1,000 个并发 SSE 连接**。
- 因此**当前瓶颈不是硬件，而是 4×8 的房间设计**；只要不扩房/不做多进程，硬件再强也只能 32 人同时玩。

---

## 二、系统架构（测试视角）

```
浏览器/安卓 WebView
  ├─ 单文件构建 index.html（three.js 3D 牌桌 + HUD）
  ├─ AccountService：注册/登录，localStorage 存 pokerToken
  └─ OnlineService：SSE /api/rooms/:code/events
        │
        ▼
Node 单进程 server.js（无依赖，端口 8080，明文 HTTP）
  ├─ /api/auth/*        账号（scrypt 同步哈希）
  ├─ /api/rooms/*       房间 + SSE + 转发 state/action/direct
  ├─ /api/match/*       4 个匹配房（801-804）
  ├─ /api/admin/*       后台（Token 放 query/body）
  ├─ /download/*        APK
  └─ data/store.json    全量 JSON 持久化（每次变更全量重写）

关键事实：服务器不洗牌、不发牌、不校验下注、不结算。
牌局由“房主”浏览器运行，服务器只把房主的 state 广播给其他人。
```

---

## 三、测试方法与结果总览

| 套件 | 文件 | 检查数 | 结果 | 说明 |
|---|---|---|---|---|
| 接口功能 + 安全 | `qa/run-api.mjs` | 49 | 46 通过 / 3 失败 | 失败项均为真实缺陷（安全头、改密不踢会话、APK 404） |
| 好友房 + SSE 深测 | `qa/run-rooms.mjs` | 20 | 20 通过 | **在打了 `userKey` 一行补丁的副本上运行**，否则好友房无法创建；通过项中包含多个“记录缺陷”用例 |
| 匹配/倒计时/容量 | `qa/run-match.mjs` | 21 | 21 通过 | 含 2 次真实 60 秒倒计时 |
| 牌型/边池/机器人 | `qa/run-logic.mjs` | 22 | 22 通过 | 10 万手交叉验证、20 万手分布、5,000 组边池模糊测试 |
| 可用性/DoS | `qa/run-dos.mjs` | 35 项观测 | — | 崩溃、阻塞、房间耗尽、连接滥用、慢客户端、操作洪泛 |
| 容量/吞吐 | `qa/run-load.mjs` | 8 组基准 | — | HTTP、SSE 阶梯、100 房广播 |
| 真实浏览器 | `qa/run-browser.mjs` | 1 轮 | — | Edge headless 启动真实客户端、单机 8 人桌、XSS 验证 |

> 所有服务都从 `server/` 复制到 `%TEMP%\dezhou-qa\...` 后启动，使用随机端口和独立 `data/store.json`，不会污染项目数据，也没有对生产做写操作。生产是否受下述问题影响取决于部署版本；`scripts/deploy_server.py` 会原样上传 `server/server.js` 和 `server/public/web/index.html`，若生产已按当前仓库部署，则同样受影响。

---

## 四、漏洞与缺陷清单

### P0-1　一个 Host 头即可远程打崩服务

- **位置**：`server/server.js:1622`
  ```js
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  ```
- **原因**：`Host: a b` 会让 `new URL()` 抛 `ERR_INVALID_URL`；该回调没有 try/catch，未捕获异常直接终止进程。
- **实测**：
  ```
  GET /api/health HTTP/1.1
  Host: a b
  Connection: close
  ```
  → 进程 `exit code 1`，随后健康检查 `fetch failed`。
- **影响**：无需登录、无需任何账号，一条 TCP 请求即可杀死服务；`Restart=always` + `RestartSec=3` 会让攻击者用极低流量维持“启动 3 秒→再崩”的循环，所有对局、SSE 全部中断。
- **修复**：
  ```js
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    res.writeHead(400); res.end('bad request'); return;
  }
  ```
  Host 头只用于生成外部 URL 时应单独校验白名单，不要参与 URL 解析。

### P0-2　好友房（自定义房间）创建 100% 失败

- **位置**：`server/server.js:1336`
  ```js
  const player = addPlayer(room, { name: body.name || user.name, userKey, spectator: false });
  ```
  `userKey` 在该作用域从未定义（匹配/加入分支里才有定义）。
- **实测**：`POST /api/rooms` 返回 **400**，body `{"error":"userKey is not defined"}`。
- **附带伤害**：`rooms.set(code, room)` 在报错之前执行，因此**每次失败都会留下一个 0 人的幽灵房间**；`/api/rooms` 会把它列出来，并占用一个房号（见 P1-2）。
- **影响**：大厅“创建房间/好友房”功能完全不可用；这是核心玩法入口。
- **修复**：
  ```js
  const userKey = normalizeUsername(user.username);
  const player = addPlayer(room, { name: body.name || user.name, userKey, spectator: false });
  ```
  并把 `rooms.set` 移到参数校验与 `addPlayer` 成功之后。

### P0-3　房主可控牌面 XSS → 盗取客人账号

- **位置**：
  - `src/online.js:17` `cardTile()` 用模板字符串拼 `<b>${rankLabel(card.rank)}</b>`
  - `src/online.js:395` `this.el.board.innerHTML = board.map(cardTile).join('')`
  - `src/online.js:400`、`:451` 底牌同样走 `innerHTML`
- **原因**：`rankLabel(rank)` 对未知值返回 `String(rank)`；服务器对 `state`/`direct` 只做 JSON 转发，既不校验 rank/suit，也不限长度（body 上限 64 KB）。
- **实测**（真实 Edge 客户端）：
  ```js
  guestTable.applyState({
    board: [{ rank: '<img src=x onerror=window.__xss=1>', suit: 's' }],
    seats: [], ...
  });
  ```
  → `window.__xss === 1`，DOM 中出现注入的 `<img>`。
- **影响**：房主可对房间内所有客人执行任意 JS；`localStorage.getItem('pokerToken')` 直接可读，配合明文 HTTP 可批量盗号。也可伪造页面、发起 API 操作。
- **修复**：
  1. 服务端白名单校验：`rank ∈ [2..14]`、`suit ∈ ['s','h','d','c']`，非法直接 400/丢弃；
  2. 客户端所有牌面用 `textContent` 或 `escapeHtml()`，禁止 `innerHTML` 拼接外部数据；
  3. 加 CSP（见 P2-1）。

### P0-4　服务器不掌控牌局：房主可作弊、可改结果

- **证据**：
  - `src/game.js:293` `const deck = shuffle(makeDeck())` 在房主浏览器执行；
  - 房主端持有全部 `hp[].hole`，`publish()` 只决定“对外显示多少”；
  - 服务器 `/state`、`/direct`、`/round` 只校验“你是不是房主”，不校验内容；
  - `/round` 接受房主上报的 `stacks`，可把任意玩家筹码改成 0–800；
  - 任何玩家可随时 POST `action`（包括未轮到自己、金额 1,000,000），服务器照样广播。
- **影响**：这是扑克产品的根本性公平问题。房主可以看所有人底牌、决定发牌、伪造胜负、改筹码；客人没有任何密码学或服务端校验手段。
- **修复方向**（工作量大但必须做）：把洗牌/发牌/下注轮转/边池/结算迁到服务端；只向每个玩家单播自己的底牌；动作按 `legal` 状态机校验；客户端只做展示。

### P0-5　全站明文 HTTP + 硬编码 IP

- **证据**：
  - `dezhounight.service` 只启动 `node server.js`，没有 nginx/TLS；
  - `vite.config.js:10` 默认 `UPDATE_BASE='http://192.144.159.220:8080'`，构建产物内硬编码该地址；
  - 登录密码、`pokerToken`、后台 Token 均走明文 HTTP；Token 还会出现在 URL query（`/api/auth/me?token=`），容易进日志/Referer。
- **影响**：同一 Wi-Fi/运营商链路即可抓密码和 Token；APK 更新可被中间人替换；未来若把页面挂到 HTTPS，所有 API 会因混合内容被浏览器拦截。
- **修复**：Caddy/Nginx 上 TLS（Let's Encrypt），全站 HTTPS/WSS；客户端改为同源 `/api`，删除硬编码 IP；Token 放 `Authorization` 头。

---

### P1-1　`scryptSync` 阻塞事件循环 + 登录无限流

- **位置**：`server/server.js:120`、`:128`（登录、注册、改密都会调用）
- **实测**：32 个并发错误密码登录，总耗时 959 ms；期间 `/api/health` p95 **746 ms**、最大 **853 ms**；20 个注册 657 ms。约 **33 次登录/秒**吃满一个核。
- **影响**：攻击者用几十个并发请求即可让全部牌桌卡顿；无需账号（注册接口同样触发哈希）。没有 IP/账号维度的失败计数或锁定。
- **修复**：改用异步 `crypto.scrypt`（或 worker 线程），加令牌桶限流（IP+用户名），失败 5 次后指数退避；注册加验证码/邀请码。

### P1-2　1 个免费账号可耗尽全部房号并留下 896 个幽灵房

- **实测**：循环 `POST /api/rooms` 920 次（每次都因 P0-2 失败），耗时 13.7 s：
  - `/api/rooms` 返回 **896** 个房间，全部 `players=0`；
  - 最后一次错误变为 **`no room code available`**；
  - 进程 RSS 72.8 MB → **128.2 MB**。
- **原因**：房号空间只有 100–999 去掉 801–804，共 896 个；`roomCode()` 只重试 200 次；失败路径仍 `rooms.set`；空房要 30 分钟才清理（`clients.size===0 && createdAt>30min`）。
- **影响**：好友房功能在 30 分钟内彻底不可用，且大厅接口返回巨大 JSON，放大带宽/内存。
- **修复**：先校验后建对象；空房 30–60 秒内回收；每账号最多 3 个房；房号扩到 6 位字母数字；耗尽时返回 503 并告警。

### P1-3　匹配硬上限 32 人 + 离线占座 + 离线房主卡死

- **32 人上限**：4 个匹配房 × 8 座，实测第 33 人返回 409“4 个匹配房间都已满”。
- **离线占座**：玩家只要 `POST /api/match/quick` 不连 SSE，就会占座 3 分钟（清理条件 `!online && now-joinedAt>3min`，每 30 秒扫一次）。32 个账号即可把 4 个房全部占满 3 分钟，期间谁也无法匹配；若保持在线则可无限期占座。
- **离线房主卡死**（60 秒倒计时实测）：
  1. A、B 进入房间并连 SSE，A 为房主；
  2. A 断开（仍在 `players` 里，`online=false`）；
  3. C 加入，B/C 在线 → 倒计时继续；
  4. 60 秒后 `startRoomGame` 直接把 `room.started=true`，但 `hostToken` 仍是离线的 A；
  5. 没有在线房主运行牌局，B/C 永远停在客人桌面；`started` 房间不可加入，也不会自动重置（只有空房或管理员才能重置）。
- **附带**：`/api/rooms/:code/join` 对匹配房跳过口令检查；匹配房**满员但未开局**时会被判为 `spectator=true`，可绕过 `match/join` 的 409 观战（已开局仍 409）。
- **修复**：
  - 倒计时开始时和开局前都只考虑在线玩家，房主掉线立即转移给在线玩家；无在线房主则取消开局；
  - 已开局房间增加“无状态心跳/无房主”超时（如 90 秒）；
  - 离线座位 30 秒内释放，且不计入满员；
  - 观战单独设上限，匹配房走专用只读通道。

### P1-4　经济系统实际不生效

- **`plays` 永不扣减**：全文件只有 `+plays`（充值/兑换）和管理员设置，没有任何 `plays--`。`start` 只检查“≥1”，所以 1 次次数可以开无限局；0 次账号仍可进匹配。
- **`points` 只增不减**：每日 +100、兑换 +N，从不下注扣分；100 分门槛只卡第一次。
- **筹码永不结算**：`src/online.js:194 beginRound()` 只发 `{ token }`，而服务器 `round` 只在 `body.stacks` 存在时才写 `chips`（`server.js:1544-1554`）。实测不带 stacks 调用 `round`，筹码保持 100 不变。
- **影响**：充值/兑换/积分/筹码的整套激励与消耗闭环是假的；对账也无法做。
- **修复**：由服务端在每手开始/结束时扣次数、结算筹码；客户端只上报“已看完动画”，不参与数值；给 `round` 加 `started` 状态校验。

### P1-5　SSE 无连接上限、无背压、重连会“顶掉”自己

- **同一 Token 无限开流**：实测 200 条同 Token SSE 全部保持打开，RSS 74.9 → 91.5 MB（≈83 KB/连接）。服务器 `room.clients.set(token, {res})` 只保留最后一条，旧 socket 仍被心跳定时器持有。
- **重连断流**：同 Token 第二条连接覆盖 map；关闭第二条时 `req.on('close')` 把 map 里的条目删掉，而第一条仍开着却再也收不到广播。
- **慢客户端**：`broadcast()` 直接 `res.write(frame)`，不检查返回值、不处理 `drain`。7 个暂停读取的客户端 + 200 次 60 KB state（每客户端 12 MB）→ 服务器 RSS 93 MB → 109 MB，写缓冲无上限。
- **修复**：每 Token 只允许 1 条流（新连接先 `end()` 旧的）；限制每 IP/账号连接数；检查 `res.write()` 返回值并设缓冲上限，超限断开；SSE 加客户端超时/心跳应答。

### P1-6　改密码不注销旧会话

- **实测**：`POST /api/auth/password` 成功后，旧 `pokerToken` 仍能 `GET /api/auth/me` 返回 200。
- **影响**：密码泄露后用户改密也无法把攻击者踢下线。
- **修复**：改密时清空 `user.tokens` 与 `tokenIndex` 中该用户的所有条目（管理员重置已有类似逻辑，可复用）。

### P1-7　管理后台防护薄弱

- **位置**：`server/server.js:1033-1049`
- **问题**：登录无失败计数/锁定；密码用 `!==` 明文比较（非常量时间）；Token 可放 URL query；有效期 12 小时；`/admin` 页面公网可达；CORS 为 `*`。
- **影响**：弱口令可被离线/在线爆破；Token 易从日志/代理泄露。
- **修复**：限流 + 常量时间比较 + HttpOnly Cookie/Session + 短 TTL + IP 白名单/2FA；CORS 收紧到自有域名。

---

### P2 级问题（建议排期修复）

| # | 问题 | 证据/位置 | 建议 |
|---|---|---|---|
| P2-1 | 缺安全响应头 | `/api/health` 无 CSP、X-Content-Type-Options、X-Frame-Options；页面无 CSP | 加 CSP、XCTO、XFO、Referrer-Policy |
| P2-2 | 清单指向的 APK 在仓库中不存在 | `latest.json` 指向 `DezhouNight-1.0.14.apk`，`server/public/apk` 只有 1.0.4/1.0.5 → 本地 `/download/DezhouNight-1.0.14.apk` **404**（生产已上传，200） | 部署脚本按版本复制 APK；启动时校验 manifest 文件存在 |
| P2-3 | 更新 URL 可被 Host 头污染 | `/api/app/latest` 用 `req.headers.host` 拼 URL；实测 `Host: evil.example` → `http://evil.example/download/...` | 用配置的固定公网地址 |
| P2-4 | 昵称 HTML 注入 | `src/account.js:359`、`:442-455` 用 `innerHTML` 拼 `account.name`；服务器只 `trim+slice(0,12)` | 统一 `textContent`/转义；昵称白名单 |
| P2-5 | Token 放 URL + CORS `*` | `/api/auth/me?token=`、所有响应 `Access-Control-Allow-Origin: *` | 改 Authorization；CORS 白名单 |
| P2-6 | 榜单泄漏昵称 | 用户名做了 `q***e` 掩码，但昵称原样返回 | 昵称也做掩码或提供匿名开关 |
| P2-7 | 机器人 AI 参数名不匹配 | `game.js` 传 `toCall`，`bots.js` 读 `callAmount`（undefined） | 统一字段；见下方实测 |
| P2-8 | 每手结束 5 秒不点“继续”就回大厅 | `game.js:664 waitReady(5)`；在线时房主超时会让全桌结束；截图 `qa/out/ready-prompt.png` | 默认继续/延长到 30 秒；在线局不要因房主手速终止 |
| P2-9 | 已开局房间无法重连 | `match/join` 先判 `started` 再查 `existing`，本人也 409 | 先返回已有座位，再判新加入 |
| P2-10 | 同账号可同时在多个房 | 已开局房里的人再 quick match 会进另一个房（实测 801/804 双份） | 全局 `userKey→room` 唯一索引 |
| P2-11 | 全量 JSON 持久化 | `saveStore()` 每次把全部用户/历史写一遍；1 万用户后每手都是 MB 级写盘 | SQLite/WAL 或分片 |
| P2-12 | `tokenIndex` 缓慢泄漏 | `issueToken` 把 `user.tokens` 截到 5 条，但 `tokenIndex` 旧条目从不删除 | 清理旧 token 索引 |
| P2-13 | 边池对“超额弃牌”会丢筹码 | 折叠玩家投入 500、另一人 100 → 400 筹码无 eligible；正常流程基本不可达 | 把未被跟注部分退回 |
| P2-14 | 榜单/排名 O(N log N) + 管理概览 O(用户×房×人) | `/api/leaderboard` 每次全量排序；`userSummary.online` 每用户扫全部房间 | 缓存/索引 |
| P2-15 | 无房间/登录级限流 | 单账号实测可建 60+ 房、2,344 次 action/秒 | 令牌桶 + 每账号配额 |

---

## 五、服务器容量测试（重点）

### 5.1 规则上限

| 项目 | 数值 |
|---|---|
| 匹配房 | 4 个（801–804） |
| 每房座位 | 8 |
| **同时可玩人数** | **32**（第 33 人 409） |
| 好友房 | 8 人/房；房号空间 896 → 理论 7,168 座（当前创建功能损坏，实际 0） |
| 观战 | 私有房满员/开局后可无限加入；匹配房可通过 `/api/rooms/:code/join` 绕过限制观战 |

### 5.2 本机实测（单 Node 进程、单核）

| 场景 | 结果 |
|---|---|
| `GET /api/health` | 2,000 请求 / 311 ms → **6,431 req/s**，p95 26 ms |
| `GET /api/leaderboard`（1,300 用户） | 300 请求 / 95 ms → **3,158 req/s**，p95 17 ms |
| `GET /api/match/rooms` | 1,000 请求 / 121 ms → **8,264 req/s** |
| SSE 连接阶梯（同 Token） | 200 → 500 → 1,000 → **2,000** 条，全部成功；累计约 4.8 s（最后 1,000 条 1.55 s），RSS **159.7 MB**，健康 p95 17 ms |
| 100 房 × 8 人 = 800 SSE | 连接 721 ms；RSS **251.6 MB**（基线 74.7 MB） |
| 广播 | 100 房 × 10 条 = 1,000 次 state；**8,000/8,000 帧送达（100%）**；3,524 帧/s；健康 p95 **44 ms** |
| 关闭后 | RSS 167 MB（GC 未完全回收，非必然泄漏） |
| 登录 | 33 次/秒；32 并发时健康 p95 **746 ms**、最大 **853 ms** |
| 房间耗尽 | 896 房 / 13.7 s，RSS 72.8 → **128.2 MB** |

### 5.3 结论与估算

1. **产品上限 = 32 人**，与机器无关；要提升必须增加匹配房数量/座位或做多房间分片。
2. **单进程技术容量**（本机 9950X）：约 2,000 SSE 连接、800 个活跃客户端、3,500 帧/秒广播仍保持 p95 < 50 ms。按常见 2C2G 云主机单核性能约为本机 1/3～1/4 折算：**500～1,000 个并发 SSE 连接、约 1,000～1,500 帧/秒**。
3. **真正的瓶颈**：
   - 单线程 + `scryptSync`：登录风暴会直接冻结所有牌桌；
   - 每房间广播 O(客户端数)，无背压；
   - 房号仅 896 个，且空房 30 分钟才回收；
   - 全量 `store.json` 重写；
   - 32 人设计上限。
4. **扩容建议**：
   - 短期：多开 Node 进程（`cluster`/PM2）+ 端口复用，房间按 `code` 哈希到固定 worker；SSE 需要 sticky；或用 Redis Pub/Sub 做跨进程广播。
   - 中期：把牌局逻辑服务端化（同时解决 P0-4），每桌一个房间 actor；状态存 Redis；
   - 长期：匹配房从 4 个扩到 N 个，支持 6/9 人桌；观战单独限流；接入 CDN 分发 `/play` 和 APK。
5. **压测注意**：以上为本机回环数据，未计公网带宽。一个 state 若 2 KB、800 客户端 × 4 次/秒 ≈ **6.4 MB/s 出站**，云主机带宽（通常 5–10 Mbps）会先于 CPU 成为瓶颈。按 5 Mbps 估算，800 个客户端每人每秒 4 条 2 KB 消息需要约 51 Mbps，远超常见配置；实际运营需按带宽反推房间/人数。

---

## 六、玩法与客户端测试

### 6.1 牌型评估（强验证）

- 与独立实现的 5 张牌评估器交叉比对 **100,000 手随机 7 张牌**：**0 处不一致**（分数与类别均一致）。
- 200,000 手 7 张牌类别分布与标准概率对比（高牌/一对/两对/三条/顺子/同花/葫芦/四条/同花顺）：
  `17.42 / 43.96 / 23.50 / 4.77 / 4.57 / 3.04 / 2.54 / 0.16 / 0.03`，最大偏差 < 0.6 个百分点。
- 皇家同花顺、A2345 轮子顺、同花压顺子、两对踢脚、公共牌平分等已知用例全部正确。
- `shuffle` 20,000 次：52 张无重复，首牌分布卡方 60.7（df=51），正常。
- 结论：**牌型/比较/洗牌算法本身是可靠的**。

### 6.2 边池

- 3 人全下（100/300/300）→ 主池 300、边池 400，资格正确。
- 5,000 组随机 `committed`/`folded` 模糊测试：金额守恒、资格集合、池数量全部满足不变量。
- 唯一问题：超额投入后弃牌会导致未被跟注部分无资格（正常流程基本不可达），见 P2-13。

### 6.3 机器人（可被玩家稳定利用）

- **字段不匹配**：`game.js` 传入 `{ toCall }`，`bots.js` 读 `legal.callAmount` → `undefined`。
- 实测后果：
  - 翻牌后 **200/200 次都不弃牌**：2-3 杂色面对 1000 筹码全下仍然跟注；
  - 翻前 AJs 面对 100bb 全下 **100/100 次跟注**（`allInCall` 永远为 false）；
  - 翻前中等牌大量弃牌、翻后从不诈唬加注。
- 影响：熟悉规则的玩家可以“无脑大注”稳定收割机器人；单机体验和在线（机器人补位）都受影响。
- 修复：统一 `callAmount`/`toCall`；补翻后弃牌阈值与全下判断；用单元测试覆盖。

### 6.4 真实浏览器

- Edge 149 headless，`/play` 正常启动：版本 1.0.14、3 张模式卡、WebGL 可用、canvas 1416×808。
- 点击“开始”后 8 人桌，筹码 100，无 JS 异常（仅有 headless 的 `navigator.vibrate` 策略提示）。
- 连续行动 3 次（跟注/过牌），牌局正常推进到河牌，HUD、底池、公共牌、行动条均正确渲染（`qa/out/single-player.png`）。
- 但每手结束会出现“准备继续”，**倒计时只有 5 秒**；不点“继续游戏”就离开牌桌（`qa/out/ready-prompt.png`），见 P2-8。
- 未发现客户端崩溃；但 XSS（P0-3）已在同一环境复现。

---

## 七、修复优先级建议

**今天（P0，阻断上线）**
1. 修 `new URL` 崩溃（1 行 try/catch）。
2. 修 `userKey` 未定义（1 行），并把 `rooms.set` 后移。
3. 牌面 rank/suit 服务端白名单 + 客户端 `textContent`（XSS）。
4. 上 HTTPS，客户端改同源 API，删硬编码 IP。
5. 明确产品决策：牌局必须服务端化；在完成前不要在公网开放真钱/积分对局。

**本周（P1）**
6. `scrypt` 异步 + 登录/注册限流。
7. 空房回收、每账号房间配额、房号扩容、耗尽保护。
8. 匹配房：在线房主校验、掉线转移、已开局超时、离线座位快速释放、观战上限。
9. 经济闭环：服务端扣次数/结算筹码，`round` 校验 `started`。
10. SSE：单 Token 单连接、连接上限、背压/慢客户端剔除。
11. 改密踢会话；管理后台限流 + 常量时间比较。

**后续（P2）**
12. 安全头/CSP、昵称转义、榜单匿名、Token 改头传输。
13. APK 发布流水线校验；manifest 固定域名。
14. 机器人修复；5 秒“继续”改为默认继续；重连恢复座位。
15. 存储换 SQLite/WAL；tokenIndex 清理；榜单/后台查询优化。

---

## 八、测试资产与复跑方法

```
qa/
  lib/env.mjs        沙箱、起服、RSS 采样
  lib/client.mjs     HTTP / SSE / 原始 socket 客户端
  run-api.mjs        接口 + 安全（49 项）
  run-rooms.mjs      好友房 + SSE（20 项，副本打 userKey 补丁）
  run-match.mjs      匹配 + 倒计时（21 项，约 2.5 分钟）
  run-logic.mjs      牌型/边池/机器人（22 项）
  run-dos.mjs        崩溃/阻塞/耗尽/慢客户端（35 项观测）
  run-load.mjs       吞吐/容量（8 组基准）
  run-browser.mjs    Edge headless 真机冒烟 + XSS
  out/               原始 JSON 结果与截图
```

复跑（PowerShell，项目根目录）：

```powershell
node qa/run-api.mjs
node qa/run-rooms.mjs
node qa/run-match.mjs      # 含 2 次 60 秒倒计时
node qa/run-logic.mjs
node qa/run-dos.mjs
node qa/run-load.mjs
node qa/run-browser.mjs
```

> `run-rooms.mjs` 与 `run-load.mjs` 会对副本打一行补丁（`const userKey = normalizeUsername(user.username);`），仅用于测通好友房后面的逻辑；仓库源码未改动。

### 未覆盖范围（本次未测）

- **Android 真机/WebView**：只验证了同一份 Web 构建在桌面 Edge 中的表现；APK 的 WebView WebGL、返回键、`NativeBridge`、后台切换未实测。
- **微信登录/支付**：`docs/wechat-login-and-payment-integration.html` 仅为方案文档，代码中未实现；`/api/recharge` 是 mock 且默认关闭，未做真实支付对账测试。
- **公网带宽/弱网**：容量数据为回环网络；未测 3G/高丢包、未测 CDN、未做 30 分钟以上浸泡测试。
- **多进程/集群**：当前是单进程，未测 PM2/cluster、Redis 广播或 sticky session。
- **管理后台 UI 全流程**：仅测 API；页面交互（分页、复制兑换码、弹窗）未做浏览器自动化。

---

## 九、总评

- **算法层**（牌型、比较、洗牌、边池）：质量不错，10 万手交叉验证零错误。
- **服务层**：功能骨架完整，但存在 1 请求打崩、好友房全坏、经济系统空转、SSE 无防护等硬伤。
- **安全层**：明文 HTTP + 房主 XSS + 房主作弊，三者叠加意味着当前版本不能视为“可运营”的在线扑克。
- **容量层**：32 人设计上限远低于硬件能力；真正的扩容瓶颈是单线程、同步哈希、无背压和房间码空间。
- **建议**：先修 P0（半天内可完成崩溃/好友房/XSS 三项），同时把 HTTPS 和服务端牌局列入上线门槛；P1 用一周补齐后再做小规模公测。

---

*本报告所有结论均来自 `qa/` 下可复跑的脚本；原始数据见 `qa/out/*.json`。*
