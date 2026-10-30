# 德扑之夜 1.1.28 发布记录

- **发布日期**：2026-10-28 22:12（CST）
- **版本**：1.1.28（versionCode 135）
- **生产地址**：http://192.144.159.220:8080
- **性质**：设置弹窗UI重做

## 变更

- 弹窗改为四个分组：声音、画面与操作、语音与播报、应用与支持；
- 统一开关42×24、下拉框、操作按钮、焦点态；
- 中间内容滚动，底部操作固定；
- 修复旧 `.settings-row > span` 强制28×28导致文字竖排的问题；
- 手机端标签单行、下拉全宽、按钮防挤压；
- 设置打开时隐藏横屏提示；
- 保留所有原有设置ID与功能。

## 实测

```text
桌面弹窗620×704，内容区854/504
手机374×776，内容区924/599
开关5个，下拉3个
音乐开关点击生效
超大音量选择同步config/localStorage
pageerror=0
```

截图：

- `docs/requirements/2026-10-28-settings-ui-redesign/evidence/settings-desktop.png`
- `docs/requirements/2026-10-28-settings-ui-redesign/evidence/settings-mobile.png`
- `docs/requirements/2026-10-28-settings-ui-redesign/evidence/settings-mobile-bottom.png`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.28.apk` |
| 大小 | 4,790,406 字节 |
| SHA256 | `45C1AE697CDBB65DCD75F6B150602D856D069F274C0A9E42904A91CAE1F4397B` |
| versionCode | 135 |

## 部署

```text
/api/app/latest = 1.1.28 / 135
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.28-20261028-221231.tgz
sha256 c8e08dcf3d1267abd74ed24422b6bbe767a9c278760819e722ef1faa4d6a28c7
```

## 风险

- 截图为网页版，未真机截图；
- 未做键盘全量Tab顺序；
- 超长本地化文案未测。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.28.apk
- 测试报告：docs/requirements/2026-10-28-settings-ui-redesign/03-测试报告.md
- 验收报告：docs/requirements/2026-10-28-settings-ui-redesign/04-验收报告.md
