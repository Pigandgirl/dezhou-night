# 德扑之夜 1.1.9 发布记录

- **发布日期**：2026-10-27 00:03（CST）
- **版本**：1.1.9（versionCode 115）
- **生产地址**：http://192.144.159.220:8080
- **性质**：关闭环境底噪、视角缩放、动态折叠、手机浏览器适配、弃牌确认

## 修复

### 背景沙沙声
- 不再启动 crackle（火焰底噪）和 ambience（环境白噪声）；
- 背景音乐照常播放。

### 视角缩放
- 双指捏合：第一视角 1→2.8 倍距离；
- 滚轮同样可缩放；
- 最远可看到整张牌桌和周围玩家；
- 观战视角半径 1.6→3.8。

### 左侧动态
- 默认不透明度 0.84；
- 点击“收起动态”折叠到屏幕左缘，opacity 0；
- 左缘“动态”按钮可展开；
- 折叠状态保存在 localStorage。

### 手机浏览器竖屏
- 390×844 行动条固定在底部可视区；
- 加注滑杆、弃牌、跟注、加注均可见；
- 收起手牌信息/动态栏，减少遮挡；
- 保留横屏最佳体验。

### 弃牌确认
- 点击弃牌先弹“确定要弃牌吗？”；
- “继续这手”不发送动作；
- “确认弃牌”才发送 fold；
- 键盘 F 同样确认；自动超时弃牌不弹窗。

## 实测

```text
musicOn=true, crackle=null, ambience=null
pinch: userZoom=2.8, cameraDist=4.53
feed: collapsed=true, opacity=0
mobile actionbar: x=6 y=732 w=378 h=106 bottom=838
fold: first resolved=null; cancel=null; confirm={type:fold}
pageerror=0
```

截图：
- `docs/requirements/2026-10-26-ux-zoom-feed-fold-mobile/evidence/zoom-feed-collapse.png`
- `docs/requirements/2026-10-26-ux-zoom-feed-fold-mobile/evidence/mobile-actionbar-fold-confirm.png`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.9.apk` |
| 大小 | 4,778,118 字节 |
| SHA256 | `EBB7F496757F6557C482C2B5511A256A1DA7DB481B5A3ADB651596FDFA029936` |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.9 / 115
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.9-20261027-000216.tgz
sha256 498b6c24ed656be8af3d5653ffdc62d9ade9d4790c7bb79e5a169fed4df957c7
```

## 风险

- 真机扬声器听感未验证；
- 竖屏是浏览器兜底，建议横屏；
- 弃牌确认多一步；
- 折叠偏好只存在本机。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.9.apk
- 测试报告：docs/requirements/2026-10-26-ux-zoom-feed-fold-mobile/03-测试报告.md
- 验收报告：docs/requirements/2026-10-26-ux-zoom-feed-fold-mobile/04-验收报告.md
