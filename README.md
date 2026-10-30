# 德扑之夜 · 第一视角德州扑克

浏览器端的第一人称 3D 德州扑克游戏：单机 AI 牌局、在线匹配、好友房、实时语音、生涯与成就系统、后台管理，一套代码可构建为单文件 Web、Android APK 与 iOS WKWebView 壳。

> 娱乐 / 学习用途的虚拟筹码游戏，不涉及真实货币兑换。

## 功能

- **单机 3D 牌桌**：three.js 第一人称视角，AI 机器人、发牌/下注/摊牌动画、结算面板
- **在线匹配**：4 个匹配房（801–804），8 座，服务端权威牌局与断线重连
- **好友房**：自定义盲注与筹码、房间口令、观战、房主移交
- **实时同步**：SSE 事件流，行动/底牌/结算广播，输家观战脱敏
- **语音**：WebRTC + Opus 实时语音，TTS 报牌（中/英、多音色）
- **成长系统**：生涯等级、成就、场景、装扮、每日签到与筹码
- **管理后台**：`/admin` 用户管理、房间与在线统计、功能开关
- **多端**：PWA、Android APK（`/download` 更新）、iOS WKWebView 壳

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Vite 5 + 原生 ES Modules + three.js 0.169，`vite-plugin-singlefile` 打包为单个 HTML |
| 服务端 | Node.js 原生 `http`，无框架；JSON 文件存储；SSE；scrypt 口令散列 |
| 语音 | WebRTC、`opus-recorder`；TTS 素材由 `msedge-tts` 预生成 |
| Android | 纯命令行构建：`aapt2` / `javac` / `d8` / `zipalign` / `apksigner`（`scripts/build-apk.ps1`） |
| iOS | Swift + WKWebView，XcodeGen 生成工程，GitHub Actions 构建 |
| 测试 | 自研 `qa/*.mjs` 套件（128 项服务端检查 + 浏览器/截图脚本） |

## 目录结构

```text
.
├─ index.html                 # 前端入口（游戏 UI 与样式）
├─ src/                       # 前端源码（场景、HUD、牌局、在线、语音、生涯…）
├─ public/                    # 静态资源（3D 模型、语音素材）
├─ shared/                    # 前后端共享数据（成就定义）
├─ server/                    # Node 服务端
│  ├─ server.js               # HTTP + SSE + 房间/匹配/账号/后台
│  ├─ lib/                    # 牌局引擎、限流
│  ├─ shared/                 # 服务端成就数据
│  ├─ public/web/             # /play 单文件产物
│  ├─ public/admin/           # /admin 后台页面
│  └─ public/app/latest.json  # APK 版本清单
├─ android/                   # Android 壳工程（Manifest、Java、资源、版本号）
├─ ios/                       # iOS WKWebView 壳工程与 TestFlight 说明
├─ scripts/                   # APK 打包、图标、部署、远程执行脚本
├─ deploy/                    # Caddy / Nginx 反向代理与部署说明
├─ qa/                        # 自动化测试、压测与截图脚本
├─ docs/requirements/         # 各需求的需求 / 测试 / 验收文档
└─ .github/workflows/         # iOS 构建与 TestFlight 工作流
```

## 快速开始

环境：Node.js 22+（实测 v26.3.1）、npm 11。

```powershell
npm install
node server/server.js
# 浏览器打开 http://127.0.0.1:8080/play
```

服务端默认监听 `8080`，仓库内已包含构建好的 `server/public/web/index.html`，克隆后无需先构建即可试玩。

后台地址 `http://127.0.0.1:8080/admin`，需先设置管理员环境变量：

```powershell
$env:ADMIN_USER = 'admin'
$env:ADMIN_PASSWORD = '换成一个随机强密码'
node server/server.js
```

### 前端开发

```powershell
npm run dev        # Vite 开发服务器（默认 http://127.0.0.1:5173）
```

Vite 仅提供前端与静态资源；账号、房间、牌局等接口需同源服务端，联调请使用上面的 `server/server.js` 方式，或在构建后把 `dist/index.html` 覆盖到 `server/public/web/index.html`。

## 构建

### Web

```powershell
npm run build
Copy-Item dist/index.html server/public/web/index.html -Force
```

可用环境变量注入版本与线上地址：`APP_VERSION`、`APP_VERSION_CODE`、`UPDATE_BASE`。

### Android

依赖 JDK 17+、Android SDK（platform + build-tools）。脚本会自动递增 `android/version.json` 中的版本号、构建单文件页面、编译 Java、签名并校验 APK：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-apk.ps1
# 产物：android/DezhouNight-<version>.apk
```

首次运行时若缺少 `android/dezhounight.keystore`，脚本会自动生成签名密钥。**该密钥与构建口令不随仓库分发**，正式发布请使用自己的密钥并妥善备份。

### iOS

见 [ios/README.md](ios/README.md)：macOS 上用 XcodeGen 生成工程并构建未签名 IPA；TestFlight 上传流程见 [ios/TESTFLIGHT.md](ios/TESTFLIGHT.md) 与 `.github/workflows/ios-testflight.yml`。

## 测试

服务端与浏览器测试脚本见 [qa/README.md](qa/README.md)，在项目根目录直接运行，无需额外依赖：

```powershell
node qa/engine-test.mjs       # 牌局引擎
node qa/run-logic.mjs         # 牌型/洗牌/边池/机器人
node qa/run-integration.mjs   # 账号、SSE、服务端权威对局
node qa/run-rooms.mjs         # 房间、口令、观战、配额
node qa/run-match.mjs         # 匹配房
node qa/run-security.mjs      # 安全用例
node qa/run-api.mjs           # 账号/后台/更新接口
node qa/run-load.mjs          # 压测（仅本地）
```

测试产物写入 `qa/out/`（已 gitignore）。

## 部署

生产结构：`Caddy/Nginx (443) → Node 127.0.0.1:8080`，详见 [deploy/README.md](deploy/README.md)。

```powershell
$env:DEPLOY_PASS = '服务器密码'
python scripts/deploy_server.py
```

环境变量（`server/dezhounight.service` 的 `EnvironmentFile`）：

```ini
ADMIN_USER=admin
ADMIN_PASSWORD=随机强密码
PUBLIC_ORIGIN=https://你的域名
TRUST_PROXY=1
```

> 语音（麦克风）需要 HTTPS 安全上下文；生产务必配置域名与证书，不要长期使用明文 HTTP。

## 文档

- 各功能的需求、测试方案、测试报告与验收报告：`docs/requirements/<日期>-<短名>/`
- 版本发布记录：仓库根目录 `RELEASE-*.md`
- QA 汇总：`QA-测试报告.md`、`QA-修复报告.md`
- 界面与移动端改造说明：`界面改造说明.md`

## 关于本公开仓库

本仓库为**代码与文档快照**，不包含：

- `node_modules/`、`dist/`、`qa/out/` 等依赖与测试产物
- 历史 APK/IPA 安装包（`*.apk`、`*.idsig`、`*.ipa`）
- 签名密钥（`android/dezhounight.keystore`）、SSH 私钥、证书与 `.env` 配置
- 生产运行数据（`server/data/`）

发布记录中出现的演示服务器地址为历史信息，正式部署请替换为自己的域名并启用 HTTPS。

## 免责声明

本项目仅用于学习、研究与娱乐。游戏内筹码、积分、签到奖励均为虚拟道具，不可兑换现金或实物；请遵守所在地区法律法规，勿将本项目用于任何形式的赌博或非法支付业务。

## 许可证

暂未指定开源许可证（默认保留所有权利）。如需引用或二次分发，请先联系仓库作者。
