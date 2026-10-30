# 德扑之夜 1.1.31 发布记录

- **发布日期**：2026-10-29 12:03（CST）
- **版本**：1.1.31（versionCode 138）
- **生产地址**：http://192.144.159.220:8080
- **性质**：设置每次打开随机切换8种主题

## 变更

- 8套主题接入真实设置弹窗：
  - 01 黑金经典
  - 02 云母玻璃
  - 03 翡翠俱乐部
  - 04 霓虹矩阵
  - 05 纸张极简
  - 06 控制台
  - 07 暖木酒馆
  - 08 极光渐变
- `openSettings()` 随机选择主题；
- 避免连续两次相同；
- 主题只加CSS class，设置ID和功能不变；
- 主题6/8桌面双栏，手机回落单栏；
- 浅色主题2/5重新着色文字、开关、下拉、按钮。

## 实测

```text
连续打开12次：1,2,3,4,6,5,6,7,8,1,8,6
8种主题全部出现
无连续重复
pageerror=0
```

截图：`docs/requirements/2026-10-29-random-settings-themes/evidence/settings-themes-grid.jpg`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.31.apk` |
| 大小 | 4,790,406 字节 |
| SHA256 | `14106494460B3201F9D89B127C0A751E245DFE8554715AE81BC7CB3568A658B6` |
| versionCode | 138 |

## 部署

```text
/api/app/latest = 1.1.31 / 138
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.31-20261029-120142.tgz
sha256 e1655d1883b4fc9abba31002e2d53f59062bceb2493921a53c84562afa584847
```

## 风险

- 未真机逐主题截图；
- 未做WCAG自动对比度测试；
- 超长文案未测。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.31.apk
- 测试报告：docs/requirements/2026-10-29-random-settings-themes/03-测试报告.md
- 验收报告：docs/requirements/2026-10-29-random-settings-themes/04-验收报告.md
