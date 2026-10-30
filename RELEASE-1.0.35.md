# 德扑之夜 1.0.35 发布记录

- **发布日期**：2026-10-24 13:22（CST）
- **版本**：1.0.35（versionCode 36）
- **生产地址**：http://192.144.159.220:8080
- **状态**：已部署并验证

## 新增：对局内实时语音

- 3D 在线牌桌右上角新增 **麦克风按钮**；
- 点击后请求麦克风权限并加入本局语音；
- 按钮变绿，显示「语音中 / 语音 N」；
- 再点一次关闭麦克风，停止本地音轨并断开所有语音连接；
- 快速匹配和好友房都可用；单机模式隐藏；
- WebRTC 点对点音频；服务端只转发 `join / offer / answer / ice / leave` 信令，不录制、不转存。

![在线对局语音按钮](qa/out/voice-active-a.png)

## 服务端

- 房间增加 `voice` 在线语音集合；
- `POST /api/rooms/:code/voice` 处理信令；
- join 返回已有语音玩家；SSE 断开/离开自动广播 leave；
- SSE 新增 `voice` 事件；
- `Permissions-Policy` 改为 `microphone=(self)`，否则浏览器会直接拒绝麦克风。

## 客户端

- 新增 `VoiceChat`：
  - `getUserMedia` 请求麦克风；
  - 多玩家 WebRTC mesh；
  - 低 pid 发起 offer，避免 glare；
  - STUN 辅助 NAT 穿透；
  - SSE 重连后自动重新 join；
  - 离开/结算/关闭按钮都会停止本地音轨并关闭 peer。
- 麦克风按钮只在在线 3D 对局显示；
- 权限拒绝、无麦克风、非安全上下文都有中文提示。

## Android

- Manifest 增加 `RECORD_AUDIO`、`MODIFY_AUDIO_SETTINGS`；
- 首次点击麦克风时请求 Android 运行时权限；
- `WebChromeClient.onPermissionRequest` 授权 WebView 使用麦克风。

## 测试

- 两账号进入同一在线牌局；
- 两端打开麦克风后 `voice.enabled = true`；
- peer 状态 `connected`；
- 双方远端音频 `srcObject` 已绑定；
- 按钮显示「语音 1」；
- 关闭后 peer 清空、音轨停止、按钮恢复「语音」；
- 服务端 join/offer/answer/ice/leave 信令验证；
- 无 JS 错误。

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.35.apk` |
| 大小 | 309,141 字节 |
| SHA256 | `4D7AA1E696F49EE83BA9B88CFAABC90E66E085159393A7D87755B52F94513FE5` |
| 签名 | v2 + v3 通过 |
| 包名 | `com.dezhounight.poker` |

## 线上验证

| 检查 | 结果 |
|---|---|
| `/api/health` | ok，features 三项 |
| `/api/app/latest` | `1.0.35` / code 36 / SHA 一致 |
| `/play` | 200，含 1.0.35 / btnVoice |
| `Permissions-Policy` | `camera=(), microphone=(self), geolocation=()` |
| APK 下载 | 309,141 字节，SHA 匹配 |
| systemd | active，13:22 重启 |

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.35-20261024-132215.tgz
sha256 a4c8a96c84be9fba1a73879e62a59f64ac8610cf9f745fe32979887b401b6aa3
```

## 重要：麦克风需要安全上下文

- **Android App**：页面是 `file:///android_asset/index.html`，属于安全上下文，且已声明/请求 `RECORD_AUDIO`，可用；
- **网页**：当前为 `http://192.144.159.220:8080`，Chrome 不允许 HTTP 页面调用麦克风；网页端要语音必须配置 HTTPS 域名/证书；
- WebRTC 使用公共 STUN，极端 NAT 环境可能需要 TURN。
