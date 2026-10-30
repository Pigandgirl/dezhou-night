# 德扑之夜 1.0.86 发布记录

- **发布日期**：2026-10-25 13:22（CST）
- **版本**：1.0.86（versionCode 87）
- **生产地址**：http://192.144.159.220:8080

## 新增麦克风测试

在线牌桌顶部新增「语音设置」按钮，打开后可以：

- 开始/停止麦克风测试；
- 实时查看输入电平；
- 看到「麦克风正常，正在收音」「没有检测到清晰人声」「权限失败」等状态；
- 测试时顶部麦克风图标随音量放大。

测试只在本机检测；如果没有开启房间语音，不会把测试声音发给其他玩家。

## 麦克风电平图标

- 麦克风按钮增加音量环；
- 说话时图标放大、边框发光；
- 无声时自动衰减；
- 语音面板中自己的电平和每个玩家的说话电平同步显示。

## 修复：手机说话，网页没声音

根因：

```js
if (!this.enabled) return;
```

旧代码把“自己是否开麦”当作“能否听别人”的条件。网页端无法开麦时，远端 PCM 直接被丢弃。

同时旧代码关闭麦克风会挂起 AudioContext，播放也被停止。

修复：

- 听和说完全分离；
- 不开麦也能默认收听所有人；
- 关闭麦克风只停止上传，不停止播放；
- AudioContext 被浏览器挂起时提示“点击屏幕任意位置开启语音播放”；
- 面板显示上传包数 / 接收包数，方便定位。

## 逐人禁音与只听一人

语音面板列出房间玩家，默认全部可听：

- 每个远程玩家：`禁音` / `取消禁音`；
- 每个远程玩家：`只听` / `取消只听`；
- 同一时间只能 solo 一人；
- 全部静音 / 恢复全部；
- 禁音和 solo 只影响本机，不通知对方；
- 刷新页面后恢复默认全部可听。

## 实测

未开麦接收：

```text
enabled=false
listening=true
packetsReceived=1
audioContext=running
```

禁音/只听：

```text
before=true
mute=false
solo=true
unsolo=false
unmute=true
allMuted=false
restore=true
```

麦克风测试：

```text
testing=true
status=麦克风正常，正在收音
button=停止测试
```

端到端：

```text
发送端 sent=26, lastLevel=0.0307
接收端 enabled=false, listening=true, received=25, level=0.954
```

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.86.apk` |
| 大小 | 1,283,989 字节 |
| SHA256 | `94AD1C308C4F0D1058D8F8551E993DA4F051A589040D18F550441FAF5974AC78` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.86 / code 87；
- `/play` 200；
- `/admin` 200。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.86-20261025-132152.tgz
sha256 89bffc96b14b642531438b5ffe0e710abc50ce5b088504b6d411dba2b82ebeeb
```
