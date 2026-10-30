# 德扑之夜 1.0.96 发布记录

- **发布日期**：2026-10-25 16:52（CST）
- **版本**：1.0.96（versionCode 97）
- **生产地址**：http://192.144.159.220:8080

## 修复跨手牌面残留

根因：

- `scene.clearCards()` 只删除已经登记在 `holeCards` / `boardCards` 的牌；
- 发牌/翻牌/结算动画中尚未登记的牌会被漏掉；
- `updateBoard()` 在公共牌清空或变少时没有主动撤掉旧公共牌；
- 结算异步回调没有检查当前 hand，旧动画可能落到新一手。

修复：

1. 新增 `CardManager.clearAll()`，遍历 3D 场景删除所有卡牌组；
2. `scene.clearCards()` 改为 clearAll，并清空 hole/board 索引；
3. 新增 `scene.clearBoardCards()`；
4. `updateBoard()` 在 board 为空/变短时清掉旧公共牌；
5. showdown 回调增加 `currentHand` 检查，旧 hand 不再操作新牌桌；
6. 每手 `setupHand()` 继续先清桌再发牌。

实测：

```text
手动向场景加入一张未登记旧牌：1
scene.clearCards()：0
```

## 牌面清晰度

- DPR：
  - low：0.8 → 1.0
  - mid：1.0 → 1.25
  - high：1.4 → 1.6
- 牌面纹理最小缩放：0.9；
- 牌面纹理 anisotropy：16；
- 牌面纹理宽度：288px（mid）。

实测：

```text
renderDpr = 1.25
devicePixelRatio = 2
anisotropy = 16
textureWidth = 288
```

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.96.apk` |
| 大小 | 2,020,101 字节 |
| SHA256 | `13801A3509973C53445B7B369AE5CA45709B77EB11E84F3D69BA99F0D6B57F56` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.96 / code 97；
- `/play` 200；
- 牌面清理代码已打包。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.96-20261025-165131.tgz
sha256 d36ed0db42882e1323e6fa18b3622e8ac55ca44825fb393d0dd88e134d870814
```
