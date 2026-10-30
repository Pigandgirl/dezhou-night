# 德扑之夜 1.0.85 发布记录

- **发布日期**：2026-10-25 11:26（CST）
- **版本**：1.0.85（versionCode 86）
- **生产地址**：http://192.144.159.220:8080
- **状态**：已部署

## 为什么 1.0.82 下载失败

1.0.82 的更新首选 Android `DownloadManager`，失败后回退 `HttpURLConnection`。这两条路都依赖原生网络栈，在当前设备/网络策略下失败。

## 1.0.85 新下载链路

```text
游戏 WebView fetch 读取 APK
  -> 每 64KB 转 base64
  -> NativeBridge.appendWebUpdate 写入原生文件
  -> finishWebUpdate
  -> 系统安装器
```

不再把 DownloadManager 作为首选。

### 关键实现

- `downloadApkInWebView()`：真实 fetch 下载；
- 每 64KB 分片，避免 JS Bridge 单次传递 1.7MB；
- `beginWebUpdate` / `appendWebUpdate` / `finishWebUpdate` / `abortWebUpdate`；
- 真实进度：接收字节 / Content-Length；
- 失败显示「失败」「重试下载」「浏览器下载」；
- 15 秒无进度提示。

## 实测

```text
APK 大小：1275797
接收字节：1275797
分片数量：20
finishWebUpdate：true
进度：100%
```

```text
失败状态：失败
重试按钮：显示
浏览器下载：显示
```

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.85.apk` |
| 大小 | 1,275,797 字节 |
| SHA256 | `3FAC9D2EEF744FAFE8E5BE014137B6918BF3DBBA7A8824609DD36B96F54595F9` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.85 / code 86；
- `/play` 200；
- `/admin` 200。

## 旧版用户必须手动安装一次

当前 1.0.82 的旧下载器无法自动取到 1.0.85，因此请用手机浏览器打开：

```text
http://192.144.159.220:8080/download/DezhouNight-1.0.85.apk
```

手动安装 1.0.85 后，后续更新使用新的 WebView 分片下载链路。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.85-20261025-112535.tgz
sha256 da1e295677aa41413e52b7d2a2cd0b98e9b2e44d1c248bb793ac92beef77226b
```
