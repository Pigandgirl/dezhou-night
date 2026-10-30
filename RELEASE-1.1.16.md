# 德扑之夜 1.1.16 发布记录

- **发布日期**：2026-10-27 20:39（CST）
- **版本**：1.1.16（versionCode 123）
- **生产地址**：http://192.144.159.220:8080
- **性质**：玩家独立服装；补齐下半身与完整椅子

## 修复

- 8套独立服装调色板与8种款式：
  - 领带、领结、围巾、马甲、背带、高领、长外套、双排扣；
- 删除场景切换把所有玩家衣服覆盖成同一套配色的逻辑；
- 新增髋部、大腿/小腿、鞋；
- 新增完整椅子：坐垫、扶手、四条椅腿、椅背；
- 继续合并静态几何，控制draw call。

## 实测

```text
7个对手 styles 全部不同
7个对手 jacket 主色全部不同
pageerror = 0
```

截图：`docs/requirements/2026-10-27-outfits-lowerbody-chair/evidence/outfits-lowerbody-chair.png`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.16.apk` |
| 大小 | 4,786,310 字节 |
| SHA256 | `44ED8944164FB3E90BD7B2400A714694190444AE3AF6F405D991935777FBBDD5` |
| versionCode | 123 |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.16 / 123
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.16-20261027-203801.tgz
sha256 29e1d57c427be7fd899d6d94b10f370631fb350a618375035dce15bb9571fea3
```

## 风险

- 未在低端真机测新增几何后的帧率；
- 8人房未逐个截图；
- 不同场景光照下颜色观感可能不同。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.16.apk
- 测试报告：docs/requirements/2026-10-27-outfits-lowerbody-chair/03-测试报告.md
- 验收报告：docs/requirements/2026-10-27-outfits-lowerbody-chair/04-验收报告.md
