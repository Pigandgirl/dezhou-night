# 德扑之夜 1.1.27 发布记录

- **发布日期**：2026-10-28 21:39（CST）
- **版本**：1.1.27（versionCode 134）
- **生产地址**：http://192.144.159.220:8080
- **性质**：输家/观战玩家结算显示修复；语音输出音量五档

## 1. 输家/观战结算

根因：`spectatorState()` 把 `settlement` 置为 `null`，被淘汰/观战玩家收不到结算。

修复：

- 结算阶段保留公开 `settlement`；
- 仍隐藏观战者底牌权限；
- 输家与赢家看到同一份结算：赢家、底牌、牌型、奖池、获得筹码；
- 结算显示后再进入重开/退出流程。

实测：

```text
输家 stack=0
spectator=true
state.settlement=true
#singleSettle hidden=false
赢家5 一对 +40
```

截图：`docs/requirements/2026-10-28-loser-settlement-volume/evidence/loser-settlement.png`

## 2. 语音音量

设置新增“语音输出音量”：

| 档位 | 倍数 |
|---|---|
| 小 | 1倍（原音量） |
| 中 | 2倍 |
| 大 | 3倍（默认） |
| 特大 | 3.5倍 |
| 超大 | 4倍 |

- 使用 WebAudio GainNode 放大房间语音；
- 不影响背景音乐/术语播报；
- localStorage `pokerVoiceVolume` 持久化。

实测：

```text
默认 large → gain=3
small=1 / medium=2 / large=3 / extraLarge=3.5 / huge=4
```

截图：`docs/requirements/2026-10-28-loser-settlement-volume/evidence/voice-volume-setting.png`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.27.apk` |
| 大小 | 4,786,310 字节 |
| SHA256 | `03ED1DFCA901188E9C749E774D62A9229FD2496841344E5F73DA9D359EBD7F6E` |
| versionCode | 134 |

## 部署

```text
/api/app/latest = 1.1.27 / 134
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.27-20261028-213917.tgz
sha256 c42c4c50eb6f5bff9c0cc1144c36f3d2500b5cb9307406f4412766b4d5338dc0
```

## 风险

- 音量为本机设置，不跨设备同步；
- 4倍音量未在真机测破音；
- 结算页面语音等待期间可能延迟约3.5秒。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.27.apk
- 测试报告：docs/requirements/2026-10-28-loser-settlement-volume/03-测试报告.md
- 验收报告：docs/requirements/2026-10-28-loser-settlement-volume/04-验收报告.md
