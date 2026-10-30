# 德扑之夜 1.1.6 发布记录

- **发布日期**：2026-10-26 21:37（CST）
- **版本**：1.1.6（versionCode 112）
- **生产地址**：http://192.144.159.220:8080
- **性质**：HUD 底牌面板遮挡筹码修复

## 问题

横屏对局中，左上角底牌面板遮挡“你的筹码”数字。

## 修复

- 手机横屏底牌面板 `left:150px → 178px`；
- 桌面端 `left: clamp(280px,22vw,340px)`；
- 展开按钮同步移动；
- 底牌切换/收起逻辑不变；
- 900×414 下底牌与 hero 区域间距 42px。

## 实测

```text
900×414 CSS, DPR2
cardViewer x=178 right=310
hero-line  x=22  right=136
heroStack  x=99  right=124
间距=42px
筹码 100 完整可见
pageerror=0
```

截图：`docs/requirements/2026-10-26-hud-stack-overlap/evidence/stack-visible.png`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.6.apk` |
| 大小 | 4,774,022 字节 |
| SHA256 | `4BCA131850B86A4BE2A562E5025CBF96C13794EB6359CD47BB4C202A9F77D639` |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.6 / 112
/play = 200
/admin = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.6-20261026-213539.tgz
sha256 89b5a459e1a86a463b1479cf7c33c547f604f8ec7ed686c5593cb7433021e880
```

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.6.apk
- 测试报告：docs/requirements/2026-10-26-hud-stack-overlap/03-测试报告.md
- 验收报告：docs/requirements/2026-10-26-hud-stack-overlap/04-验收报告.md
