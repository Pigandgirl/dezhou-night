# 德扑之夜 1.0.52 发布记录

- **发布日期**：2026-10-24 16:27（CST）
- **版本**：1.0.52（versionCode 53）
- **生产地址**：http://192.144.159.220:8080
- **状态**：已部署

## 问题

每一局开局、翻牌前，台面/HUD 都显示 5 张公共牌背面，像已经发了公共牌。

## 根因

公共牌 HUD 的渲染函数固定循环 5 次：

```js
for (let i = 0; i < 5; i += 1) {
  tiles.push(cardTile(boardCards[i], true));
}
```

当 `boardCards` 为空时，`cardTile(undefined, true)` 仍会生成 5 张背面牌。因此：

- 翻牌前显示 5 张背面；
- 翻牌后显示 3 张真牌 + 2 张背面；
- 每局开始都会重新出现。

## 修复

- 翻牌前：`boardRail` 整个隐藏，牌面数量为 0；
- 翻牌后：只渲染已经发出的牌：
  - 翻牌 3 张；
  - 转牌 4 张；
  - 河牌 5 张；
- 不再渲染任何未来公共牌的背面占位；
- 初始 HTML 也默认隐藏，避免进桌瞬间闪出 5 张背面；
- 下一局开始调用 `setBoardCards([])` 后立即隐藏。

## 验证

翻牌前：

```text
boardRail hidden: true
boardRailCards children: 0
boardStreet: 翻牌前
hud.boardCards: 0
scene.boardCards: 0
```

发 3 张翻牌后：

```text
boardRail hidden: false
boardRailCards children: 3
boardStreet: 翻牌
```

实际 UI 截图确认翻牌前桌面无 5 张公共牌占位。

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.52.apk` |
| 大小 | 321,429 字节 |
| SHA256 | `F841D43A04B2D0CF9C490012F632E437134BF7F5E6D44237CC30FE1671D27D3C` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.52 / code 53；
- `/play` 200；
- systemd active。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.52-20261024-162734.tgz
sha256 c622318a2b4facdfaa2a2916e3604278bf2761565983251db831f1fb4dfc35e6
```
