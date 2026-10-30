# 德扑之夜 1.0.87 发布记录

- **发布日期**：2026-10-25 13:41（CST）
- **版本**：1.0.87（versionCode 88）
- **生产地址**：http://192.144.159.220:8080

## 卡顿根因

旧语音链路：

```text
每 85ms 一次 HTTP POST
发送中只保留最后一个 pendingPcm
播放端只提前 60ms
underrun 后重置为 60ms
```

结果：

- 网络稍慢，中间语音帧被覆盖丢失；
- 60ms 缓冲扛不住 RTT 抖动；
- 一断就重新开始，形成连续“卡一下、响一下”。

## 优化方案

### WebSocket 持久连接

- 替代每帧一次 HTTP；
- 二进制 PCM，不走 base64；
- 20ms 一帧；
- 服务端加 `pid + seq` 头，接收端识别说话人。

### 320-550ms 自适应抖动缓冲

- 起始 320ms；
- underrun 时增加 20ms，最高 550ms；
- 稳定 12 秒后逐步降低；
- 延迟换连贯，符合“可以有延迟但不要断断续续”。

### HTTP+SSE 完整队列兜底

WebSocket 被混合内容/网络策略拦截时：

- 不再覆盖 pendingPcm；
- 所有 PCM 进入队列；
- 顺序逐块发送；
- 最多积压 24 帧，防止延迟无限增长。

### WS/SSE 互通

- 服务端 WebSocket 音频同时广播 SSE，兼容旧客户端；
- HTTP 音频同时转发给 WebSocket 客户端；
- WebSocket 可用时接收端忽略 SSE，避免双声。

## 实测

WebSocket：

```text
A: wsActive=true, packetsSent=145, jitterTarget=0.32
B: wsActive=true, packetsReceived=145, jitterTarget=0.34, audioContext=running
发送 145 / 接收 145
```

HTTP 兜底：

```text
A: packetsSent=30, httpQueue=0
B: packetsReceived=30, jitterTarget=0.34
发送 30 / 接收 30
```

## 市场参考

- WebRTC NetEQ 自适应 jitter buffer / Opus FEC 是行业标准；
- AudioWorklet 环形缓冲适合进一步平滑 Web Audio；
- 商用 RTC SDK（声网/即构/腾讯）可直接提供 Opus + 抖动缓冲，但需要额外成本和账号；
- 本项目继续自建 WebSocket PCM，因为此前 WebRTC/TURN 不通，且当前链路已验证可用。

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.87.apk` |
| 大小 | 1,283,989 字节 |
| SHA256 | `1DD7C5BC08652096E3A058C220283029BCA4C986E886CD80B4F75F0218B4931D` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.87 / code 88；
- `/play` 200；
- `/admin` 200。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.87-20261025-134115.tgz
sha256 942f6cc0c144e81283f9a0b3a9ca40da52f8f11ab212c63ab37666236f656d24
```
