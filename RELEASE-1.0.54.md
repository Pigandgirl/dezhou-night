# 德扑之夜 1.0.54 发布记录

- **发布日期**：2026-10-24 16:37（CST）
- **版本**：1.0.54（versionCode 55）
- **生产地址**：http://192.144.159.220:8080
- **状态**：已部署

## 问题

玩家先在线匹配/好友房打牌，退回大厅后进入单机，打到第二手时突然被拉回之前的在线房间。

## 根因

1. 从在线牌桌返回大厅时，只执行了单机/场景层面的 `returnToLobby`，没有彻底离开在线房间；
2. 在线房间的 SSE 仍然连接；
3. 旧房间下一次 `started` / `state` / `players` 事件到达时，HUD 没有模式检查；
4. `handleOnlineStarted()` 直接重新进入旧在线牌桌；
5. 排队中的旧 SSE 事件在 `leave()` 后仍可能被派发。

## 修复

### 切换单机时彻底断开在线

- 点击单机开始前执行：
  - 离开在线房间；
  - 关闭 EventSource；
  - 清空在线房间/玩家/状态；
  - 停止在线计时器；
  - 设置 `online3d.active = false`；
- 离线请求在后台完成，不影响单机立即开始。

### 在线事件模式隔离

单机模式下，以下事件全部丢弃：

- `started`
- `state`
- `players` 触发的开局
- `direct`
- `gameover`
- `closed`
- `evicted`
- `host`
- `notice` / `actionError`

单机进行中，旧在线房间的事件无法再切换场景、改底牌、隐藏 HUD 或弹房间提示。

### SSE 离房后丢弃

`OnlineService.emit()` 增加：

```js
if (type !== 'left' && !this.room) return;
```

房间置空后，浏览器已排队的旧 SSE 事件不会继续派发。

### SSE 连接代际隔离

每个 EventSource 绑定当前 `es` 实例和房间号：

- 旧连接排队的 `started` / `state` / `players` 事件直接丢弃；
- 切换房间时不会把旧房间的牌局状态套到新房间；
- 好友房、在线匹配、单机之间不会再互相跳转。

### 离房请求竞态

`leave()` 记录正在离开的房间号，请求完成时如果用户已经进入新房间，不再发送 `left` 把新房间关掉。

### 返回大厅

- 在线设置里的「返回大厅」现在会：
  - 关闭在线牌桌；
  - 离开在线房间；
  - 再返回大厅；
- 后续点击单机不会残留旧房间。

## 验证

在线好友房 → 返回大厅 → 单机：

```text
online room: null
online3d.active: false
single running: true
mode: single
```

单机中手动注入旧事件：

```text
started / players / state
active: false
running: true
在线 HUD 未接管
```

在线牌桌直接切单机：

```text
switched:
  room: null
  active: false
  running: true
  mode: single

stale:
  active: false
  running: true
```

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.54.apk` |
| 大小 | 321,429 字节 |
| SHA256 | `9A92AAC8EF7AABEE197BD39FA1AD2390F01F356B506B3F1BC886D36A4B94166A` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.54 / code 54；
- `/play` 200；
- systemd active。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.54-20261024-163710.tgz
sha256 a1ccfee3e82409bb86900b6811b4ef0010d100d718bdaa0ed8ce6a583395836d
```
