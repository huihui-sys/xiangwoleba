# 想我了吧

一个温柔的自用情感支持小应用：**今天的状态 → 一句话 → 记录下来**，
每天随机几次在合适的时间给你发一句本地语料库里的关心，全部数据都在自己手机里，离线可用。

- 网页版：本地跑 `node scripts/serve.js`，手机和电脑连同一个 Wi-Fi 打开
- 页面自检：本地打开 `mood.html?selftest=1`
- 安卓版：用 GitHub Actions 打 APK，或本地 `npm run apk`
- 本仓库是公开仓库，但没有启用 GitHub Pages，所以没有在线预览地址；想装 App 就在 Actions 里跑一次打包

## 功能

| 模块 | 说明 |
| --- | --- |
| 今天 | 一句问候 + 心情打卡（五种心情）+ 近期状态热力条 + 周期统计 |
| 打卡 | 选心情、选标签、写一句今天的事；同一小时连续打卡会提示 |
| 句子 | 36 条内置语料（安慰 / 鼓励 / 夸奖 / 陪伴 各 9 条），可收藏、可自建、可导入导出 |
| 打卡记录 | 「全部记录」里按日期找（`2026-09` 整月 / `2026-09-19` 单日 / `09-19` 每年的这天 / `2026` 整年），也能按关键词搜备注、标签、心情 |
| 备份 | 导出在安卓上会写进应用缓存目录再弹**系统分享面板**（能存「文件」或发给自己）；另有「复制备份内容」「粘贴恢复」两条纯文本通道，手机上没文件管理器也能搬数据 |
| 设置 | 每天条数、时间段、安静时段、暂停、语料管理、JSON 导入导出（文件 / 文本两种）、清空数据 |
| 外观 | 黑夜 / 白昼（暖黄纸感）/ 跟随系统 三种主题（默认跟随系统） |
| 关于 / 更新 | 设置页显示版本 + 构建号，可手动「检查更新」（比对最新 Release 里的构建号），有新版本一键打开浏览器下载 APK |
| 定时提醒 | 预生成未来 14 天（最多 60 条）的提醒内容，安卓整批写进**系统闹钟**（不用保持后台，划掉也能准时弹），网页版退化为页面内提醒 |

## 本地跑

```bash
node scripts/serve.js          # http://localhost:8080/mood.html
```

手机和电脑连同一个 Wi-Fi，用电脑的局域网 IP 打开（脚本启动时会打印出来）。

## 自检与测试

```bash
npm test        # = check.js + selftest.js + smoke-notify.js + check-android-patch.js
```

- `scripts/check.js`：把 `mood.html` 里每个 `<script>` 块单独抽出来做语法检查，核对 JS 引用的 id 都真实存在，并守住几条容易改坏的底线（统计柱的 CSS 轨道结构、`PLAN_MAX` 排程上限、对账式排程用的 `cancelNative` / `renderPending` 必须在）。
- `scripts/selftest.js`：抽取页面里 `/* ==== PURE_ENGINE_START/END ==== */` 之间的纯逻辑，在 Node 里跑 61 项断言（语料合法性、时间换算、安静时段跨零点、选句权重与 7 天冷却、排程数量/升序/不重复/避开安静时段、**时段分配规则与起点轮转公平性**、**排程覆盖天数公式**、打卡记录按日期或关键词查找、版本号比较）。
- 浏览器里打开 `mood.html?selftest=1` 可以看同一套逻辑在真实运行环境的自检结果。
- `scripts/smoke-notify.js`：把 `mood.html` 里**真实的**排程代码（`pushNative` / `cancelNative` / `renderPending` / `renderWinShare`）和统计柱渲染（`renderTrend`）抽出来，配一个「假系统闹钟」+ 假 DOM 跑 22 项断言：
  对账式排程的调用顺序、**排程失败时原有闹钟不被清空**（v1.3.0 修的核心回归）、关闭通知后系统里一条不留、待发条数回读、时段分配文案、柱子高度严格等于 `分数 / 5`。
