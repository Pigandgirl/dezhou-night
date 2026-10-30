# 德扑之夜 1.0.103 发布记录

- **发布日期**：2026-10-25 22:37（CST）
- **版本**：1.0.103（versionCode 104）
- **生产地址**：http://192.144.159.220:8080

## 单一播报音色

之前：

- 中文动作走预录音频包；
- 英文动作走系统默认 TTS；
- 导致一场牌桌两个女播报员。

现在：

- 中文/英文动作统一走 `speakSystemText`；
- 使用用户当前选择的同一个 TTS 音色；
- 不再为动作播放预录语料；
- 中英文随机选择。

代码验证：

```text
audio.speak(...) 
speakSystemText calls = 1
playVoiceKeys calls = 0
```

## 中央底池

- 底池数字挂到牌桌中央筹码堆上方；
- 标签前缀「底池」；
- 顶部 `.potbox` 隐藏，避免被误认为对手筹码；
- 底池 0 时中央标签隐藏。

验证：

```text
scene.setPot(48)
potStack.labelSprite.visible = true
potStack.amount = 48
.potbox display = none
```

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.103.apk` |
| 大小 | 2,028,293 字节 |
| SHA256 | `686F715C14858B888CE3EE9325EEF18E461B7E40A9C36CCAA6144FEC2EAA7B2E` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.103 / code 104；
- `/play` 200；
- `/admin` 200。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.103-20261025-223627.tgz
sha256 5152be731801d4d1b42136876aaba2cf8912021a58ac299ea0047a28633bdfc0
```

## 遗留

- 真机验证 Android TTS 对英文是否仍自动切换音色；
- Opus/4麦克风/真机后台仍未完成。
