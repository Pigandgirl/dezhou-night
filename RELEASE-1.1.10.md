# 德扑之夜 1.1.10 发布记录

- **发布日期**：2026-10-27 00:10（CST）
- **版本**：1.1.10（versionCode 116）
- **生产地址**：http://192.144.159.220:8080
- **性质**：底牌向上折叠、播报同步提速、结算播报提前/可切断、竖屏横屏提示

## 修复

### 底牌收起方向
- 面板改为向上折叠隐藏；
- 顶部出现横向“底牌”按钮；
- 不再向左侧缩成竖条；
- 修复滑动切牌 `pointer capture` 吞掉收起按钮点击的问题。

### 播报同步
- 名称后立即接操作，无额外间隔；
- 积压最高2.5倍速；
- 无积压1.12，1/2/3/4+条1.8/2.1/2.3/2.5；
- 严格按序，不丢上一位。

### 结算播报
- 在结算UI渲染前入队，不再延迟450ms；
- 文本包含“恭喜+赢家+牌型+底池”；
- 玩家进入下一局/单机新一手时调用 `cancelSettlement()`，未播完的结算文本立即切断；
- 已开始的结算语音也会停止。

### 竖屏提示
- 竖屏显示“建议横屏游玩 · 横屏牌桌信息更完整，体验更佳”；
- APK 已 `sensorLandscape`；
- 浏览器尝试横屏锁定，不支持时保留提示。

## 实测

```text
card: class=collapsed opacity=0；顶部按钮 x280 y0 w58 h23
queue: 阿凯(2.30)→raise；小明(2.10)→call；小红(1.80)→check
cancel: settlement未播，后续动作保留
portrait hint: display=flex, x61 y52 w268 h30
pageerror=0
```

截图：
- `docs/requirements/2026-10-27-card-fold-voice-settlement/evidence/card-up-collapse.png`
- `docs/requirements/2026-10-27-card-fold-voice-settlement/evidence/portrait-hint.png`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.10.apk` |
| 大小 | 4,778,118 字节 |
| SHA256 | `870262923E8A7F81237B96434F9FB9F3406694445EB7B43ADB2896F556D92B1C` |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.10 / 116
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.10-20261027-001016.tgz
sha256 92ff191b29f45a42d0640ab4c5e147b8486b185d785274030f5ad583b1f59fb4
```

## 风险

- 2.5倍速可能音调偏高；
- 服务端TTS首句仍有约2秒生成；
- 浏览器横屏锁定不一定支持；
- 真机听感未验证。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.10.apk
- 测试报告：docs/requirements/2026-10-27-card-fold-voice-settlement/03-测试报告.md
- 验收报告：docs/requirements/2026-10-27-card-fold-voice-settlement/04-验收报告.md
