# 德扑之夜 1.1.26 发布记录

- **发布日期**：2026-10-28 19:21（CST）
- **版本**：1.1.26（versionCode 133）
- **生产地址**：http://192.144.159.220:8080
- **性质**：麦克风旁显示当前说话玩家昵称

## 变更

- 标识从页面顶部移到麦克风按钮左侧；
- 文案：`在线甲正在发言`；
- 自己发言显示自己的昵称，不显示“你”；
- 说话期间持续显示，不再4.3秒自动隐藏；
- 说话权释放/关闭语音/断线后自动隐藏；
- 昵称过长时省略号截断，避免挤压按钮；
- 适配手机窄屏。

## 实测

```text
麦克风可见
文字：在线甲正在发言
标识右边缘到麦克风左边距：8px
持续5秒仍显示
释放后隐藏
pageerror=0
```

截图：`docs/requirements/2026-10-28-speaker-name-near-mic/evidence/speaker-near-mic.png`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.26.apk` |
| 大小 | 4,786,310 字节 |
| SHA256 | `82B770923FDB0D4F2DDE127B3D0A4CB78A45F91F31B1EC45A0625FA79B4D3564` |
| versionCode | 133 |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.26 / 133
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.26-20261028-191935.tgz
sha256 9fcdfa456ecb7aa180be9c0863c4f815e9070b415b9a13fd990f64f14037f74e
```

## 风险

- 未做真机1分钟连续说话；
- 未测8人轮流说话；
- 事件丢失时标识可能停留到下一次更新。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.26.apk
- 测试报告：docs/requirements/2026-10-28-speaker-name-near-mic/03-测试报告.md
- 验收报告：docs/requirements/2026-10-28-speaker-name-near-mic/04-验收报告.md