- `scripts/check-android-patch.js`：在临时目录里伪造一份 Capacitor 的 `android/` 工程，验证 `scripts/patch-android.js` 的行为：
  正常注入签名与版本号、同参数重复跑保持幂等（一个字节都不改）、CI 模式缺密钥 / 密钥文件不存在 / 密码不全时必须退出码 1。

## 打安卓包

```bash
npm install
npm run cap:sync      # 组装 www/ 并同步进 android/
npm run apk           # 本地出 release APK（需 JDK 21 + Android SDK + 下面「固定签名」里的 4 个环境变量）
```

不想装环境就用 GitHub Actions：仓库里 `.github/workflows/android.yml`，在 Actions 页手动点 **Run workflow**，跑完在 Artifacts 里下载 **`xwlb-release-apk`**，解压得到 `app-release.apk`。

CI 还会用 `gh release create/upload --clobber` 把这次构建发成一个 Release（tag = `package.json` 的 version，构建号写在 Release 说明的 `BUILD=` 里，App 的「检查更新」读的就是它），所以手机上有一个**固定下载地址**：

```
https://github.com/huihui-sys/xiangwoleba/releases/latest/download/app-release.apk
```

生成的 `android/`、`www/`、`node_modules/` 都不入库（见 `.gitignore`），Android 原生需要的权限、应用名、固定签名和版本号由 `scripts/patch-android.js` 在打包流程里自动补上：

```
POST_NOTIFICATIONS / SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM
VIBRATE / RECEIVE_BOOT_COMPLETED / WAKE_LOCK / REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
```

装好后第一次打开会**主动申请通知权限**（Android 13+ 的 `POST_NOTIFICATIONS` 是运行时权限，只写进 manifest 不申请的话，系统会把通知直接丢掉，通知栏里什么都看不到）；建议依次允许：**通知** → **闹钟和提醒** → 在系统电池设置里把本应用设为「不受限制」，这样重装/重启后提醒才不会丢。

设置页底部会显示一条诊断信息（运行环境 / 通知权限 / 使用的通道），旁边还有 **测试通知（立刻）** 和 **30 秒后测试** 两个按钮，可以当场确认通知能不能弹出来。

## 固定签名（升级不丢数据）

以前打的是 `assembleDebug`，每个 GitHub runner 都会**临时生成**一个 debug 密钥，所以每次构建的签名都不一样 —— 装新包必须先卸载旧包，卸载就会清掉 App 数据（打卡记录、收藏、设置全在 `localStorage` 里）。现在换成**固定密钥签名的 release 包**，以后直接覆盖安装，数据原样保留。

密钥只存在**你本地**和 GitHub Secrets 里，仓库里没有（`.gitignore` 已屏蔽 `*.jks` / `*.keystore`）。

一次性配置 —— 4 个 Secrets（仓库 → Settings → Secrets and variables → Actions → New repository secret）：

| Secret 名 | 填什么 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | 密钥文件的 base64（一整行） |
| `ANDROID_KEYSTORE_PASSWORD` | store 密码 |
| `ANDROID_KEY_ALIAS` | 别名，这里是 `xwlb` |
| `ANDROID_KEY_PASSWORD` | key 密码（PKCS12 下与 store 密码相同） |

生成密钥（仓库用的就是 PKCS12 / RSA 2048 / 30 年有效期）：

```bash
keytool -genkeypair -v -keystore xwlb-release.jks -alias xwlb \
  -keyalg RSA -keysize 2048 -validity 10950 -storetype PKCS12 \
  -storepass <你的密码> -keypass <同一个密码> \
  -dname "CN=xiangwoleba, OU=self, O=self, L=self, ST=self, C=CN"

# 取 base64（Linux / macOS）
base64 -w0 xwlb-release.jks

# 取 base64（Windows PowerShell）
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\xwlb-release.jks"))
```

