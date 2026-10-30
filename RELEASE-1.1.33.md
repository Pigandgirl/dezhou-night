# 德扑之夜 1.1.33 发布记录

- **发布日期**：2026-10-29 14:17（CST）
- **版本**：1.1.33（versionCode 140）
- **生产地址**：http://192.144.159.220:8080
- **性质**：设置顶部压缩，仅显示“设置”和关闭按钮

## 变更

- 删除顶部英文 Kicker（OBSIDIAN / 01 等）；
- 删除标题下副标题；
- 标题条高度54px→38px；
- 标题字号21px，与29×29关闭按钮垂直居中；
- 手机标题条36px；
- 保留整页滚动、随机主题和全部设置功能。

## 实测

```text
标题条：38px
标题：设置
标题文字高度：29px
关闭按钮：29×29
Kicker：none
副标题：none
内容可视高度：750px
pageerror=0
```

截图：

- `docs/requirements/2026-10-29-compact-settings-header/evidence/settings-header.png`
- `.../settings-header-crop.png`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.33.apk` |
| 大小 | 4,794,502 字节 |
| SHA256 | `649CE187EDD747929166DAF98ED3A5AE6288DF70ADA6709BF184CF674CC2F37D` |
| versionCode | 140 |

## 部署

```text
/api/app/latest = 1.1.33 / 140
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.33-20261029-141610.tgz
sha256 e1214334d3fb93343fd7393b1cef0e836e38317bdf1e159abb3b312673ecf31a
```

## 风险

- 未真机截图；
- 未测字体放大/多语言。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.33.apk
- 测试报告：docs/requirements/2026-10-29-compact-settings-header/03-测试报告.md
- 验收报告：docs/requirements/2026-10-29-compact-settings-header/04-验收报告.md
