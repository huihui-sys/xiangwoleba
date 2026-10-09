# 代码地图 · CODE_MAP

> 给「改这个项目的人 / AI」看的索引。**先读这一页 + 目标区域，不要全文通读 `mood.html`（3415 行 / 189 KB）。**
> 行号基于 v1.6.0，只作参考；真正稳定的定位物是下面那些**注释锚点**。大改动后请顺手更新第 2 节的行号。

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

## 2. `mood.html` 分区（行号 = v1.6.0）

| 行号 | 区段 | 内容 |
|---|---|---|
| 1–12 | `<head>` | meta / 主题色 / manifest |
| 13–31 | 首屏防闪 `<script>` | 渲染前定好 `data-theme`（独立 script 块） |
| 32–439 | `<style>` | 主题变量 `--bg/--fg/--accent` + 卡片质感 `--card-shadow`/`--hairline`；`.card`(159)；`.sec-title` + 渐变竖条(167)；`.tabbar` 选中态(318–334)；`.bars` 统计柱（含 `.track`）；`.grid7` 月历格子(378)；底纹 `body::before` / `html[data-decor]`(402–417)；`.floats` 角落 emoji(418)；`.pop` 打卡小动画(420–430) |
| 451–674 | `<main>` 里的 HTML 视图 | `#view-today`(453)、`#view-checkin`(492)、`#view-sentences`(542)、`#view-settings`(570)；底部 tab(679)；共用遮罩 `#sheetMask`/`#sheetBody`(686)、`#toast`(687)、`#banner`(688)、`#selftest`(693) |
| 694–1447 | `<script>` ① 纯逻辑区 | `PURE_ENGINE_START`(695) … `PURE_ENGINE_END`(1446)：类目、语料、选句、排程规则、打卡统计、补记/月历纯函数（1334 起）、装饰轮换 `decorOf` / `decorStyle`（1409–1445，含 `runSelfTest()`） |
| 1449–3413 | `<script>` ② 应用层 | 见下 |
| 1450–1550 | 存储 / 基础设施 | `LS_KEY='xwlb.v1'`、`defaultState()`(1493)、`loadState()`(1515)、`save()`(1536)、`toast()`(1539)、`openSheet()`(1546)、`closeSheet()`(1550) |
| 1551–1915 | 通知 / 权限 / 主题 | `beep`、`ensureExactAlarm`(1574)、`ensureChannel`(1596)、`ensureNotifyPermission`(1619)、`refreshDiag`(1727)、`renderPermCard`(1778)、`openSystemPage`(1816)、`applyTheme`(1893) |
| 1916–2163 | 排程 | `rebuildPlan`(1924)、`tick`(1964)、`mineNotifs`(1988)、`cancelNative`(1991)、`planSig`(2014)、`txtHash`(2024)、`sameAsPlan`(2031)、`renderPending`(2045)、`pushNative`(2059)、`writeNotifs`(2124) |
| 2164–2288 | 今天页渲染 | `renderCard`(2169)、`rollSentence`(2176)、`renderHints`(2205)、`renderStats`(2241)、`renderTopbar`(2246)、**`renderFloats`(2256，角落图案 + `data-decor`)**、`checkinStreak`(2269)、`switchTab`(2272) |
| 2289–2361 | 打卡 | `renderCheckin`(2289)、`updateNoteCount`(2310)、`renderTrend`(2314)、`writeRecord`(2334)、`saveMood`(2342) |
| 2362–2500 | **补记 + 本月格子**（v1.5.0） | `bfDraft`/`bfBackToHist`(2362)、`closeBfSheet`(2364)、`openBackfillSheet`(2368)、`selectBfDay`(2412)、`renderBfPickers`(2431)、`saveBackfill`(2440)、**`bump`(2462，打卡小动画，在切片内)**、`renderMonth`(2472) |
| 2501–2570 | 全部记录 | `monthKey`(2501)、`showMoodHistory`(2507)：内嵌 `#histList` + 事件委托 `data-fill` |
| 2571–2848 | 句子 / 导入 / 备份 | `renderSentences`(2571)、`showBulk`(2639)、`exportBackup`(2757)、`applyBackup`(2803)、`showImportText`(2830) |
| 2849–3081 | 设置 / 关于 / 更新 | `renderWinShare`(2849)、`renderWindows`(2875)、`renderSettings`(2892)、`showGuide`(2928)、`resetAll`(2942)、`renderAbout`(2999)、`checkUpdate`(3017) |
| 3082–3344 | 事件绑定 | `bindEvents`(3082)：所有按钮/输入框监听都在这一个函数里 |
| 3345–3415 | 启动 | `boot`(3346)（含 `?selftest=1` 分流）、`showSelfTest`(3363) |

## 3. 纯逻辑区的契约

- 必须被 `/* ==== PURE_ENGINE_START ==== */` … `/* ==== PURE_ENGINE_END ==== */` 包住。
- 里面**不许碰** `document` / `window` / `localStorage` / `$()` / `toast()` / `state`；「今天」这类环境信息要当**参数**传进来（例子：`backfillOk(key, todayKey, maxDays)`、`checkinStreakFrom(records, todayKey)`）。
- 新加的函数 / 常量必须登记进 `scripts/selftest.js` 的 `exported` 数组，否则 `new Function(... 'return {...}')` 取不到它（例：`decorOf` / `decorStyle` / `DECOR_SETS` / `DECOR_STYLES` / `FLOAT_SLOTS`）。
- 装饰这种「按天 / 按周轮换」的规则也属于纯逻辑：日期当参数传进来（`decorOf(key)` / `decorStyle(key)`），**不许用 `Math.random()`**（同一天刷新会变），渲染留给应用层的 `renderFloats()`。
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
| `.bars .b .track {`、`flex: 1 1 auto; min-height: 0`、`flex: 0 0 auto; min-height: 4px`、`var PLAN_MAX = 180;`、`function planDays(dailyMax)`、`function slotShare(st)`、`function quietClash(st)`、`function cancelNative()`、`function renderPending()`、`function backfillOk(key, todayKey, maxDays)`、`function checkinStreakFrom(records, todayKey)`、`function monthGrid(offset, records, todayKey, maxDays)`、`function decorOf(key)`、`function decorStyle(key)`、`function writeRecord(key, mood, tags, note)` | `check.js` 的 `guards`（必需项） |
| `NATIVE ? 10 : 2`、`slice(0, 48)`、`.bars .b i {`、`wins[i % wins.length]`、`state.records[today] = { mood: draft.mood` | `check.js` 的 `banned`（出现就报错） |

切片沙箱很小，只能看到 `$('id')`（返回一个只有 `textContent` / `innerHTML` / `classList` / `getElementsByTagName` 的假元素）：

- `writeRecord` 锚点 → `全部打卡记录` 锚点之间的代码会被 `smoke-backfill.js` **原样抽走**，所以这段里**不许出现** `document` / `querySelector` / `localStorage` / 真实 DOM 属性；要用就得先判空（例：`bump()` 里 `!el.classList || !el.addEventListener` 直接 return）。
- 想被切片代码调用的新函数，必须定义在这一段里（例：`bump()` 放在 `saveBackfill()` 之后），否则切片里会是 `ReferenceError`。

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
