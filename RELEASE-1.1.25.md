# 德扑之夜 1.1.25 发布记录

- **发布日期**：2026-10-28 18:25（CST）
- **版本**：1.1.25（versionCode 132）
- **生产地址**：http://192.144.159.220:8080
- **性质**：语音改为VAD自动申请/释放说话权

## 背景

原逻辑以第一个音频帧为说话权，静音帧也持续上传，且没有自动释放；环境噪音或先开麦的人可能长期占麦。

## 修改

### 客户端 VAD

- 麦克风可保持开启/监听；
- 峰值低于0.008不上传；
- 静音保留8帧尾音；
- 连续静音12帧（约1秒）调用release；
- 已有人说话时，本地继续采集但不上传；
- 对方释放后，下一帧真实语音自动重新申请；
- 关闭语音发送leave，立即释放；
- 不再有5秒自动关闭。

### 服务端

新增 `/api/rooms/:code/voice` 的 `release`：

```text
A持有：200
B发送：409
A release：200
B发送：200
```

- 同一时间仍只允许一个玩家说话；
- 释放后可立即接话，不需要重新点麦克风。

## 实测

```text
A发送语音帧：200
B在A持有期间：409
A release：200
B再次发送：200
```

证据：`docs/requirements/2026-10-28-vad-voice-floor/evidence/voice-floor-api.txt`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.25.apk` |
| 大小 | 4,786,310 字节 |
| SHA256 | `71E231E29FA86A3E15603E32583CC3A5C6FF11A59A335E12AF30133934077AD6` |
| versionCode | 132 |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.25 / 132
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.25-20261028-182545.tgz
sha256 820ddc0f83b74a66818e25bc7a5b74ae61dfb32c6b662d46dbad78adc0a441f5
```

## 风险

- VAD阈值0.008未在真机噪音环境校准；
- 未做双真机回声/延迟测试；
- 同时开口时先到先得，另一个需等下一次开口；
- 未做排队说话UI。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.25.apk
- 测试报告：docs/requirements/2026-10-28-vad-voice-floor/03-测试报告.md
- 验收报告：docs/requirements/2026-10-28-vad-voice-floor/04-验收报告.md
