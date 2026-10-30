# 德扑之夜 1.0.41 发布记录

- **发布日期**：2026-10-24 14:14（CST）
- **版本**：1.0.41（versionCode 42）
- **生产地址**：http://192.144.159.220:8080
- **状态**：已部署并验证

## 问题

在线匹配双人结算页面显示“已准备 2/1”，双方都点“继续下一把”却没有开下一手。

## 原因

`nextReadyCandidates()` 原来要求：

```js
roomPlayer.online === true
```

但 `nextReady` 中已经记录了双方。如果其中一方在结算页时 SSE 瞬断/切后台/网络抖动：

- 服务端一边保留两人的“已准备”；
- 候选人数却被算成 1；
- `allReady` 永远不成立；
- 回正/重连后也没有重新检查，于是一直卡到 60 秒定时器。

## 修复

1. **已准备玩家不再因 SSE 瞬断从候选里消失**；
2. **双方都已准备立即发牌**，不再等待；
3. 下一手开始时允许“已准备但暂时离线”的玩家进入牌桌；
4. SSE 重连时再次执行 `checkNextReady()`；
5. 观战/0 筹码玩家不再显示可点“继续下一把”。

## 验证

- 正常双方准备 → 下一手立即开始（hand 1 → hand 2）；
- 模拟一方准备后 SSE 断开，另一方再准备：
  - 旧逻辑会停在 `settle`；
  - 新逻辑立即进入 `play`，下一手 2 人开局；
- 单测结果：
  - readyA `started:false`
  - A offline
  - readyB `started:true`
  - phase `play`，players `2`，hand `2`
- 回归测试 `ONLINE 3D OK`，无 JS 错误。

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.41.apk` |
| 大小 | 309,141 字节 |
| SHA256 | `7202AE1AF7327838F1D69098ACA9EDCBFCB60AF7B378FCA139B3E3914FF73B9E` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.41 / code 42；
- `/play` 200；
- systemd active。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.41-20261024-141418.tgz
sha256 a98c621f4e79abe496672c3fe19bc5cb65d65a3fe07bcde31c98d013e5f30acc
```
