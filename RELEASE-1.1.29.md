# 德扑之夜 1.1.29 发布记录

- **发布日期**：2026-10-29 08:01（CST）
- **版本**：1.1.29（versionCode 136）
- **生产地址**：http://192.144.159.220:8080
- **性质**：第一手底牌修复 + 最多8路同时语音

## 1. 中途加入第一手底牌

根因：等待状态收到 `spectatorState`（spectator=true），下一手私牌 direct 先于正式 state 到达，客户端直接丢弃。

修复：

- 私牌不再因 spectator 标记丢弃；
- 只丢弃更旧 hand 的私牌；
- 正式 state 建立后显示。

实测：

```text
hand=6
heroHoleHand=6
heroHole=4♠ 7♣
HUD=4♠ 7♣
```

截图：`docs/requirements/2026-10-29-first-hole-multivoice/evidence/third-first-hand-cards.png`

## 2. 多路语音

- 移除单人抢麦和409限制；
- 最多8人同时加入/说话；
- 服务端广播所有说话人的PCM；
- 客户端每个说话人独立时间线混音，不再串行；
- DynamicsCompressor防叠加破音；
- VAD静音仍不上传；
- 麦克风旁支持多人昵称“多人正在发言”。

实测：

```text
3人同时发送：200/200/200
remoteTimelines=3
pids=[2,3,4]
playbackGain=3
DynamicsCompressor=true
```

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.29.apk` |
| 大小 | 4,790,406 字节 |
| SHA256 | `68BA60A8A2DF574D38D9D5C7F81B0688F190E0B3820216B5F574581194722E9B` |
| versionCode | 136 |

## 部署

```text
/api/app/latest = 1.1.29 / 136
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.29-20261029-075945.tgz
sha256 9e3c4b28ba416221cdf852a2a83c2e9e0fee0c0a8ceef7b8aa8c0398f5cecb77
```

## 风险

- 未真机8路同时说话；
- 未测回声消除和弱网；
- 8路大音量仍可能超出压缩器处理范围；
- 多说话人昵称在窄屏会截断。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.29.apk
- 测试报告：docs/requirements/2026-10-29-first-hole-multivoice/03-测试报告.md
- 验收报告：docs/requirements/2026-10-29-first-hole-multivoice/04-验收报告.md
