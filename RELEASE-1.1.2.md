# 德扑之夜 1.1.2 发布记录

- **发布日期**：2026-10-26 13:40（CST）
- **版本**：1.1.2（versionCode 108）
- **生产地址**：http://192.144.159.220:8080
- **性质**：游戏播报音色修复

## 问题

1.0.103 为统一中英文，把动作播报改为系统 TTS，导致设置中选择的音色不再用于游戏播报。

补充根因：

- 8 套离线音色包没有被动作播报使用；
- 新增英文文件 `en_*.mp3` 被 `/voice` 路由正则拒绝，返回 404；
- 系统 TTS 只会按性别挑一个音色，再改 pitch/rate，多个女声听起来相同。

## 修复

- 游戏动作播报优先读取当前 `voiceProfile` 的离线音色包；
- 中文/英文均从同一个 profile 的音色包播放；
- 为 8 套音色各新增 39 段英文动作/数字音频；
- 英文金额完整覆盖 one~nineteen、twenty~ninety、hundred、thousand；
- `/voice` 路由允许 `en_*.mp3`；
- TTS 仅在音色包失败时 fallback；
- TTS fallback 按 profile 选基础发音人；
- Android 每次 speak 前重新应用当前 voiceProfile。

## 实测

```text
male_deep: 63 clips, en=39
female_bright: 63 clips, en=39
英文 speak('raise',150):
  ['en_raise','en_one','en_hundred','en_fifty']
  TTS调用 = 0
中文 speak('raise',150):
  ['raise','one','hundred','five','ten']
  TTS调用 = 0
生产 /voice/male_deep/en_check.mp3 = 200
生产页面 voiceBuffers=63, en=39, pageerror=0
```

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.2.apk` |
| 大小 | 4,774,022 字节 |
| SHA256 | `3C3A0E7BF3B384274A049E05E28DD167B108E287A27DF2CC79ABA7F6A36D8170` |
| 英文音频 | 312 段（8×39） |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.2 / 108
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.2-20261026-133730.tgz
sha256 157429cfdffa86679063d24b83342a9ee72f34b75113d8e89716adf9c784b700
```

## 风险

- 真机音色主观听感未验证；
- 英文由中文基础发音人朗读，可能带轻微口音；
- 首次加载 63 段音频可能有短暂延迟；
- 同性别音色仍可能相近。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.2.apk
- 测试报告：docs/requirements/2026-10-26-voice-profile-fix/03-测试报告.md
- 验收报告：docs/requirements/2026-10-26-voice-profile-fix/04-验收报告.md
