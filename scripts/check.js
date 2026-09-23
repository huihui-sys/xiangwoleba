/**
 * 想我了吧 · 语法检查
 * 用法：node scripts/check.js
 *
 * 把 mood.html 里的每个 <script> 块单独抽出来做语法检查，
 * 这样改完页面不用打开浏览器也能立刻知道有没有写错。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const file = path.join(__dirname, '..', 'mood.html');
const html = fs.readFileSync(file, 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(function (m) { return m[1]; });

if (!blocks.length) {
    console.error('✘ 没找到任何 <script> 块');
    process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xwlb-check-'));
let bad = 0;
blocks.forEach(function (code, i) {
    const f = path.join(tmp, 'block' + i + '.js');
    fs.writeFileSync(f, code, 'utf8');
    const r = cp.spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    if (r.status === 0) {
        console.log('  ✔ 第 ' + (i + 1) + ' 个 <script> 块语法正确（' + code.split('\n').length + ' 行）');
    } else {
        bad++;
        console.log('  ✘ 第 ' + (i + 1) + ' 个 <script> 块有语法错误：\n' + (r.stderr || ''));
    }
});
fs.rmSync(tmp, { recursive: true, force: true });

/* 顺手检查 HTML 里的 id 是否都被 JS 用到了（防止拼错 id） */
const ids = [...html.matchAll(/id="([\w-]+)"/g)].map(function (m) { return m[1]; });
const used = new Set();
blocks.forEach(function (code) {
    [...code.matchAll(/\$\('([\w-]+)'\)/g)].forEach(function (m) { used.add(m[1]); });
});
const missing = [...used].filter(function (id) { return ids.indexOf(id) < 0; });
if (missing.length) {
    bad++;
    console.log('  ✘ JS 里引用了不存在的 id：' + missing.join(', '));
} else {
    console.log('  ✔ JS 引用的 ' + used.size + ' 个 id 在 HTML 里都存在');
}

/* 版本号必须和 package.json 一致，否则 App 里显示的版本会骗人 */
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const verMatch = html.match(/var APP_VERSION = '([^']+)'/);
if (!verMatch) {
    bad++;
    console.log("  ✘ 找不到 var APP_VERSION = '...'，App 里没法显示版本号");
} else if (verMatch[1] !== pkg.version) {
    bad++;
    console.log('  ✘ 版本号不一致：mood.html 里是 ' + verMatch[1] + '，package.json 里是 ' + pkg.version);
} else {
    console.log('  ✔ APP_VERSION 与 package.json 一致（' + verMatch[1] + '）');
}

/* 构建号占位必须留着：打包时 scripts/build-www.js 会把它换成 CI 的运行序号 */
if (/var APP_BUILD = 'dev';/.test(html)) {
    console.log("  ✔ 找到构建号占位 var APP_BUILD = 'dev';（打包时替换）");
} else {
    bad++;
    console.log("  ✘ 缺少 var APP_BUILD = 'dev'; 占位，打包脚本就没法注入构建号");
}

/* 踩过坑的地方加静态守卫：这几处改坏了，光看语法检查是发现不了的 */
const guards = [
    ['.bars .b .track {', '统计柱有独立的柱区轨道（否则 4 分 5 分会一样高）'],
    ['flex: 1 1 auto; min-height: 0', '柱区轨道能撑满「总高 − 日期标签」'],
    ['flex: 0 0 auto; min-height: 4px', '柱子不会被 flex 压缩'],
    ['var PLAN_MAX = 180;', '排程条数上限 PLAN_MAX'],
    ['function planDays(dailyMax)', '排程覆盖天数走 planDays()'],
    ['function slotShare(st)', '时段分配走 slotShare()'],
    ['function quietClash(st)', '时段 / 安静时段冲突检测'],
    ['function cancelNative()', '取消系统闹钟（关闭通知、对账排程都要用）'],
    ['function renderPending()', '回读系统里真实待发的条数']
];
guards.forEach(function (g) {
    if (html.indexOf(g[0]) >= 0) {
        console.log('  ✔ 保留：' + g[1]);
    } else {
        bad++;
        console.log('  ✘ 缺少 `' + g[0] + '`：' + g[1]);
    }
});

/* 这几条是 v1.3.0 修掉的坏写法，禁止再回来 */
const banned = [
    [/NATIVE \? 10 : 2/, '排程天数不能再硬编码 10 天（要用 planDays()）'],
    [/slice\(0, 48\)/, '排程条数不能再硬编码 48 条（要用 PLAN_MAX）'],
    [/\.bars \.b i \{/, '柱子不能再直接当 .b 的 flex 子项（要套 .track）'],
    [/wins\[i % wins\.length\]/, '时段不能再固定从第 1 段开始取（要按天轮转）']
];
banned.forEach(function (b) {
    if (b[0].test(html)) {
        bad++;
        console.log('  ✘ 发现旧写法：' + b[1]);
    } else {
        console.log('  ✔ 没有旧写法：' + b[1]);
    }
});

console.log(bad ? '\n检查结果：有 ' + bad + ' 个问题 ❌' : '\n检查结果：全部通过 ✅');
process.exit(bad ? 1 : 0);
