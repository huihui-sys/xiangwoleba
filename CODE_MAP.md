# 代码地图 · CODE_MAP

> 给「改这个项目的人 / AI」看的索引。**先读这一页 + 目标区域，不要全文通读 `mood.html`（3262 行 / 181 KB）。**
> 行号基于 v1.5.0，只作参考；真正稳定的定位物是下面那些**注释锚点**。大改动后请顺手更新第 2 节的行号。

## 1. 仓库结构

| 路径 | 作用 |
|---|---|
| `mood.html` | **唯一源文件**：整个 App（HTML + CSS + JS 一体），双击就能在浏览器里跑 |
| `manifest.webmanifest` / `icon.svg` / `sw.js` | PWA 附属（图标、离线壳） |
| `capacitor.config.json` | Capacitor 配置（`webDir = www`） |
| `scripts/check.js` | 语法检查 + id 引用 + 版本号一致 + 静态守卫 / 禁止旧写法 |
| `scripts/selftest.js` | 抽纯逻辑区到 Node 跑断言（与浏览器 `?selftest=1` 同一套代码） |
| `scripts/smoke-notify.js` | 抽真实排程 / 统计柱代码，配假闹钟 + 假 DOM 跑冒烟 |
| `scripts/smoke-backfill.js` | 抽真实补记 / 本月格子代码，配假 DOM 跑冒烟（v1.5.0 新增） |
| `scripts/check-android-patch.js` | 伪造 `android/` 工程，验证 `patch-android.js` 行为 |
| `scripts/patch-android.js` | 打包前改安卓工程：权限、应用名、固定签名、版本号 |
| `scripts/build-www.js` | 组装 `www/`（固定 4 个文件 + `index.html` 副本），并注入构建号 |
| `scripts/serve.js` | 本地静态服务器（`npm run serve`） |
| `.github/workflows/android.yml` | 动到 `mood.html` / `scripts/**` / `package.json` / 本配置时，push 到 main（或手动 Run workflow）即跑 `npm test` → 打 APK → 发 Release（tag = package.json version） |
| `www/`、`android/` | 生成物，`.gitignore` 里，不入库 |

## 2. `mood.html` 分区（行号 = v1.5.0）

| 行号 | 区段 | 内容 |
|---|---|---|
| 1–12 | `<head>` | meta / 主题色 / manifest |
| 13–31 | 首屏防闪 `<script>` | 渲染前定好 `data-theme`（独立 script 块） |
| 32–390 | `<style>` | 主题变量 `--bg/--fg/--accent`；`.card`；`.bars` 统计柱（含 `.track`）；`.grid7` 月历格子 352–373；`body::before` 点阵纹理 375；`.floats` 角落 emoji 380 |
| 403–649 | HTML 视图 | `#view-today`(404)、`#view-checkin`(443)、`#view-sentences`(493)、`#view-settings`(521)；底部 tab 636；共用遮罩 `#sheetMask`/`#sheetBody`(642)、`#toast`(643)、`#banner`(644)、`#selftest`(649) |
| 650–1351 | `<script>` ① 纯逻辑区 | `PURE_ENGINE_START`(651) … `PURE_ENGINE_END`(1350)：类目、语料、选句、排程规则、打卡统计、补记/月历纯函数（1271 起） |
| 1353–3289 | `<script>` ② 应用层 | 见下 |
| 1355–1455 | 存储 / 基础设施 | `LS_KEY='xwlb.v1'`、`defaultState()`(1397)、`loadState()`(1419)、`save()`(1440)、`toast()`(1443)、`openSheet()`(1450)、`closeSheet()`(1454) |
| 1456–1820 | 通知 / 权限 / 主题 | `beep`、`ensureExactAlarm`(1478)、`ensureChannel`(1500)、`ensureNotifyPermission`(1523)、`refreshDiag`(1631)、`renderPermCard`(1682)、`openSystemPage`(1720)、`applyTheme`(1797) |
| 1821–2067 | 排程 | `rebuildPlan`(1828)、`tick`(1868)、`mineNotifs`(1892)、`cancelNative`(1895)、`planSig`(1918)、`txtHash`(1928)、`sameAsPlan`(1935)、`renderPending`(1949)、`pushNative`(1963)、`writeNotifs`(2028) |
| 2068–2177 | 今天页渲染 | `renderCard`(2073)、`rollSentence`(2080)、`renderHints`(2109)、`renderStats`(2145)、`renderTopbar`(2150)、`checkinStreak`(2160)、`switchTab`(2163) |
| 2178–2250 | 打卡 | `renderCheckin`(2180)、`updateNoteCount`(2201)、`renderTrend`(2205)、`writeRecord`(2225)、`saveMood`(2233) |
| 2251–2377 | **补记 + 本月格子**（v1.5.0） | `bfDraft`/`bfBackToHist`(2252)、`closeBfSheet`(2254)、`openBackfillSheet`(2258)、`selectBfDay`(2302)、`renderBfPickers`(2321)、`saveBackfill`(2330)、`renderMonth`(2351) |
| 2378–2447 | 全部记录 | `monthKey`(2380)、`showMoodHistory`(2386)：内嵌 `#histList` + 事件委托 `data-fill` |
| 2448–2725 | 句子 / 导入 / 备份 | `renderSentences`(2450)、`showBulk`(2518)、`exportBackup`(2636)、`applyBackup`(2682)、`showImportText`(2709) |
| 2726–2959 | 设置 / 关于 / 更新 | `renderWinShare`(2728)、`renderWindows`(2754)、`renderSettings`(2771)、`showGuide`(2807)、`resetAll`(2821)、`renderAbout`(2878)、`checkUpdate`(2896) |
| 2960–3223 | 事件绑定 | `bindEvents`(2961)：所有按钮/输入框监听都在这一个函数里 |
| 3224–3289 | 启动 | `boot`(3225)（含 `?selftest=1` 分流）、`showSelfTest`(3241) |

