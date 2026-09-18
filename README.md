# 想我了吧

一个温柔的自用情感支持小应用：**今天的状态 → 一句话 → 记录下来**，
每天随机几次在合适的时间给你发一句本地语料库里的关心，全部数据都在自己手机里，离线可用。

- 网页版：本地跑 `node scripts/serve.js`，手机和电脑连同一个 Wi-Fi 打开
- 页面自检：本地打开 `mood.html?selftest=1`
- 安卓版：用 GitHub Actions 打 APK，或本地 `npm run apk`
- 本仓库是私有仓库，不启用 GitHub Pages，所以没有在线预览地址

## 功能

| 模块 | 说明 |
| --- | --- |
| 今天 | 一句问候 + 心情打卡（五种心情）+ 近期状态热力条 + 周期统计 |
| 打卡 | 选心情、选标签、写一句今天的事；同一小时连续打卡会提示 |
| 句子 | 36 条内置语料（安慰 / 鼓励 / 夸奖 / 陪伴 各 9 条），可收藏、可自建、可导入导出 |
| 设置 | 每天条数、时间段、安静时段、暂停、语料管理、JSON 导入导出、清空数据 |
| 定时提醒 | 预生成未来几天的提醒内容，网页靠页面内提醒，安卓交给系统本地通知 |

## 本地跑

```bash
node scripts/serve.js          # http://localhost:8080/mood.html
```

手机和电脑连同一个 Wi-Fi，用电脑的局域网 IP 打开（脚本启动时会打印出来）。

## 自检与测试

```bash
npm test        # = node scripts/check.js && node scripts/selftest.js
```

- `scripts/check.js`：把 `mood.html` 里每个 `<script>` 块单独抽出来做语法检查，并核对 JS 引用的 id 都真实存在。
- `scripts/selftest.js`：抽取页面里 `/* ==== PURE_ENGINE_START/END ==== */` 之间的纯逻辑，在 Node 里跑 34 项断言（语料合法性、时间换算、安静时段跨零点、选句权重与 7 天冷却、排程数量/升序/不重复/避开安静时段）。
- 浏览器里打开 `mood.html?selftest=1` 可以看同一套逻辑在真实运行环境的自检结果。

## 打安卓包

```bash
npm install
npm run cap:sync      # 组装 www/ 并同步进 android/
npm run apk           # 本地出 debug APK（需 JDK 21 + Android SDK）
```

不想装环境就用 GitHub Actions：仓库里 `.github/workflows/android.yml`，在 Actions 页手动点 **Run workflow**，跑完在 Artifacts 里下载 `xwlb-debug-apk`。

生成的 `android/`、`www/`、`node_modules/` 都不入库（见 `.gitignore`），Android 原生需要的权限和应用名由 `scripts/patch-android.js` 在打包流程里自动补上：

```
POST_NOTIFICATIONS / SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM
VIBRATE / RECEIVE_BOOT_COMPLETED / WAKE_LOCK / REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
```

装好后第一次打开建议：允许通知 → 允许「闹钟和提醒」→ 在系统电池设置里把本应用设为「不受限制」，这样重装/重启后提醒才不会丢。

## 关于定时发送（重要）

纯网页在后台无法自己醒来发通知，所以方案是**提前把内容和时间都算好**：

1. 网页端生成未来 2 天、安卓端生成未来 4 天的提醒计划（`buildPlan`），每条都带好那一句文案；
2. 安卓把计划整批写进系统的本地通知（`AlarmManager`，`allowWhileIdle`），到点由系统弹出，**不依赖 App 活着**；
3. 网页端退化为「页面打开时到点提醒 + Web Notification」；
4. 每次打开应用都会重新排程，顺便把过期的提醒清掉。

所有数据存在 `localStorage` 的 `xwlb.v1` 键里，换手机用「设置 → 导出 JSON」搬过去即可。