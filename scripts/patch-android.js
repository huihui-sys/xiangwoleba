/**
 * 想我了吧 · Android 工程补丁
 * 用法：node scripts/patch-android.js（在 npx cap add android / cap sync 之后跑）
 *
 * Capacitor 生成的工程是临时的，所以这里用脚本补上：
 *   1. AndroidManifest.xml 里的通知 / 精确闹钟 / 开机自启权限
 *   2. values/strings.xml 里的应用名
 * 脚本是幂等的，重复跑不会加重复的权限。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
const appName = cfg.appName || '想我了吧';

const PERMS = [
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.SCHEDULE_EXACT_ALARM',
    'android.permission.USE_EXACT_ALARM',
    'android.permission.VIBRATE',
    'android.permission.RECEIVE_BOOT_COMPLETED',
    'android.permission.WAKE_LOCK',
    'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'
];

let problems = 0;

/* ---------- 1. AndroidManifest.xml ---------- */
const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (!fs.existsSync(manifestPath)) {
    console.error('✘ 没找到 android/app/src/main/AndroidManifest.xml');
    console.error('  先在项目里执行：npx cap add android');
    process.exit(1);
}
let xml = fs.readFileSync(manifestPath, 'utf8');
const added = [];
PERMS.forEach(function (p) {
    if (xml.indexOf('"' + p + '"') >= 0) { return; }
    added.push(p);
});
if (added.length) {
    const block = '\n    <!-- 想我了吧：定时通知所需权限（由 scripts/patch-android.js 自动补上） -->\n' +
        added.map(function (p) { return '    <uses-permission android:name="' + p + '" />'; }).join('\n') + '\n';
    if (xml.indexOf('</manifest>') < 0) {
        console.error('✘ AndroidManifest.xml 结构异常，找不到 </manifest>');
        problems++;
    } else {
        xml = xml.replace('</manifest>', block + '</manifest>');
        fs.writeFileSync(manifestPath, xml, 'utf8');
    }
}
console.log('  ✔ AndroidManifest.xml：新增 ' + added.length + ' 条权限' + (added.length ? '（' + added.join(', ') + '）' : '，已是最新'));

/* ---------- 2. strings.xml 应用名 ---------- */
const stringsPath = path.join(root, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml');
if (fs.existsSync(stringsPath)) {
    let sx = fs.readFileSync(stringsPath, 'utf8');
    const before = sx;
    sx = sx.replace(/(<string name="app_name">)[^<]*(<\/string>)/, '$1' + appName + '$2');
    sx = sx.replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, '$1' + appName + '$2');
    if (sx !== before) {
        fs.writeFileSync(stringsPath, sx, 'utf8');
        console.log('  ✔ strings.xml：应用名设为「' + appName + '」');
    } else {
        console.log('  · strings.xml：应用名无需修改');
    }
} else {
    console.log('  · 没找到 strings.xml，跳过应用名设置');
}

console.log(problems ? '\n补丁结果：有 ' + problems + ' 个问题 ❌' : '\n补丁结果：完成 ✅');
process.exit(problems ? 1 : 0);
