# 德扑之夜 1.0.71 发布记录

- **发布日期**：2026-10-24 21:07（CST）
- **版本**：1.0.71（versionCode 72）
- **生产地址**：http://192.144.159.220:8080
- **状态**：已部署

## 问题根因

之前并没有真正存储播报员声音。

旧实现是：

```text
选择音色
  -> 修改 pitch / rate
  -> 调用 Android 系统 TextToSpeech
  -> 系统只有一个中文女声
```

问题：

- Android 中文 TTS 通常只预装一个女声；
- 没有男声时，代码只能给同一个女声降低音调；
- 降调的女声仍然是女声，不会变成男声；
- 甜系、清亮、御姐等只是改 pitch / rate，基础发音人还是同一个；
- 设置页打开时没有把已保存的音色同步到下拉框，看起来更像“按钮没生效”。

## 修复

不再依赖系统 TTS 播报牌局动作。

内置 8 套离线播报音色，每套 24 段真实录音，共 192 段 MP3：

| 音色 | 基础发音人 |
|---|---|
| 女声 · 温柔 | Xiaoxiao |
| 女声 · 清亮 | Xiaoyi |
| 女声 · 甜系 | Xiaoyi（更高更甜） |
| 女声 · 御姐 | Xiaoxiao（更低更稳） |
| 男声 · 沉稳 | Yunyang（低音） |
| 男声 · 磁性 | Yunxi |
| 男声 · 清朗 | Yunyang |
| 男声 · 大叔 | Yunjian（更低更慢） |

录音内容：

- 过牌、跟注、下注、加注到、全下、弃牌、摊牌、赢得、底池；
- 零到九、十、百、千、万；
- 每套音色的试听句子。

牌局播报改为：

```text
动作录音 + 金额数字录音
```

例如：

```text
加注到 + 一 + 百 + 五 + 十
```

不再走系统女声，不再只做 pitch 调整。

## 设置页修复

- 打开设置时，下拉框会同步当前已保存音色；
- 切换音色后立即播放该音色的试听句；
- 试听按钮也改为播放对应音色包；
- Web / Android 都使用同一套内置音频。

## 实测

```text
male_deep:
  voiceBuffers = 24
  audioContext = running
  playVoiceKeys('check') → 1 个音源启动

female_sweet:
  voiceBuffers = 24
  audioContext = running
  playVoiceKeys('check') → 1 个音源启动

生产环境 /play:
  male_deep 加载 24 段
  female_sweet 加载 24 段
  两套音色均成功解码并播放
```

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.71.apk` |
| 大小 | 1,263,509 字节 |
| SHA256 | `66B650D186FC684C0152CE0E488DDA5887F8479635C9E221514FE8666D4DD9F9` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.71 / code 72；
- `/play` 200；
- `/admin` 200；
- systemd active。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.71-20261024-210653.tgz
sha256 401eb46766abfee499984d058da84a8c0582693a6e3b981b8158c616e9e11f31
```
