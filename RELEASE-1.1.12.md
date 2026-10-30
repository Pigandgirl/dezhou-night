# 德扑之夜 1.1.12 发布记录

- **发布日期**：2026-10-27 18:55（CST）
- **版本**：1.1.12（versionCode 119）
- **生产地址**：http://192.144.159.220:8080
- **性质**：取消全局播报加速，增加1.2/1.3秒硬预算，名称后0停顿接操作

## 修复

- 删除队列级1.8/2.1/2.3/2.5倍加速；
- 保留首尾静音裁剪；
- 每条播报先计算“名称+操作+数字”裁剪后时长：
  - 带数字硬预算1.3秒；
  - 不带数字硬预算1.2秒；
- 未超预算保持原速；
- 超预算只对该条播报做最小必要收紧；
- 名称结束立即开始操作，中间0等待；
- 保留结算切断、顺序队列。

## 实测

```text
阿凯+call+20：
  总时长 1.256s
  名称结束 = 操作开始

小明+fold：
  总时长 1.061s
  名称结束 = 操作开始

pageerror=0
```

完整数据：`docs/requirements/2026-10-27-voice-budget-caps/evidence/budget.json`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.12.apk` |
| 大小 | 4,782,214 字节 |
| SHA256 | `AAFCCC937ABCDECD1994F6B89C343BC7F6C203E94896A2454FFCAD132963CDCC` |
| versionCode | 119 |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.12 / 119
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.12-final-20261027-185338.tgz
sha256 48d00526d53b097da3c6af343452b90ca4d62d7af3f7b1d4f4cfb43484320a4c
```

## 风险

- 两个实测样本均触发超预算收紧，实际不完全原速；
- 硬上限与完全原速不可兼得；
- 真机调度抖动可能让边界样本略超；
- 未真机听感验证。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.12.apk
- 测试报告：docs/requirements/2026-10-27-voice-budget-caps/03-测试报告.md
- 验收报告：docs/requirements/2026-10-27-voice-budget-caps/04-验收报告.md
