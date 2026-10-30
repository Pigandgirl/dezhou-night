# 德扑之夜 1.0.97 发布记录

- **发布日期**：2026-10-25 17:08（CST）
- **版本**：1.0.97（versionCode 98）
- **生产地址**：http://192.144.159.220:8080

## 问题

用户完成一局单机后退出，再立即进入单机，相机停在远景，牌桌远离玩家。

## 根因

`toLobby()` 正在执行时，`enterTable()` 发现旧的 `transitionPromise` 仍存在，直接返回旧 promise，没有启动进桌动画；旧动画完成后又把 `mode` 设置为 `lobby`，导致游戏已开始但相机还在大厅。

## 修复

相机转场增加递增 token：

- `toLobby` / `enterTable` 开始时 token+1；
- 每个动画 update 只处理当前 token；
- 旧动画完成时不再覆盖 mode 或清空新 promise；
- 完成时强制设置目标位置、FOV、lookAt；
- 新进桌不再复用旧离桌 promise。

## 实测

```text
mode = hero
camera = [0, 1.30057, 1.22]
heroCamBase = [0, 1.3, 1.22]
distance = 0.00057
pageerror = 无
```

截图：`evidence/camera-reentry-fixed.png`。

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.97.apk` |
| 大小 | 2,020,101 字节 |
| SHA256 | `C8E7B3E7892DE28638DA2FB964DDAC8DDEA14C070E77FBC5D60D3E6F6F510477` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.97 / code 98；
- `/play` 200；
- `/admin` 200。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.97-20261025-170735.tgz
sha256 719548f56c266b6adb4c2a7d60bfdfb070d454de2f3487350febddae84589bf0
```
