# 德扑之夜 1.0.33 发布记录

- **发布日期**：2026-10-24 13:09（CST）
- **版本**：1.0.33（versionCode 34）
- **生产地址**：http://192.144.159.220:8080
- **状态**：已部署并验证

## 问题

在线匹配进入牌桌后显示的是 2D 的 DOM 牌桌（`guestTable`），和单机模式的 3D 房间、真实牌桌、第一视角、3D 底牌/公共牌/筹码、操作条、结算面板不是同一套界面。

## 修复

- 在线匹配开局后不再显示 `guestTable` 2D 牌桌（CSS 永久隐藏）；
- 在线牌局改用单机同款 `PokerScene`：
  - 3D 牌桌、座椅、人偶、筹码、底池、庄家按钮；
  - 第一视角机位；
  - 3D 底牌、公共牌、下注筹码；
  - 单机同款底部操作条：弃牌 / 跟注·过牌 / 加注、滑杆、快捷比例；
  - 单机同款 HUD：底牌查看器、公共牌栏、筹码、盲注、手数；
  - 单机同款结算面板与「继续下一把」；
- 新增 `OnlineTable3D` 适配层：服务端状态 → 3D 场景与 HUD，服务端仍然是唯一权威；
- 处理 `state`/`direct` 早于 `started` 到达的顺序问题；
- 在线准备、行动、摊牌、下一手仍沿用 1.0.32 的服务端逻辑。

## 测试

- 两名真实浏览器玩家快速匹配；
- 确认：
  - `guestTable` 的 computed display = `none`；
  - `scene.playerCount = 2`，heroSeat = 0；
  - 3D 场景进入第一视角；
  - 底牌在 3D 桌面与 HUD 同时显示；
  - 单机同款操作条出现，点击跟注后状态推进；
  - 打到结算，3D 牌桌保持，单机同款结算面板出现；
  - 两人点击「继续下一把」，手数从 1 变为 2，没有 15 秒空等；
  - 无 JS 错误。
- `run-online-browser`：ONLINE 3D OK；
- `run-browser` 单机回归：通过；
- 原有 `run-api`、`run-match`、`run-rooms`、`run-integration`、`run-logic` 行为不变。

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.33.apk` |
| 大小 | 305,045 字节 |
| SHA256 | `B6F52F84FC9422BAA22C83799EC8FB0CDFB44F74E67453F4EB603E7E3A723A63` |
| 签名 | v2 + v3 通过 |
| 包名 | `com.dezhounight.poker` |

## 线上验证

| 检查 | 结果 |
|---|---|
| `/api/health` | ok，features 三项 |
| `/api/app/latest` | `1.0.33` / code 34 / SHA 一致 |
| `/play` | 200，含 1.0.33 |
| APK 下载 | 305,045 字节，SHA 匹配 |
| systemd | active，13:09 重启 |

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.33-20261024-130924.tgz
sha256 96dc75212d762f7ac0e46608dad25c8a7ebdc1143bad257573b2ee7f8b89db9a
```

旧版客户端需要升级到 1.0.33 才能看到 3D 在线牌桌。
