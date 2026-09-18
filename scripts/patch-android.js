/**
 * 想我了吧 · Android 工程补丁
 * 用法：node scripts/patch-android.js（在 npx cap add android / cap sync 之后跑）
 *
 * Capacitor 生成的工程是临时的，所以这里用脚本补上：
 *   1. AndroidManifest.xml 里的通知 / 精确闹钟 / 开机自启权限
 *   2. values/strings.xml 里的应用名
 *   3. build.gradle 里的固定签名（密钥来自环境变量，见 README「固定签名」）
 *   4. build.gradle 里的 versionName / versionCode
 * 脚本是幂等的：重复跑不会加重复的权限，也不会重复注入签名块。
 *
 * 固定签名相关的环境变量（不设就保持原样，本地调试仍可跑 assembleDebug）：
 *   XWLB_KEYSTORE_PATH        密钥文件路径（如 $RUNNER_TEMP/xwlb.jks）
 *   XWLB_KEYSTORE_PASSWORD    store password
 *   XWLB_KEY_ALIAS            别名（如 xwlb）
 *   XWLB_KEY_PASSWORD         key password
 *   XWLB_VERSION_CODE         versionCode（CI 里传 Actions 的运行序号）
 *   XWLB_REQUIRE_SIGNING=1    强制要求签名：没给密钥就报错退出（CI 用，避免产出随机签名的包）
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

/* ---------- 0. 固定签名用的环境变量 ---------- */
const KS_PATH = (process.env.XWLB_KEYSTORE_PATH || '').trim();
const KS_PASS = process.env.XWLB_KEYSTORE_PASSWORD || '';
const KS_ALIAS = process.env.XWLB_KEY_ALIAS || '';
const KS_KEYPASS = process.env.XWLB_KEY_PASSWORD || '';
const VERSION_CODE = (process.env.XWLB_VERSION_CODE || '').trim();
const REQUIRE_SIGNING = /^(1|true|yes)$/i.test(process.env.XWLB_REQUIRE_SIGNING || '');
const MARK = '// xwlb-signing-config';

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

/* ---------- 3 / 4. build.gradle：固定签名 + 版本号 ---------- */
const pkgPath = path.join(root, 'package.json');
const vName = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || '1.0.0';
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');

if (!fs.existsSync(gradlePath)) {
    console.error('✘ 没找到 android/app/build.gradle（先执行 npx cap add android）');
    problems++;
} else {
    let g = fs.readFileSync(gradlePath, 'utf8');
    const before = g;
    const note = [];

    if (!KS_PATH) {
        if (REQUIRE_SIGNING) {
            console.error('✘ XWLB_REQUIRE_SIGNING=1，但没有 XWLB_KEYSTORE_PATH');
            console.error('  请到 GitHub：仓库 → Settings → Secrets and variables → Actions 配置');
            console.error('  ANDROID_KEYSTORE_BASE64 / ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD');
            console.error('  （本地调试不想签名，就别设 XWLB_REQUIRE_SIGNING）');
            problems++;
        } else {
            console.log('  · build.gradle：没有 XWLB_KEYSTORE_PATH，保持模板原有签名（本地调试）');
        }
    } else if (g.indexOf(MARK) >= 0) {
        note.push('签名配置已存在，幂等跳过');
    } else if (g.indexOf('android {') < 0) {
        console.error('✘ build.gradle 里找不到 "android {"，无法注入签名配置');
        problems++;
    } else if (!fs.existsSync(KS_PATH)) {
        console.error('✘ 找不到密钥文件：' + KS_PATH);
        problems++;
    } else if (!KS_PASS || !KS_ALIAS || !KS_KEYPASS) {
        console.error('✘ 密钥信息不全，需要 XWLB_KEYSTORE_PASSWORD / XWLB_KEY_ALIAS / XWLB_KEY_PASSWORD');
        problems++;
    } else {
        const head = 'android {\n' +
            '    ' + MARK + '：由 scripts/patch-android.js 自动注入，密钥来自环境变量，勿手工改\n' +
            '    signingConfigs {\n' +
            '        release {\n' +
            '            storeFile file(System.getenv(\'XWLB_KEYSTORE_PATH\'))\n' +
            '            storePassword System.getenv(\'XWLB_KEYSTORE_PASSWORD\')\n' +
            '            keyAlias System.getenv(\'XWLB_KEY_ALIAS\')\n' +
            '            keyPassword System.getenv(\'XWLB_KEY_PASSWORD\')\n' +
            '        }\n' +
            '    }\n';
        g = g.replace(/android\s*\{/, head);

        const m = g.match(/buildTypes\s*\{[\s\S]*?release\s*\{/);
        if (!m) {
            console.error('✘ build.gradle 里找不到 buildTypes { release {');
            problems++;
        } else {
            const at = m.index + m[0].length;
            g = g.slice(0, at) +
                '\n            ' + MARK + '\n' +
                '            signingConfig signingConfigs.release' +
                g.slice(at);
            note.push('已挂上固定签名');
        }
        /* release 包不做压缩混淆：WebView 的静态资源别被裁掉 */
        g = g.replace(/minifyEnabled\s+true/g, 'minifyEnabled false');
        g = g.replace(/shrinkResources\s+true/g, 'shrinkResources false');
    }

    if (/versionName\s+"[^"]*"/.test(g)) {
        g = g.replace(/versionName\s+"[^"]*"/, 'versionName "' + vName + '"');
    }
    if (VERSION_CODE && /versionCode\s+\d+/.test(g)) {
        g = g.replace(/versionCode\s+\d+/, 'versionCode ' + VERSION_CODE);
    }

    if (g !== before) {
        fs.writeFileSync(gradlePath, g, 'utf8');
        console.log('  ✔ build.gradle：versionName=' + vName +
            '，versionCode=' + (VERSION_CODE || '沿用模板值') +
            (note.length ? '（' + note.join('；') + '）' : ''));
    } else {
        console.log('  · build.gradle：无需修改（versionName=' + vName +
            '，versionCode=' + (VERSION_CODE || '沿用模板值') + '）');
    }
}

console.log(problems ? '\n补丁结果：有 ' + problems + ' 个问题 ❌' : '\n补丁结果：完成 ✅');
process.exit(problems ? 1 : 0);