- ⚠️ **密钥文件和密码一定要备份**（本地放一份 + 密码管理器放一份）。丢了就再也无法覆盖安装，只能卸载重装、数据全丢。
- ⚠️ 密码建议只用字母数字和 `-` `_`，避免 shell 转义问题。
- ⚠️ 从旧的 debug 包换到新的 release 包，**最后一次仍然要卸载**（签名不同）。卸之前先在 App 里「设置 → 导出 JSON」备份，装完再导入。
- CI 里打完包会跑 `apksigner verify --print-certs`，构建摘要（Summary）里能看到证书 SHA-256；**每次构建应该是同一个指纹**，如果不是，说明签名没生效，别装，先查 Secrets。
- `versionName` 取 `package.json` 的 version，`versionCode` 取 Actions 运行序号（自然递增），系统「应用信息」里能直接看出装的是哪一次构建。

## 关于定时发送（重要）

纯网页在后台无法自己醒来发通知，所以方案是**提前把内容和时间都算好**：

1. 网页端生成未来 2 天、安卓端生成未来 **3~14 天**的提醒计划（`buildPlan`），每条都带好那一句文案；
   覆盖天数由 `planDays(dailyMax)` 算：`clamp(floor(60 / 每天句数), 3, 14)`，也就是**一次最多 60 条**（每天 4 句 → 14 天 56 条；每天 12 句 → 5 天 60 条），
   所以只要 60 条没发完，App 就算一直不开也不会断。
2. 安卓把计划整批写进系统的本地通知（`AlarmManager` 的 `setExactAndAllowWhileIdle`），到点由系统弹出，**不依赖 App 活着**：划掉后台、系统回收进程都照响；
3. **对账式排程**：先把新的整批 `schedule` 进去（同一个 id 会直接覆盖旧的那条），成功之后再 `getPending` 读回系统里的真实清单，只 `cancel` 掉「上一批多出来」的 id。
   以前是「先全清、再重排」，中间那一下 App 被杀或排程报错，系统里就一条闹钟都不剩了 —— 这正是「后台被杀之后就不再提醒」的根因；
4. 每次启动、回到前台、以及计划快发完时都会重排一次；设置页的「立即重排」按钮可以手动触发，并会把**系统里真实待发的条数**（不是本地以为的条数）显示出来；
5. 设置页的「开启通知」开关是**真的会生效**的：关掉会立刻 `cancel` 掉系统里所有待发提醒，重新打开会重新排（旧版本这个开关只写不读，关掉照样响）；
6. 通知固定走自建的 `xwlb` 通道（`importance: 4`）：Android 8+ 的通道一旦创建就不能再改重要性，插件自带的 `default` 通道弹不出横幅，所以必须自己建一个；
   通道里的震动 / 提示音由系统控制，App 里那两个开关只管「App 打开时」的页内提醒；
7. 万一没拿到通知权限，页内会退化成顶部横幅提醒 + 震动 + 提示音，至少不会完全错过。

想让提醒更准、别被系统清掉（可选但强烈建议）：

- 设置页点 **「允许精确提醒」**（Android 12+ 的「闹钟和提醒」权限，没有它就只能不精确地响）；
- 系统设置 → 应用 → 想我了吧 → **电池 → 无限制（不优化）**，并允许**自启动**；
- 用设置页的 **「30 秒后测试」** 亲手验一次：点完立刻锁屏或划掉后台，30 秒后照样弹，就说明这套机制通了。

### 时间段怎么分配给每天

- 每天最多发 `min(每天最多几句, 时段数 × 2)` 条：**每个时段先各给 1 条，还有多的从头补**（同一个时段每天最多 2 条）；
- **起点每天往后轮一个时段**，所以「每天 2 句 · 3 个时段」这种配置不会永远只发前两段，长期看每段分到的条数一样多；
- 随机时刻撞进安静时段时会**重抽最多 6 次**（以前直接丢掉这一格，安静时段一大就经常整天不发）；
- 设置页在时间段上方会写清楚当前分配（例：`每天 4 句：第 1 段 2 句、第 2 段 1 句、第 3 段 1 句`），
  每天句数比时段数少、或某个时段整段落在安静时段里时，会直接给出 ⚠️ 提示。

