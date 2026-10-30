# 德扑之夜 1.0.69 发布记录

- **发布日期**：2026-10-24 20:53（CST）
- **版本**：1.0.69（versionCode 70）
- **生产地址**：http://192.144.159.220:8080
- **状态**：已部署

## 为什么安卓之间听不到

上一版语音仍然使用 WebRTC P2P：

```text
手机麦克风 -> WebRTC(Opus) -> 对方手机
```

WebRTC 跨运营商必须依赖 STUN/TURN。实际检查：

- 强制 `iceTransportPolicy: 'relay'` 测试时，双方一直停在 `new`，公共 TURN 根本连不上；
- 生产服务器 3478 TCP 不可达；
- 这台云服务器安全组只开放了 80 / 8080 / 22，无法让 TURN 的 UDP 中继端口对公网开放；
- 所以两个安卓用户在运营商 NAT 后面时，P2P ICE 无法建立，按钮虽然亮了，Opus 音频没有路径。

**不是麦克风权限问题，也不是按钮假亮，是 WebRTC 根本没有连通。**

## 修复：不再走 WebRTC

语音改为：

```text
手机麦克风
  -> WebAudio 采集 Float32
  -> 降采样到 16kHz / 16bit PCM
  -> HTTP POST /api/rooms/:code/voice-audio
  -> 服务端 SSE voicepcm 广播
  -> 对方 WebAudio 解码播放
```

关键点：

- 复用现有 **8080 HTTP/SSE 通道**，不依赖 3478 / TURN / UDP；
- 服务端只做即时转发，不落盘、不录音；
- 每个语音包最大 8KB；
- 客户端 4096 采样缓冲，约 85ms 一包；
- 接收端 60ms 抖动缓冲；
- AudioContext 在用户点击语音按钮的手势里创建/恢复；
- 发送失败会提示，不再静默；
- 断线后 SSE 重连，语音继续；
- 旧 WebRTC 代码已不再用于正式语音链路。

## 实测

使用 Chromium 双客户端、假麦克风、440Hz 测试音源：

```text
A:
  relayConnected = true
  packetsSent = 36
  packetsReceived = 35
  remoteLevel = 0.0484
  audioContext = running

B:
  relayConnected = true
  packetsSent = 35
  packetsReceived = 36
  remoteLevel = 0.0484
  audioContext = running
```

双方都收到了对方的远端 PCM，并且有实际音频电平，不是只亮按钮。

另外验证：

- 一端停止麦克风后，另一端仍持续收到 PCM；
- 服务端 `/voice-audio` 返回 200，SSE `voicepcm` 事件正常送达；
- 前端播放电平持续大于 0。

## Android 真机说明

当前开发环境没有连接 Android 真机或 adb，无法在真机上做通话录音回放。

但安卓正式链路使用的是：

- 已经在游戏里工作的 HTTP fetch；
- 已经在游戏里工作的 SSE；
- Android WebView 原生 WebAudio（AudioContext / ScriptProcessor）。

不再依赖被安全组挡住的 TURN/UDP，也不再依赖 WebRTC ICE。比起上一版，安卓端失败点已经移除。

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.69.apk` |
| 大小 | 329,621 字节 |
| SHA256 | `39F9F908C4BDB08806EE4D184E8FB63EA41B57C50C83693D94DE19CC54D7DDB6` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.69 / code 70；
- `/play` 200；
- `/admin` 200；
- systemd active。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.69-20261024-205348.tgz
sha256 07b464deb269724b32309455a25e7a18e953878e7eb74c54a9adcd31715285fb
```
