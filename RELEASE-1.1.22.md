# 德扑之夜 1.1.22 发布记录

- **发布日期**：2026-10-28 09:57（CST）
- **版本**：1.1.22（versionCode 129）
- **生产地址**：http://192.144.159.220:8080
- **性质**：恢复第一人称设置；修复第三人座位镜头镜像；1–8人模型一一对应

## 修复

### 视角设置

设置页新增“游戏视角”：

- 第一人称（默认）：隐藏自己的模型，zoom=1；
- 第三人称：显示自己的模型，抬高镜头，2/3人zoom2.2、4人2.0、5–8人1.8。

### 第三人镜头跑位

原相机旋转：

```js
seatAngle(index,n) - Math.PI/2
```

与座位坐标方向相反，导致第三人玩家镜头镜像到8号位。
改为：

```js
Math.PI/2 - seatAngle(index,n)
```

第三人seatNo=1时，相机已回到1号位外侧。

### 每个玩家模型

- 包括自己在内每人一个PlayerRig；
- 每人有椅子、下半身、牌位；
- 固定seatNo：`0,4,1,2,3,5,6,7`；
- 2–8人 `rigs=人数`；
- 1人按规则等待开局。

### 语音

- 取消5秒自动闭麦；
- 点击开启后持续说话，再点关闭；
- 关闭只提示“语音已关闭”。

## 实测

```text
第一人称：hero visible=false zoom=1
第三人称第三人：heroDisplay=1，camera位于1号位外侧
2–8人：seats=rigs，全部true
pageerror=0
```

截图：`docs/requirements/2026-10-28-view-modes-seat-camera/evidence/online-1-to-8-grid.jpg`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.22.apk` |
| 大小 | 4,786,310 字节 |
| SHA256 | `2C16038C0EE5C9D36B62C9C5508550C8C6DD17851A477593FFF3288ABA30A136` |
| versionCode | 129 |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.22 / 129
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.22-20261028-095723.tgz
sha256 bd5d25d6d8b4414a103bdaab109bde5f869eb2098ead43d5bb7db01d7bc89cdf
```

## 风险

- 1人不能开局；
- 真机语音/低端性能未验证；
- 截图为网页版。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.22.apk
- 测试报告：docs/requirements/2026-10-28-view-modes-seat-camera/03-测试报告.md
- 验收报告：docs/requirements/2026-10-28-view-modes-seat-camera/04-验收报告.md
