# 德扑之夜 1.0.34 发布记录

- **发布日期**：2026-10-24 13:21（CST）
- **版本**：1.0.34（versionCode 35）
- **生产地址**：http://192.144.159.220:8080
- **状态**：已部署并验证

## 新增：在线对局实时语音

- 3D 在线牌桌右上角新增 **麦克风按钮**；
- 点击按钮请求麦克风权限，并加入本局语音；
- 按钮变绿显示「语音中 / 语音 N」，再点一次关闭麦克风；
- 快速匹配、好友房都可用；
- 单机模式不显示麦克风按钮；
- 语音使用 **WebRTC 点对点**，服务端只转发 join / offer / answer / ice / leave 信令，不录制、不转存音频。

## 服务端

- 房间增加 `voice` 在线语音集合；
- `POST /api/rooms/:code/voice` 处理 join / leave / offer / answer / ice；
- join 返回房间内已有语音玩家列表；离开/SSE 断开自动广播 leave；
- SSE 增加 `voice` 事件；
- `Permissions-Policy` 从 `microphone=()` 改为 `microphone=(self)`，否则浏览器会直接拒绝麦克风。

## 客户端

- 新增 `VoiceChat`：
  - `getUserMedia({ audio: ... })` 请求权限；
  - WebRTC mesh，多人在线时每个人与其他语音玩家建立点对点音频；
  - 低 pid 一方发起 offer，避免同时发起造成 glare；
  - STUN（Google）辅助穿透；
  - 关闭按钮时停止所有本地音轨并关闭所有 peer connection；
  - SSE 重连后自动重新 join 语音。
- 麦克风按钮只在在线 3D 对局显示；
- 权限被拒绝、无麦克风、非 HTTPS 环境都有明确提示。

## Android

- Manifest 增加 `RECORD_AUDIO`、`MODIFY_AUDIO_SETTINGS`；
- `WebChromeClient.onPermissionRequest` 支持麦克风；
- 首次点击时请求 Android 运行时权限；
- 授权后 WebView 才允许 `getUserMedia`。

## 测试

- 两账号进入同一在线牌局；
- 两端点击麦克风，`voice.enabled = true`；
- peer 状态 `connected`；
- 双方 `audio.srcObject` 已绑定远端音频流；
- 按钮显示「语音 1」；
- 服务端 `voice join / offer / answer / ice / leave` 信令验证通过；
- 关闭按钮后本地音轨停止、peer 关闭、按钮恢复「语音」；
- 无 JS 错误。

![在线对局语音按钮](qa/out/voice-active-a.png)

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.34.apk` |
| 大小 | 309,141 字节 |
| SHA256 | `D06BC80DA82831255AD6B808D07BA71B333D00075C5DEAD2C1E2BBBFAF3A761D` |
| 签名 | v2 + v3 通过 |
| 包名 | `com.dezhounight.poker` |

## 线上验证

| 检查 | 结果 |
|---|---|
| `/api/health` | ok，features 三项 |
| `/api/app/latest` | `1.0.34` / code 35 / SHA 一致 |
| `/play` | 200，含 1.0.34 / btnVoice |
| `Permissions-Policy` | `camera=(), microphone=(self), geolocation=()` |
| APK 下载 | 309,141 字节，SHA 匹配 |
| systemd | active，13:21 重启 |

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.34-20261024-132103.tgz
sha256 716b16fefb569ae76f80622f7525449803045e0fb62d26b46124b6849b33717d
```

## 注意：麦克风需要安全上下文

- **APK** 使用 `file:///android_asset/index.html`，属于安全上下文，并已加 Android 麦克风权限；
- **网页端** 当前是 `http://192.144.159.220:8080`，Chrome 不允许 HTTP 页面调用麦克风；
  - 网页端要使用语音，需要 HTTPS 域名/证书；
  - 否则请使用 1.0.34 APK。
- WebRTC 使用公共 STUN；双方在对称 NAT 等极端网络下可能需要 TURN 服务器。
