# 德扑之夜 1.0.102 发布记录

- **发布日期**：2026-10-25 22:28（CST）
- **版本**：1.0.102（versionCode 103）
- **生产地址**：http://192.144.159.220:8080

## 本轮补齐

- 低动态模式：设置中可关闭镜头跟随/强动效；
- 中英字幕：行为条显示中文动作 + `ALL IN / RAISE / BET / CALL / CHECK / FOLD`；
- 观战默认关闭麦克风；
- 全弃牌隐私增加单元验证；
- 首页左列居中、生涯改名、去积分继承1.0.101。

## 实测

```text
全弃牌 buildSettlement(false)：
  hole 字段不存在
  bestCards=[]
  handName=''
  score=[]

低动态：
  scene.lowMotion=true
  actorLookOffset=[0,0,0]
  html.low-motion=true

中英字幕：
  feed-en = BET

观战：
  setSpectatorMode(true)
  voiceChat.disable() called
  badge visible
  card-viewer hidden
```

## 仍未完成（不能标记通过）

- **Opus 编码**：当前 WebView/测试环境无可用 AudioEncoder；opusscript 需要额外 wasm/worker 资产，未安全接入；
- **4 麦克风真实 10 分钟压测**：无真实设备/麦克风；
- **真机后台 3/10/60 秒**：无 adb/真机；
- 真机镜头晕动测试。

当前语音仍为 8kHz PCM + VAD，不是 Opus。

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.102.apk` |
| 大小 | 2,028,293 字节 |
| SHA256 | `35994B4FBD4881517145DE3FEFBF39C68557D17B6C0C306417E0A8F04E3D0539` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.102 / code 103；
- `/play` 200；
- `/admin` 200。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.102-20261025-222808.tgz
sha256 0b0a1748d542c3fd38d33121eb784668c83f4ed85400cf4524c2963ab229894c
```
