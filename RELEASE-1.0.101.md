# 德扑之夜 1.0.101 发布记录

- **发布日期**：2026-10-25 22:23（CST）
- **版本**：1.0.101（versionCode 102）
- **生产地址**：http://192.144.159.220:8080

## 首页布局

左侧标题、用户名、筹码信息现在作为一组在大厅垂直居中，内部仍左对齐。

实测 1200×700：

```text
hero center = 368.80
main center = 368.80
centerDelta = 0
```

手机 844×390：

```text
hero center = 218
main center = 218
```

## 生涯

- Tab「流水」改为「筹码记录」；
- 卡片「筹码流水」改为「筹码记录」；
- 移除「生涯积分」显示；
- 每日项目改为「单机筹码」「大厅筹码」。

## 去积分

- 前台账号 API 不再返回 `points`；
- 生涯页不再显示积分；
- 单机 AI 奖励：每分钟 **+2 大厅筹码**；
- 大厅停留：每分钟 **+1 大厅筹码**；
- 每日上限保持：
  - 好友房 100 筹码
  - 单机 120 筹码
  - 大厅 60 筹码
- 好友房每手胜/平仍 +5 大厅筹码。

> 后端旧 points 字段保留用于旧排行榜/后台历史，不再向前台返回。

## 实测

```text
account.points = undefined
单机：
0s chips=10
60s earned=2 chips=12
daily.singleChips=2
生涯 tabs：总览/牌型/好友/称号/筹码记录
```

截图：

- `evidence/lobby-left-center.png`
- `evidence/lobby-mobile-center.png`
- `evidence/career-chips-only.png`

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.101.apk` |
| 大小 | 2,028,293 字节 |
| SHA256 | `9193C0787997D8897EECBF8B10EC1F52F31AE1F54244CD8C2A8ECFB2DE4F79E7` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.101 / code 102；
- `/play` 200；
- `/admin` 200。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.101-20261025-222307.tgz
sha256 9809114a3947be9cda384c71063d93decc3c3b574e33b3924d0fe7e763ebe880
```
