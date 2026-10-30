# 德扑之夜 1.0.100 发布记录

- **发布日期**：2026-10-25 22:18（CST）
- **版本**：1.0.100（versionCode 101）
- **生产地址**：http://192.144.159.220:8080

## P0 在线体验

### 全弃牌隐私

- 服务端 `buildSettlement(false)` 不再返回底牌/最佳五张/牌型/牌力；
- 结算状态以 `reveal=false` 广播；
- 客户端结算不渲染底牌槽；
- 3D 非摊牌不亮赢家底牌。

### 筹码与焦点

- 名牌显示剩余筹码与本手下注；
- 当前操作玩家显示“思考中”，带 glow 与常亮名牌；
- 当前操作玩家顶部信息带名字、剩余筹码、下注；
- 镜头只做轻量视线偏移（实测 offset≈0.25），不绕到玩家身后；
- 观战/自己回合/他人回合分层显示。

### 中英术语

`check / call / bet / raise / all in / fold / showdown` 50% 概率英文 TTS，其余中文语音包。

## P1

### 观战自由视角

- 筹码归零/观战状态进入自由镜头；
- 拖动水平旋转，上下俯仰，滚轮缩放；
- 「回到主视角」；
- 隐藏底牌/底牌面板，只显示公共牌、底池、筹码、操作。

### 后台在线

- SSE 断开不立即离线，保留 90 秒宽限；
- 重连清除离线计时；
- 前端 5 秒内不提示断开，避免切后台 3-4 秒就弹窗。

### 语音

- 16k PCM → 8k 单声道；
- VAD 静音门限；
- 静音超过 8 帧停止发包；
- 20ms 帧。

> Opus 未落地：测试环境 WebCodecs AudioEncoder 不可用；当前为低码率 PCM+VAD。

## 实测

```text
setTurn(1)
actorLookOffset = [-0.252, 0.02, -0.066]
mode = hero

spectator:
scene.mode = spectator
badge visible = true
card-viewer display = none
```

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.100.apk` |
| 大小 | 2,028,293 字节 |
| SHA256 | `96977F09F2EA5BF112E8471EAD2964DAD60888C70866DCA2B0B4902003EA37B0` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.100 / code 101；
- `/play` 200；
- `/admin` 200。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.100-20261025-221748.tgz
sha256 1fa4313e7a4d3cb01510c9f8945f809f177b5c2afb32343100abfe8486ff795f
```

## 遗留

- Opus/WebRTC 语音；
- 4 麦克风真机压测；
- 后台60秒真机；
- 全弃牌真实抓包；
- 低动态模式；
- 中英字幕。
