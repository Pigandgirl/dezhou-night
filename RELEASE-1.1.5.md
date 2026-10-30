# 德扑之夜 1.1.5 发布记录

- **发布日期**：2026-10-26 21:02（CST）
- **版本**：1.1.5（versionCode 111）
- **生产地址**：http://192.144.159.220:8080
- **性质**：称呼和动作统一音色

## 问题

1.1.4 称呼走系统 TTS、动作走离线音色包，导致同一句播报出现两个不同音色。

## 修复

- 新增 `/api/voice/name`；
- 服务端用与音色包相同 Edge 基础发音人生成称呼音频；
- 8 套 profile 各自固定 base voice/rate/pitch；
- profile+name 缓存；
- 客户端预取称呼；
- 先播放称呼音频，结束后播放同 profile 动作包；
- 正常路径不调用系统 TTS；
- 失败时才回退 TTS。

## 实测

```text
生产 /api/voice/name?profile=male_deep&name=阿凯
first = 200, 7344 bytes, 2.30s
cached = 200, 0.08s

客户端：
name duration = 1.224s
speak('raise',150,'阿凯')
TTS调用 = 0
keys = ['en_raise','en_one','en_hundred','en_fifty']
profile = male_deep
pageerror = 0
```

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.5.apk` |
| 大小 | 4,774,022 字节 |
| SHA256 | `B25E9E4C359F67A630B6B648E329019254DE87FF482425A1F10CC85C0DC1134B` |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.5 / 111
/play = 200
/admin = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.5-20261026-210102.tgz
sha256 9f0545c70c178abecdce0ec9afbe4529cc5612be621ee8d84cb197187e54c921
```

## 风险

- 服务端 TTS 首次生成 2-5 秒，已用预取/缓存；
- TTS 网络不可用时回退系统 TTS，仍可能出现两个音色；
- 真机听感未验收。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.5.apk
- 测试报告：docs/requirements/2026-10-26-voice-same-timbre/03-测试报告.md
- 验收报告：docs/requirements/2026-10-26-voice-same-timbre/04-验收报告.md