## 更新与回退

**更新（正常方式）**：装新 APK 覆盖旧 APK，**不用卸载**，打卡记录 / 收藏 / 设置都还在（数据在 `localStorage`，卸载才会清）。

1. 改完代码推 `main`，GitHub Actions 会自动打 release 包，并**顺手发一个 Release**（tag = `package.json` 的 version，比如 `v1.2.0`）；
2. APK 的固定下载地址（每次打包自动覆盖同一个资产）：
   `https://github.com/huihui-sys/xiangwoleba/releases/latest/download/app-release.apk`
3. App 里「设置 → 关于 / 更新」点 **检查更新** 会自动比对构建号（= Actions 运行序号）：有新版本时按钮变成「去下载新版本」，点开浏览器下载，装的时候直接覆盖安装。启动时也会静默查一次（24 小时内不重复查，查不到就静默放过，不弹任何错）；
4. 「设置 → 关于」显示 `v1.3.0（构建 4）`，数字就是构建时的 Actions 运行序号，和系统「应用信息」里的 `versionCode` 对得上，装的是哪一次构建一眼能看出来。

**回退（万一新版有问题）**

- 本仓库每个版本的代码都有 tag（`v1.1.0`、`v1.2.0`，当前在用的是 `v1.3.0`）；
- 回退动作 = 从想要的那个 tag **重新打一次包**再覆盖安装：

```bash
git checkout v1.1.0
# 在 Actions 页面点 Run workflow（用该 tag 的分支/提交），或本地 npm run apk
```

- 签名是固定的，所以回退包也能直接覆盖安装、数据不丢；只是 `versionCode` 会取新的运行序号（比旧版大），系统不会拦安装。
- 关键顺序：**先确认「导出备份」真的成功了再动包**。旧版（v1.1.0 及以前）在安卓里导出是假成功（`blob:` + `a.click()`，WebView 没有下载器，文件不落盘），从 v1.2.0 起改成「写进缓存目录 + 系统分享面板」，并额外提供「复制备份内容 / 粘贴恢复」两条文本通道。

## 小改动记录

