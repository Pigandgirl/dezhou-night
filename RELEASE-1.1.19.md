# 德扑之夜 1.1.19 发布记录

- **发布日期**：2026-10-27 21:25（CST）
- **版本**：1.1.19（versionCode 126）
- **生产地址**：http://192.144.159.220:8080
- **性质**：修复2人局第三人加入后只看到一个对手/空间错乱

## 根因

第三人加入当前手时是等待状态，不会重建当前手。下一手变为3人时，第一视角相机按自己座位旋转，但默认近距离 `userZoom=1`，另一名对手落在镜头背后/取景框外，看起来像模型消失。

## 修复

`setHeroSeat(index,count)` 增加默认最小视距：

- 3人桌：`userZoom≥1.55`
- 4人桌：`userZoom≥1.3`
- 5人以上：保持1.0，用户可自行缩放

不改变服务器座位顺序，仅修正默认取景。

## 实测

```text
2人在局：seats=2 rigs=1
第三人加入当前手：waiting=true，当前手不重建
下一手：seats=3 rigs=2 visible=[true,true]
3人默认 userZoom=1.55
两个对手都在画面内
pageerror=0
```

截图：`docs/requirements/2026-10-27-third-player-camera-fix/evidence/three-player-framed.png`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.19.apk` |
| 大小 | 4,786,310 字节 |
| SHA256 | `E2D74B0F3D515500A64CE7270846CAA5F3BE0BA9E4293B82510CAE8CFC44E1A5` |
| versionCode | 126 |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.19 / 126
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.19-20261027-212355.tgz
sha256 7d161fef10807b76133f5027fab501d28e1d57f14c2554e8b1cc965ca3136edc
```

## 风险

- 低端真机卡顿未验证；
- 多手加入/退出未穷举；
- 8人房未逐人视角核对。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.19.apk
- 测试报告：docs/requirements/2026-10-27-third-player-camera-fix/03-测试报告.md
- 验收报告：docs/requirements/2026-10-27-third-player-camera-fix/04-验收报告.md
