# 德扑之夜 1.0.56 发布记录

- **发布日期**：2026-10-24 17:04（CST）
- **版本**：1.0.56（versionCode 57）
- **生产地址**：http://192.144.159.220:8080
- **状态**：已部署

## 目标

网页、手机端优先流畅和低发热，同时降低运行内存，不再默认开启高成本渲染。

## 画质策略

### 默认中画质

网页和手机默认 `mid`：

- DPR 1.0；
- 无阴影；
- 无 Bloom；
- 无 PMREM 环境贴图；
- 无透射玻璃 Pass；
- 关闭毛玻璃 `backdrop-filter`；
- 手机 30fps，网页 45fps，大厅 24fps；
- 动态掉帧时降低 DPR 到 0.8 / 0.72。

只有显式加 `?quality=high` 才开启阴影、Bloom、环境贴图、高 DPR 和完整装饰。

低端设备自动 `low`：

- DPR 0.8；
- 更低纹理尺寸；
- 2 个大厅陪玩；
- 更少筹码模型。

### 可选档位

```text
/play?quality=low
/play?quality=mid
/play?quality=high
```

## 性能优化内容

### 灯光

- 中/低画质关闭所有壁灯 PointLight、两侧 SpotLight、轮廓光、补光；
- 只保留主灯、半球光、一个便宜的环境补光；
- 灯光数从多盏降到 3 盏。

### 透射

- 玻璃和冰块在高画质才使用 `MeshPhysicalMaterial` + transmission；
- 中/低画质改为普通透明 MeshStandardMaterial；
- 去掉一次额外的场景透射渲染 Pass。

### 角色

- 中/低画质将手、身体、头部再次合批；
- 中画质大厅陪玩从 7 人降到 4 人，低画质降到 2 人；
- 角色 draw call 明显下降。

### 筹码

- 中/低画质筹码改为单材质；
- 同面额筹码可以被 `mergeStaticGroup` 合并；
- 筹码数量上限降低：
  - 中：下注 5 / 底池 8；
  - 低：下注 4 / 底池 6。

### 大厅装饰

- 7 个座位的 14 张装饰牌背合并成 1 个 Mesh；
- 不再每张牌占一个 draw call。

### 纹理

- 中画质纹理尺寸 ×0.75；
- 低画质 ×0.55；
- 覆盖牌面、牌背、台呢、木纹、皮革、地毯、名牌；
- 降低显存和初始 Canvas 生成时间。

### 内存释放

- `PlayerRig.destroy()` 释放全部几何体、材质、名牌和光晕纹理；
- `ChipStack.dispose()` 释放合并筹码几何体和标签材质；
- 不停留在旧牌局资源上。

### 渲染循环

- 页面隐藏时暂停；
- 大厅 24fps；
- 动态降分辨率；
- 中画质关闭 CSS 毛玻璃合成。

## 实测数据

### 优化前（mid 基准）

```text
大厅：
  draw calls 354
  triangles 141,490
  heap ~25.3 MB

牌局：
  draw calls 285
  triangles 93,148
  heap ~25 MB
  DPR 1.0
```

### 优化后默认 mid

```text
大厅：
  draw calls 126   (-64%)
  triangles 55,000 (-61%)
  meshes 111
  heap ~10.1 MB
  textures 24
  lights 3

牌局：
  draw calls 144   (-49%)
  triangles 50,150 (-46%)
  heap ~16.5 MB
  textures 33
  DPR 1.0，压力下自动降到 0.8
```

### 手机 low

```text
draw calls 63
triangles 33,028
heap ~10 MB
DPR 0.8
```

### 连续开局内存稳定性

连续 4 次开局/返回大厅，回收后：

```text
game1 heap 14.92 MB
game2 heap 15.03 MB
game3 heap 15.16 MB
game4 heap 15.22 MB
geometries 156
textures 33
```

资源和纹理数量不增长，没有每局累积泄漏。

## 视觉验证

- 默认 mid 截图确认桌面、人物、底池、下注区正常；
- 中低画质保留主灯和补光，不会黑到看不清；
- 高画质仍可通过参数使用完整装饰。

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.56.apk` |
| 大小 | 321,429 字节 |
| SHA256 | `CC7CAB5AADA52D9DB8E3418B025FB1F03449E91FD147F9C64561A7C09A76B1D3` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.56 / code 57；
- `/play` 200；
- systemd active。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.56-20261024-170443.tgz
sha256 56110e3c094abf7412d957103c4f845ef4ff7a20e996702302563c9c195c67c6
```
