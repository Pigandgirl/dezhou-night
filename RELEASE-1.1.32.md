# 德扑之夜 1.1.32 发布记录

- **发布日期**：2026-10-29 13:19（CST）
- **版本**：1.1.32（versionCode 139）
- **生产地址**：http://192.144.159.220:8080
- **性质**：设置弹窗取消上下固定悬浮，整页滚动

## 变更

- 顶部标题改为 static，随页面滚动，不再固定遮挡；
- 标题压缩：Kicker+标题+关闭按钮，高54px；
- 底部“规则/返回大厅”改为 static，跟内容滚动，不吸底；
- 中间 `.settings-scroll` 不再独立滚动；
- 整个 `.settings-modal-v2` 统一 overflow-y:auto；
- 最大高度94vh；800视口下可操作区750px（原来504px）；
- 手机标题更紧凑，内容单列滚动；
- 随机主题和所有设置功能保留。

## 实测

```text
弹窗 height=752
整页 scrollHeight=916 / clientHeight=750
标题高54px
滚动前：底部 top=885（视口外）
滚动到底：顶部top=-141，底部top=719
pageerror=0
```

四张截图：

- `docs/requirements/2026-10-29-settings-full-scroll/evidence/scroll-1-top.png`
- `.../scroll-2-middle.png`
- `.../scroll-3-bottom.png`
- `.../scroll-4-mobile.png`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.32.apk` |
| 大小 | 4,790,406 字节 |
| SHA256 | `6291F4759460BA9829BF2747EEE7979C663C00EE9FEA3DDBC062969EC7E0DAB4` |
| versionCode | 139 |

## 部署

```text
/api/app/latest = 1.1.32 / 139
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.32-20261029-131905.tgz
sha256 2d24fe4695de9c27be3190cc20d37fd861b0c4c665253388b1089d05cca88094
```

## 风险

- 未真机截图；
- 超长内容/字体放大未测；
- 触控惯性未专项测试。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.32.apk
- 测试报告：docs/requirements/2026-10-29-settings-full-scroll/03-测试报告.md
- 验收报告：docs/requirements/2026-10-29-settings-full-scroll/04-验收报告.md
