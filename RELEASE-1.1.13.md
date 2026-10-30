# 德扑之夜 1.1.13 发布记录

- **发布日期**：2026-10-27 19:01（CST）
- **版本**：1.1.13（versionCode 120）
- **生产地址**：http://192.144.159.220:8080
- **性质**：结算优先播报、清池留房、语音单说话人/4秒/昵称、麦克风直开与设置入口

## 修复

### 结算优先播报

- `speakSettlementNow()`：结算出现立即停止当前语音、清空未播操作；
- 结算文本直接进入队列；
- 实测：操作播报中触发结算，raise 不再播放，直接念结算。

### 清池留房

- 好友房 `gameover` 不再隐藏牌桌/结算；
- 房间只剩一个“非观战”玩家时不再自动返回大厅；
- 观战玩家不视为离开，保留在房间看结算。

### 语音

- 点击麦克风直接开/关，不再弹语音设置；
- 服务端同一4秒窗口仅允许一个 pid 发送语音；
- 客户端开麦4秒后自动闭麦，要再说需再点；
- 服务端广播 `voice-active`，HUD 显示“昵称 正在说话”；
- 设置页增加“语音设置”入口与“接收房间语音”开关。

## 实测

```text
结算抢占：
  阿凯名称开始
  150ms后 speakSettlementNow
  → 播放“恭喜小明赢得底池100”
  → raise 未继续播放
  queue=0 busy=false
```

完整证据：`docs/requirements/2026-10-27-settlement-voice-room/evidence/settlement-priority.txt`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.13.apk` |
| 大小 | 4,782,214 字节 |
| SHA256 | `D077091DE477A7EB297BFDF94D9936586FD525AD904FCD1781057DF72110C0D2` |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.13 / 120
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.13-20261027-190012.tgz
sha256 6dc8789fe6a5ad7ec5143d073c1b7b733a9f40f0780a6d734164a5a0937a776f
```

## 风险/未验证

- 清池留房未做真实5人全下牌局实测；
- 语音单说话人未做双客户端实测；
- 4秒自动闭麦未真机计时；
- “语音设置”目前是设置页入口，不是独立标签页；
- 无真机麦克风/扬声器听感。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.13.apk
- 测试报告：docs/requirements/2026-10-27-settlement-voice-room/03-测试报告.md
- 验收报告：docs/requirements/2026-10-27-settlement-voice-room/04-验收报告.md
