# 德扑之夜 1.0.92 发布记录

- **发布日期**：2026-10-25 14:41（CST）
- **版本**：1.0.92（versionCode 93）
- **生产地址**：http://192.144.159.220:8080

## 本轮做了什么

### 1. 静态资源压缩

`/play` HTML 支持 Brotli/Gzip：

```text
优化前 br: 1,154,446 bytes
优化后 br:   248,153 bytes
```

首次 HTML 原始体积：

```text
3,203,884 -> 1,047,321 bytes
```

服务器启动时预热压缩缓存，第一个用户不需要承担压缩等待。

### 2. ETag / 304 缓存

- HTML `Cache-Control` 从 `no-store` 改为 `no-cache, must-revalidate`；
- 增加 ETag；
- 回访发送 `If-None-Match` 返回 304，0 字节。

### 3. 语音数据外置

192 个 MP3 从 HTML base64 中移出：

- 网页：`/voice/<profile>/<clip>.mp3`，24小时浏览器缓存；
- APK：`assets/voice_<profile>_<clip>.mp3` 扁平打包；
- 只加载当前音色，不再让首屏解析2MB音频数据；
- APK 静态检查：192个扁平 MP3，无 Windows反斜杠目录。

### 4. 服务端热路径优化

- `latest.json` 按 mtime 缓存，不再每个版本门禁请求读盘解析；
- `dayKey()` 复用 `Intl.DateTimeFormat`；
- `broadcastState` 复用正常/观战 JSON 帧，减少逐客户端重复序列化；
- 静态文件支持 HEAD、Range、gzip/br、ETag、压缩失败自动回退。

## 实测

```text
GET /play br: HTTP 200, 248,123 bytes, Content-Encoding: br
GET /play gzip: HTTP 200, 269,864 bytes
If-None-Match: HTTP 304, 0 bytes
GET /voice/female_mature/check.mp3: 200, 7,632 bytes, audio/mpeg
浏览器: DCL 39.3ms, transfer 248KB, decoded HTML 1.05MB
语音: 24个文件全部200，AudioBuffer 24
pageerror: []
```

## 代价

APK：

```text
1,283,989 -> 2,011,909 bytes
```

语音文件独立打包，首次下载略大，但启动解析和运行时资源读取更轻。

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.92.apk` |
| 大小 | 2,011,909 字节 |
| SHA256 | `600C88E33141C2BC957EFA97AEB8F1C518679F2A2553C8BB853A9C17503B8A2D` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.92 / code 93；
- `/play` 200，Brotli 248KB；
- `/voice` 200；
- `/admin` 200。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.92-20261025-144050.tgz
sha256 0c0d00273fb9b9768af0796f39a67b1db97c10f840b35b3e1a6d6427423fb548
```
