# 德扑之夜 1.1.14 发布记录

- **发布日期**：2026-10-27 19:13（CST）
- **版本**：1.1.14（versionCode 121）
- **生产地址**：http://192.144.159.220:8080
- **性质**：播报恢复1.0原速保持音色；结算页面与结算语音同步出现

## 修复

### 音色/加速

- 删除所有大于1.0的playbackRate；
- 不再用倍率预算压缩1.2/1.3秒；
- 名称、操作、数字全部原速；
- 保留静音裁剪和顺序队列。

### 结算播报

- 结算TTS音频后台预载；
- 音频真正准备好、即将播放时回调展开结算页；
- 页面展开与语音开始同一时刻；
- TTS失败/无语音时3.5秒兜底展开；
- 下一局仍会切断未播结算。

## 实测

```text
单机 AI：
  所有播放 rate=1
  pageerror=0

结算同步：
  loaded       at 4263ms
  page-reveal  at 4267ms
  play         at 4267ms
  diff=0ms
```

证据：
- `docs/requirements/2026-10-27-settlement-sync-voice-timbre/evidence/ai-rate.txt`
- `docs/requirements/2026-10-27-settlement-sync-voice-timbre/evidence/settlement-sync.json`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.14.apk` |
| 大小 | 4,786,310 字节 |
| SHA256 | `948CA55936C56C631C66D118FB36EF47DA486DF149C890065F883607478701B4` |
| versionCode | 121 |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.14 / 121
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.14-20261027-191158.tgz
sha256 aeebfc9ec271bd708cd16e0fe2999fd07019f32b7b7f72701e304c121ffc4f22
```

## 风险/边界

- 原速下长句可能超过此前1.2/1.3秒目标；
- 结算页面首次TTS需等约2秒，页面与声音一起出现；
- 真机听感未验证；
- TTS网络失败时最多3.5秒兜底。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.14.apk
- 测试报告：docs/requirements/2026-10-27-settlement-sync-voice-timbre/03-测试报告.md
- 验收报告：docs/requirements/2026-10-27-settlement-sync-voice-timbre/04-验收报告.md
