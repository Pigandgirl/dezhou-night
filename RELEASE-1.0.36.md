# 德扑之夜 1.0.36 发布记录

- **发布日期**：2026-10-24 13:31（CST）
- **版本**：1.0.36（versionCode 37）
- **生产地址**：http://192.144.159.220:8080/play
- **状态**：已部署并验证

## 新增：iOS「添加到主屏幕」安装

iOS 不能安装 Android APK，也不经过 App Store 时，最现实的方式是 **Safari 添加到主屏幕**：

1. iPhone/iPad 用 **Safari** 打开：
   `http://192.144.159.220:8080/play`
2. 点 Safari 底部 **分享**；
3. 选择 **添加到主屏幕**；
4. 命名为「德扑之夜」，添加；
5. 从主屏幕图标启动，进入独立窗口游戏。

本轮补充：

- `manifest.webmanifest`（名称、图标、横屏、standalone）；
- 180/192/512 PNG 图标；
- `apple-touch-icon`；
- `apple-mobile-web-app-capable` / standalone / 状态栏；
- `sw.js` 与 Service Worker 注册（HTTPS 下生效）；
- `/play/manifest.webmanifest`、`/play/sw.js`、`/play/icons/*` 服务端路由；
- 退出/更新时缓存策略。

## 重要限制

- **HTTP 下 iOS 可以添加主屏幕并玩游戏**，但 Service Worker/PWA 离线缓存不会启用（需要 HTTPS）；
- **iOS 的麦克风必须 HTTPS**；当前 `http://192.144.159.220:8080` 无法语音；
- 要 iOS 语音，需要后续配置 HTTPS 域名/证书，或通过 Apple Developer/TestFlight 做原生包；
- 真机 IPA 安装需要 Apple 开发者签名，无法用 Android APK 替代。

## 验证

- `/play` 返回 200，包含 manifest、apple-touch-icon；
- `/play/manifest.webmanifest` 200，`application/manifest+json`；
- `/play/sw.js` 200，JS；
- `/play/icons/apple-touch-icon.png` 200；
- 图标尺寸 180/192/512；
- 页面在浏览器中正常进入大厅；
- Android APK 1.0.36 同步打包。

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.36.apk` |
| 大小 | 309,141 字节 |
| SHA256 | `421FF36734CCAE74299DCB215F4A1F77FFAA6CAC23285C5BDF76140FF0C7E67F` |
| 签名 | v2 + v3 通过 |

## 线上验证

| 检查 | 结果 |
|---|---|
| `/api/health` | ok |
| `/api/app/latest` | `1.0.36` / code 37 |
| `/play` | 200 |
| manifest/sw/icon | 200 |
| systemd | dezhounight active，camelup active |

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.36-20261024-133106.tgz
sha256 b81dc457215f3b5c571328b8a508c95c706c4e57108885ad41224d30872ed9e7
```

## 后续建议

- 给服务器配一个已备案/可解析域名和 HTTPS 证书；
- HTTPS 后 iOS 可直接安装完整 PWA（Service Worker、麦克风语音）；
- 若要做真正的 iOS App，需要 Apple Developer 账号 + TestFlight/App Store 签名。
