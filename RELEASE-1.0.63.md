# 德扑之夜 1.0.63 发布记录

- **发布日期**：2026-10-24 19:50（CST）
- **版本**：1.0.63（versionCode 64）
- **生产地址**：http://192.144.159.220:8080
- **状态**：已部署

## 语音根因

### 浏览器网页

`getUserMedia()` 只能在安全源使用：

- HTTPS；
- localhost；
- App 内部安全源。

当前生产网页是 `http://192.144.159.220:8080`，属于**非安全源**，浏览器根本不会弹麦克风权限，也不会返回麦克风音轨。这是浏览器安全限制，不是语音按钮假亮。

### Android App

原 APK 使用：

```text
file:///android_asset/index.html
```

WebView 的 file 源对 getUserMedia 不可靠，部分机型不会触发麦克风权限。

## 修复

### Android 安全源

APK 页面改为：

```text
https://appassets.androidplatform.net/assets/index.html
```

通过 WebView `shouldInterceptRequest` 从 assets 读取页面，形成安全 https 源。

同时：

- 允许混合内容，保证现有 http API/SSE 仍可用；
- 保留 RECORD_AUDIO 权限；
- WebChromeClient.onPermissionRequest 授权麦克风；
- 新增 NativeBridge：
  - `hasMicPermission()`
  - `requestMicPermission()`
- 点击语音前主动请求系统麦克风权限，授权后再调用 getUserMedia。

### WebRTC

- 增加国内 STUN；
- 增加公共 TURN 兜底：
  - turn:openrelay.metered.ca:80
  - turn:openrelay.metered.ca:443
  - turns:openrelay.metered.ca:443
- 增加 iceCandidatePoolSize / max-bundle；
- 麦克风约束失败时退回 `{ audio: true }`；
- 远端音频元素 volume=1、muted=false；
- 连接成功/失败都会给出提示。

## 测试

使用 Chromium 假麦克风，两路客户端进入同一好友房：

```text
A enable:
  enabled: true
  local audio tracks: 1

B enable:
  enabled: true
  local audio tracks: 1

A peer:
  connectionState: connected
  remote audio tracks: 1
  audio element: true

B peer:
  connectionState: connected
  remote audio tracks: 1
  audio element: true
```

说明信令、麦克风采集、WebRTC 连接和远端音频轨道链路正常。

## 重要限制

**HTTP 网页地址无法使用麦克风。**

如果用户坚持用浏览器打开：

```text
http://192.144.159.220:8080/play
```

浏览器会禁止麦克风，必须改成 HTTPS 后才能弹权限。

**请使用 1.0.63 APK**，它已经切到安全源并会主动请求麦克风权限。

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.63.apk` |
| 大小 | 325,525 字节 |
| SHA256 | `255F7C7F84D6C5184DEA6AB40492FB2BCDF34C54AE21FB7A962C186C355E4A86` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.63 / code 64；
- `/play` 200；
- `/admin` 200；
- systemd active。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.63-20261024-195013.tgz
sha256 6f9a9ea34a5e45a10635ffd082f46ebac6aaffa38d2e9c6f14601715462764af
```
