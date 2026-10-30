# 德扑之夜 1.1.23 发布记录

- **发布日期**：2026-10-28 10:41（CST）
- **版本**：1.1.23（versionCode 130）
- **生产地址**：http://192.144.159.220:8080
- **性质**：修复好友房3人多一副底牌、弃牌后桌面残留底牌

## 根因

1. `dealHoleCards()` 遍历固定8座位的稀疏槽位，空座位也生成底牌；
2. 弃牌先播放muck渐隐动画，动画期间牌仍留在场景。

## 修复

- 只为 `serverByDisplay` 中真实存在的座位发牌；
- 弃牌时立即 `cards.remove()`；
- 增加 `scene.discardHoleCards(seat)` 同步清理；
- 状态层弃牌立即同步清理。

## 实测

```text
3人：holeSeats=3，holeCards=6
弃牌后：folded=[0]，holeCards=4
fHole=[[0,0],[1,2],[4,2]]
2–8人：holeCards=2×人数
pageerror=0
```

截图：`docs/requirements/2026-10-28-holecards-fold-fix/evidence/holecards-1-to-8-grid.jpg`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.23.apk` |
| 大小 | 4,786,310 字节 |
| SHA256 | `A2584F4C4D88420B487610AB623C63CC5A6F9BB7BCE4F621FC4C6F62FD8438C7` |
| versionCode | 130 |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.23 / 130
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.23-20261028-104112.tgz
sha256 2299ac1ab0d6c88c319b0c4956a0321fd477ca8ca5f6808a91850cc9b4ccfe66
```

## 风险/未验证

- 1人不能开局；
- 截图为网页版；
- 真机长时间多手弃牌未测；
- 低端机性能未测。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.23.apk
- 测试报告：docs/requirements/2026-10-28-holecards-fold-fix/03-测试报告.md
- 验收报告：docs/requirements/2026-10-28-holecards-fold-fix/04-验收报告.md