- **通知进不了通知栏**：根因是启动时从没申请运行时权限 `POST_NOTIFICATIONS`（旧代码只在手动点「测试通知」时才申请），而且用的是插件的 `default` 通道。现在 App 一启动就确认/申请权限，并自建高优先级通道 `xwlb`；设置页能看到诊断信息和两个测试按钮。
- **主题切换**：设置页新增「外观」，可选 黑夜 / 白昼 / 跟随系统。配色全部收进 CSS 变量，`html[data-theme="light"]` 只覆盖颜色；`<head>` 里有提前执行的小脚本，切换和刷新都不会闪一下黑。
- **打包签名**：`assembleDebug` 每次由 runner 生成临时 debug 密钥 → 签名随机变，更新必须卸载重装、数据全丢。现在改为固定密钥签名的 release 包（keystore 走 GitHub Secrets，`scripts/patch-android.js` 注入签名配置和版本号），以后可以直接覆盖安装；CI 会打印证书 SHA-256 供核对。
- **打卡输入框中间插不进字**：`capacitor.config.json` 里删掉了 `captureInput: true`（Capacitor 8 默认是 `false`，开启后 WebView 会用简易键盘去捕获按键，光标行为会变怪）；同时 `renderCheckin()` 改成只在内容真的变化时才写回 `textarea`，不再每次整段重写，打字时草稿和光标都不会丢。
- **导出备份是假成功**：`exportBackup()` 原来用 `blob:` + `a.click()`，安卓 WebView 没有下载器，文件根本不落盘，却照样提示「已导出备份文件」。现在 App 里改成 `Filesystem.writeFile` 写进缓存目录 + `Share.share({ files: [uri] })` 弹**系统分享面板**（可存到「文件」或发给自己），失败时降级成「复制备份内容」的只读文本；另外加了「粘贴恢复」和设置页「上次导出：文件名 + 时间」，导没导出去一眼能看出来。网页版仍走浏览器直接下载。
- **主页按钮三合一**：今天页去掉「分享」和「存为我的」（`shareCard()` 死代码一并删除），只留「再给我一句 / 收藏 / 复制这句 / 存进我的句子」；卡片上那句如果不在语料库里，点「收藏」会自动帮你存进去。
- **白昼主题改暖黄**：`html[data-theme="light"]` 换成米黄纸感配色（`--bg #fbf3e6` / `--card #fffaf0` / `--fg #3f3428` …），状态栏 `theme-color` 同步；黑夜主题一个字节没动。
- **提醒排期更省心**：App 里一次排 **10 天**（原来 4 天，再叠加原来的「11 小时重排」几乎等于天天重排），改成只在**快发完**（剩不到半天量）或计划只剩最后一天时才补排；设置页「数据」多了「已排期：排到 X 月 X 日 · 还剩 N 条」。
- **版本号 + 应用内检查更新**：页面里 `APP_VERSION` 必须等于 `package.json` 的 version（`scripts/check.js` 直接核对，不一致就报错），打包时 `scripts/build-www.js` 把 `APP_BUILD='dev'` 占位替换成 CI 构建号（找不到占位就退出 1）；CI 打完包顺手发 Release（`permissions: contents: write` + `gh release upload --clobber`），App 比对 Release 说明里的 `BUILD=` 判断有没有新版（24 小时才查一次，查不到不打扰）。
- **打卡记录能按日期找**：`parseRange()` / `filterRecords()` 是纯函数（放在 `PURE_ENGINE` 区间里，Node 自检也会跑），支持 `2026-09` 整月、`2026-09-19` 单日、`09-19` 跨年、`2026` 整年，或者按关键词搜备注 / 标签 / 心情；配「本月 / 上月 / 今年 / 全部」快捷按钮、匹配计数，最多渲染 300 条。
- **统计柱子 3 分和 5 分看着一样高**：`.bars .b i` 直接当 flex 子项，`height: 92%` 之类的百分比是按整个 `.b`（含日期标签）算的，超出部分又被 `flex-shrink` 压缩，所以 4 分、5 分渲染出来几乎等长。现在改成「柱区轨道 + 柱子不收缩 + 标签独立一行」（`.track` / `flex: 0 0 auto`），高度严格等于 `分数 / 5`（20/40/60/80/100%），并按 1~5 分分档上色。
- **后台被杀之后再也不提醒**：根因是 `pushNative()` 用「先全清、再重排」，中间那一步 App 被杀或 `schedule` 报错，系统里就一条闹钟都不剩；而且只排 10 天、`slice(0, 48)` 截断，补排条件（`left <= ceil(dailyMax/2)`）又几乎永不触发。现在改成**对账式排程**（先 schedule 覆盖同 id，再 `getPending` 只 cancel 多出来的），覆盖天数提到 `clamp(floor(60/每天句数), 3, 14)`、上限 60 条，并补上「精确闹钟 / 电池白名单」引导和「系统里待发 N 条」的真实状态回读。
- **时段分配不透明、末尾时段发不出来**：规则本身是 `min(每天句数, 时段数 × 2)` 且永远从第 1 个时段开始取（`wins[i % n]`），所以「每天 2 句 · 3 个时段」里第 3 个时段永远轮不到，撞进安静时段的那一格还会被直接丢掉。现在改成**起点每天轮转** + 安静时段冲突**重抽最多 6 次**，并新增纯函数 `slotShare()` / `planDays()` / `quietClash()`（都在 `PURE_ENGINE` 里，Node 自检会跑）与设置页的分配规则预览和 ⚠️ 提示。
- **「开启通知」开关关不掉**：`settings.notify` 以前只写不读，关掉后系统里的待发闹钟照样会响。现在 `pushNative()` 会先看这个开关，关掉时直接 `cancel` 掉自己排的全部提醒（关再开也能恢复）。

所有数据存在 `localStorage` 的 `xwlb.v1` 键里，换手机用「设置 → 导出 JSON」搬过去即可。