## 3. 纯逻辑区的契约

- 必须被 `/* ==== PURE_ENGINE_START ==== */` … `/* ==== PURE_ENGINE_END ==== */` 包住。
- 里面**不许碰** `document` / `window` / `localStorage` / `$()` / `toast()` / `state`；「今天」这类环境信息要当**参数**传进来（例子：`backfillOk(key, todayKey, maxDays)`、`checkinStreakFrom(records, todayKey)`）。
- 新加的函数 / 常量必须登记进 `scripts/selftest.js` 的 `exported` 数组，否则 `new Function(... 'return {...}')` 取不到它。
- 断言写在 `runSelfTest()` 里（纯逻辑区内部），这样浏览器 `mood.html?selftest=1` 和 `node scripts/selftest.js` 跑的是同一份。

## 4. ⚠️ 锚点字符串（**注释文字和函数签名都不许改**）

冒烟测试是在文件里 `indexOf` 这些字符串来切片的，改了名字/改了注释 → 测试立刻红：

| 锚点 | 谁在用 |
|---|---|
| `/* ==== PURE_ENGINE_START ==== */` … `/* ==== PURE_ENGINE_END ==== */` | `selftest.js`、`smoke-notify.js`、`smoke-backfill.js`（正则抽纯逻辑） |
| `        function mineNotifs(res) {` → `        /* ================= 渲染 ================= */` | `smoke-notify.js` 抽「排程」大切片 |
| `        /* 时段分配规则预览` → `        function renderWindows() {` | `smoke-notify.js` 抽 `renderWinShare` |
| `        function renderTrend() {` → `        function saveMood() {` | `smoke-notify.js` 抽统计柱 |
| `        /* 写入一天的打卡记录：今天和补记共用一个入口，补记的带 filled 标记 */` → `        /* 全部打卡记录：可按日期找` | `smoke-backfill.js` 抽补记切片 |
| `.bars .b .track {`、`flex: 1 1 auto; min-height: 0`、`flex: 0 0 auto; min-height: 4px`、`var PLAN_MAX = 180;`、`function planDays(dailyMax)`、`function slotShare(st)`、`function quietClash(st)`、`function cancelNative()`、`function renderPending()`、`function backfillOk(key, todayKey, maxDays)`、`function checkinStreakFrom(records, todayKey)`、`function monthGrid(offset, records, todayKey, maxDays)`、`function writeRecord(key, mood, tags, note)` | `check.js` 的 `guards`（必需项） |
| `NATIVE ? 10 : 2`、`slice(0, 48)`、`.bars .b i {`、`wins[i % wins.length]`、`state.records[today] = { mood: draft.mood` | `check.js` 的 `banned`（出现就报错） |

## 5. 数据与存储

- localStorage 键：`xwlb.v1`（整个 state）、`xwlb.lastExport`（上次导出）、`xwlb.updateCheck`（24h 更新缓存）、`ASKED_KEY = 'xwlb.notifyAsked'`（第一次启动有没有自动弹过通知授权框）。
- state 形状见 `defaultState()`(1397)：`settings / sentences / records / cooldown / log / plan / planBuiltAt`。
- 打卡记录：`records['YYYY-MM-DD'] = { mood: 1..5, tags: [], note: '', at: ts, filled?: 1 }`（`filled:1` = 补记；老数据没这个字段）。
- 通知：自己排的系统闹钟 id 是 `1…PLAN_MAX(180)`，测试通知固定 99 万号（永不误伤）；计划指纹 `planSig`/`txtHash`（含文案指纹）没变就不重写系统闹钟。

## 6. 测试矩阵（按需跑，别每次都全量）

| 命令 | 覆盖 | 什么时候跑 |
|---|---|---|
| `npm run check` | 语法、id 引用、版本号一致、静态守卫 / 旧写法 | 每次动 `mood.html` |
| `npm run selftest` | 纯逻辑区全部断言 | 动了纯逻辑区 |
| **`npm run test:quick`** | = check + selftest | **日常改动的第一道**（输出最短） |
| `npm run test:notify` | 排程 / 通知冒烟（假闹钟 + 假 DOM） | 动了 `rebuildPlan` / `pushNative` / `renderTrend` 等 |
| `npm run test:backfill` | 补记 / 本月格子冒烟 | 动了 `writeRecord` / 补记 / 月历 |
| `npm run test:android` | `patch-android.js` 行为 | 动了打包脚本 |
| `npm test` | 上面全部（CI 用的就是它） | 提交前 / CI |
| `mood.html?selftest=1` | 浏览器里跑同一套纯逻辑断言 | 想直接看页面效果时 |

具体的断言条数以脚本自己的输出为准（会打印 `x / y`）。

## 7. 提交前自查清单

1. 版本号三处一致：`mood.html` 的 `APP_VERSION`、`package.json` 的 `version`、（有必要时）`README` 说明。
2. 新纯逻辑函数已登记进 `scripts/selftest.js` 的 `exported`，并补了断言。
3. 易改坏的结构 → `check.js` 加 `guards`；修掉的坏写法 → 加 `banned`。
4. 新增静态文件 → 改 `scripts/build-www.js` 的 `files`。
5. 新用的 DOM id 真的写在 HTML 里（`check.js` 会查 `$('...')`）。
6. 动打包装配 → `patch-android.js` 与 `check-android-patch.js` 一起改。
7. `npm test` 全绿。
8. 行号有变动 → 回本文件第 2 节更新数字。
9. 回复里给用户写清真机 / 浏览器验收步骤（AI 看不到界面）。
