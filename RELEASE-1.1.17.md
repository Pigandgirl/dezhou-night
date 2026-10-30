# 德扑之夜 1.1.17 发布记录

- **发布日期**：2026-10-27 20:43（CST）
- **版本**：1.1.17（versionCode 124）
- **生产地址**：http://192.144.159.220:8080
- **性质**：人物头部跟随视角；结算赢家/输家捶胸顿足动作

## 新增

### 头部跟随

- 每帧计算头部到摄像机的水平夹角；
- 头部左右平滑转向，限幅±0.7弧度；
- 保留呼吸、眨眼、待机小幅摆动。

### 结算动作

- 结算时对手显示额外拳头/手臂与脚部动画层；
- 捶胸 + 跺脚约1.5秒；
- 赢家：抬头、身体上弹；
- 输家：低头、身体下沉；
- 在线/单机结算都触发；
- 动作结束后隐藏并复位。

保留1.1.16的独立服装、下半身和完整椅子。

## 实测

```text
headYaw: -0.678 → -0.692（相机移动后）
reactionActive = true
arms.visible = [true,true]
feet.visible = [true,true]
pageerror = 0
```

证据：`docs/requirements/2026-10-27-head-look-settlement-reactions/evidence/head-look-reaction.png`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.17.apk` |
| 大小 | 4,786,310 字节 |
| SHA256 | `F7EF276D9655A42F79976E8113C963778F1CE2A5AC50D1EC7E01E40BF557E00A` |
| versionCode | 124 |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.17 / 124
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.17-20261027-204204.tgz
sha256 141cee9f4db72508d4e9bc7b82a2fae571773da33b675ba796e72168a1178a34
```

## 风险/边界

- 未在真实完整结算流程中等待动画播完；
- 覆盖式手势层，不是骨骼IK；
- 未真机验证自然度和帧率；
- 未测在线8人逐人动作。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.17.apk
- 测试报告：docs/requirements/2026-10-27-head-look-settlement-reactions/03-测试报告.md
- 验收报告：docs/requirements/2026-10-27-head-look-settlement-reactions/04-验收报告.md
