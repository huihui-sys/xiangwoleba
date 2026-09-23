/**
 * 想我了吧 · Android 补丁自检
 * 用法：node scripts/check-android-patch.js
 *
 * 目的：`scripts/patch-android.js` 负责往 Capacitor 生成的工程里注入固定签名配置、
 * 通知权限，以及「跳系统设置」的 XwlbSettings 原生小插件。一旦注入逻辑被改坏
 * （找不到锚点、重复注入、幂等失效、registerPlugin 位置不对），要到 CI 打包那一步才会暴露。
 * 这里在临时目录里伪造一份官方 android-template 结构，把补丁脚本跑 9 种场景核对行为。
 * 测试用的「密钥文件」是临时目录里的假文件，不涉及任何真实密钥。
 */
'use strict';

const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const TMP = path.join(os.tmpdir(), 'xwlb-android-patch-check');
const FAKE_KS = path.join(TMP, 'fake-keystore.jks');
const PW = 'test-password';
/* 版本号不写死：patch-android.js 读的就是根目录 package.json 的 version，
   这里跟着一起读，免得升个版本就把测试弄红 */
const VERSION = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const results = [];
let pass = 0;
let fail = 0;

function ok(name, cond, extra) {
    if (cond) { pass++; } else { fail++; }
    results.push('  ' + (cond ? '✔' : '✘') + ' ' + name + (extra ? '   [' + extra + ']' : ''));
}

/* 锚点与 Capacitor 官方 android-template/app/build.gradle 一致 */
const GRADLE = [
    "apply plugin: 'com.android.application'",
    '',
    'android {',
    '    namespace = "com.getcapacitor.myapp"',
    '    compileSdk = rootProject.ext.compileSdkVersion',
    '    defaultConfig {',
    '        applicationId "com.getcapacitor.app"',
    '        minSdkVersion rootProject.ext.minSdkVersion',
    '        targetSdkVersion rootProject.ext.targetSdkVersion',
    '        versionCode 1',
    '        versionName "1.0"',
    '        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"',
    '        aaptOptions {',
    "             ignoreAssetsPattern = '!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~'",
    '        }',
    '    }',
    '    buildTypes {',
    '        release {',
    '            minifyEnabled false',
    "            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'",
    '        }',
    '    }',
    '}',
    '',
    'repositories {',
    '    flatDir{',
    "        dirs '../capacitor-cordova-android-plugins/src/main/libs', 'libs'",
    '    }',
    '}',
    '',
    'dependencies {',
    "    implementation fileTree(include: ['*.jar'], dir: 'libs')",
    "    implementation project(':capacitor-android')",
    '}',
    '',
    "apply from: 'capacitor.build.gradle'",
    '',
    'try {',
    "    def servicesJSON = file('google-services.json')",
    '    if (servicesJSON.text) {',
    "        apply plugin: 'com.google.gms.google-services'",
    '    }',
    '} catch(Exception e) {',
    '    logger.info("google-services.json not found")',
    '}',
    ''
].join('\n');

const MANIFEST = '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n' +
    '    <application android:label="@string/app_name" />\n' +
    '</manifest>\n';

const STRINGS = '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<resources>\n' +
    '    <string name="app_name">My App</string>\n' +
    '    <string name="title_activity_main">My App</string>\n' +
    '</resources>\n';

const GR = path.join(TMP, 'android', 'app', 'build.gradle');
const MX = path.join(TMP, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const SX = path.join(TMP, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml');
const JAVA_DIR = path.join(TMP, 'android', 'app', 'src', 'main', 'java', 'com', 'getcapacitor', 'myapp');
const MA = path.join(JAVA_DIR, 'MainActivity.java');
const JPLUG = path.join(JAVA_DIR, 'XwlbSettingsPlugin.java');

/* 锚点与 Capacitor 官方 android-template 的 MainActivity.java 一致（空类，没有 onCreate） */
const MAIN_ACTIVITY = [
    'package com.getcapacitor.myapp;',
    '',
    'import com.getcapacitor.BridgeActivity;',
    '',
    'public class MainActivity extends BridgeActivity {}',
    ''
].join('\n');

/* 另一种真实情况：MainActivity 已经有自己的 onCreate（比如接 Deep Link / 状态栏设置） */
const MAIN_ACTIVITY_CREATE = [
    'package com.getcapacitor.myapp;',
    '',
    'import android.os.Bundle;',
    'import com.getcapacitor.BridgeActivity;',
    '',
    'public class MainActivity extends BridgeActivity {',
    '    @Override',
    '    public void onCreate(Bundle savedInstanceState) {',
    '        super.onCreate(savedInstanceState);',
    '    }',
    '}',
    ''
].join('\n');

function buildFixture(maSrc) {
    fs.rmSync(TMP, { recursive: true, force: true });
    fs.mkdirSync(path.join(TMP, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(TMP, 'android', 'app', 'src', 'main', 'res', 'values'), { recursive: true });
    fs.mkdirSync(JAVA_DIR, { recursive: true });
    fs.copyFileSync(path.join(root, 'scripts', 'patch-android.js'), path.join(TMP, 'scripts', 'patch-android.js'));
    fs.copyFileSync(path.join(root, 'capacitor.config.json'), path.join(TMP, 'capacitor.config.json'));
    fs.copyFileSync(path.join(root, 'package.json'), path.join(TMP, 'package.json'));
    fs.writeFileSync(GR, GRADLE, 'utf8');
    fs.writeFileSync(MX, MANIFEST, 'utf8');
    fs.writeFileSync(SX, STRINGS, 'utf8');
    fs.writeFileSync(MA, maSrc === undefined ? MAIN_ACTIVITY : maSrc, 'utf8');
    fs.writeFileSync(FAKE_KS, 'not-a-real-keystore', 'utf8');
}

function runPatch(env) {
    const base = Object.assign({}, process.env);
    ['XWLB_KEYSTORE_PATH', 'XWLB_KEYSTORE_PASSWORD', 'XWLB_KEY_ALIAS', 'XWLB_KEY_PASSWORD',
        'XWLB_VERSION_CODE', 'XWLB_REQUIRE_SIGNING'].forEach(function (k) { delete base[k]; });
    const r = cp.spawnSync(process.execPath, ['scripts/patch-android.js'],
        { cwd: TMP, encoding: 'utf8', env: Object.assign(base, env || {}) });
    return { code: r.status, text: (r.stdout || '') + (r.stderr || '') };
}

const read = function (p) { return fs.readFileSync(p, 'utf8'); };
const count = function (s, re) { return (s.match(re) || []).length; };
const braces = function (s) { return count(s, /\{/g) - count(s, /\}/g); };

const SIGNED = {
    XWLB_KEYSTORE_PATH: FAKE_KS, XWLB_KEYSTORE_PASSWORD: PW,
    XWLB_KEY_ALIAS: 'xwlb', XWLB_KEY_PASSWORD: PW,
    XWLB_VERSION_CODE: '42', XWLB_REQUIRE_SIGNING: '1'
};

/* ---------- 场景 1：模拟 CI（密钥齐全） ---------- */
buildFixture();
let r = runPatch(SIGNED);
let g = read(GR);
results.push('== 场景 1：密钥齐全（exit ' + r.code + '）');
ok('退出码 0', r.code === 0, 'exit=' + r.code);
ok('build.gradle 里出现 2 处注入标记', count(g, /xwlb-signing-config/g) === 2, count(g, /xwlb-signing-config/g));
ok('android { 里插入了 signingConfigs', /android \{\s*\n\s*\/\/ xwlb-signing-config[\s\S]*?signingConfigs \{/.test(g));
ok('release 里挂上了 signingConfig', /buildTypes \{[\s\S]*?release \{[\s\S]*?signingConfig signingConfigs\.release/.test(g));
ok('签名信息全部走环境变量', count(g, /System\.getenv\('XWLB_KEY/g) === 4, count(g, /System\.getenv\('XWLB_KEY/g));
ok('versionName 取到 package.json 的版本（' + VERSION + '）', g.indexOf('versionName "' + VERSION + '"') > 0);
ok('versionCode 用环境变量的 42', /versionCode 42/.test(g));
ok('没有把明文密码写进 build.gradle', g.indexOf(PW) < 0);
ok('花括号配平', braces(g) === 0, 'balance=' + braces(g));
ok('signingConfigs 块只有 1 个', count(g, /signingConfigs \{/g) === 1, count(g, /signingConfigs \{/g));
ok('AndroidManifest 补上 7 条权限', count(read(MX), /<uses-permission/g) === 7, count(read(MX), /<uses-permission/g));
ok('strings.xml 应用名被改掉', read(SX).indexOf('想我了吧') > 0);

/* --- 场景 1b：XwlbSettings 原生插件（「去允许通知」能一键跳系统设置的关键） --- */
const p1 = read(JPLUG);
ok('生成了 XwlbSettingsPlugin.java', fs.existsSync(JPLUG));
ok('插件包名跟 MainActivity 一致（这样 MainActivity 不用 import）', p1.indexOf('package com.getcapacitor.myapp;') === 0);
ok('插件注册名是 XwlbSettings（页面靠 CAP.Plugins.XwlbSettings 找它）', p1.indexOf('@CapacitorPlugin(name = "XwlbSettings")') > 0);
ok('有 openSettings + isIgnoringBatteryOptimizations 两个方法',
    p1.indexOf('public void openSettings(PluginCall call)') > 0 &&
    p1.indexOf('public void isIgnoringBatteryOptimizations(PluginCall call)') > 0);
ok('两个方法都标了 @PluginMethod（否则 JS 调不到）', count(p1, /@PluginMethod/g) === 2, count(p1, /@PluginMethod/g));
ok('通知页直达 ACTION_APP_NOTIFICATION_SETTINGS', p1.indexOf('Settings.ACTION_APP_NOTIFICATION_SETTINGS') > 0);
ok('闹钟页直达 ACTION_REQUEST_SCHEDULE_EXACT_ALARM', p1.indexOf('Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM') > 0);
ok('电池页直达 ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', p1.indexOf('Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS') > 0);
ok('自启动页覆盖小米/华为/OPPO/vivo/三星/乐视 6 家', count(p1, /setClassName/g) === 6, count(p1, /setClassName/g));
ok('打不开时退回「应用详情」页', p1.indexOf('Settings.ACTION_APPLICATION_DETAILS_SETTINGS') > 0);
ok('插件里没有 __PKG__ 占位符残留', p1.indexOf('__PKG__') < 0);
ok('插件花括号配平', braces(p1) === 0, 'balance=' + braces(p1));
const ma1 = read(MA);
ok('MainActivity 里注册了插件', ma1.indexOf('registerPlugin(XwlbSettingsPlugin.class);') > 0);
ok('registerPlugin 排在 super.onCreate 之前（Bridge 起来时才认得它）',
    ma1.indexOf('registerPlugin(XwlbSettingsPlugin.class);') < ma1.indexOf('super.onCreate('));
ok('官方空模板被补上 onCreate，并 import 了 Bundle',
    /import android\.os\.Bundle;/.test(ma1) && /public void onCreate\(Bundle savedInstanceState\)/.test(ma1));
ok('MainActivity 花括号配平', braces(ma1) === 0, 'balance=' + braces(ma1));

/* ---------- 场景 2：幂等 ---------- */
const g1 = read(GR), m1 = read(MX), s1 = read(SX), j1 = read(JPLUG), a1 = read(MA);
r = runPatch(SIGNED);
results.push('== 场景 2：同参数再跑一遍（exit ' + r.code + '）');
ok('退出码 0', r.code === 0, 'exit=' + r.code);
ok('build.gradle 一字未变', read(GR) === g1);
ok('权限没重复添加', count(read(MX), /<uses-permission/g) === 7);
ok('AndroidManifest 未变', read(MX) === m1);
ok('strings.xml 未变', read(SX) === s1);
ok('XwlbSettingsPlugin.java 一字未变', read(JPLUG) === j1);
ok('MainActivity 未变（插件不重复注册）', read(MA) === a1 &&
    count(read(MA), /registerPlugin\(XwlbSettingsPlugin\.class\)/g) === 1,
    count(read(MA), /registerPlugin\(XwlbSettingsPlugin\.class\)/g) + ' 处');

/* ---------- 场景 3：versionCode 递增 ---------- */
r = runPatch(Object.assign({}, SIGNED, { XWLB_VERSION_CODE: '43' }));
results.push('== 场景 3：versionCode → 43（exit ' + r.code + '）');
ok('versionCode 变成 43 且没有旧值残留', /versionCode 43/.test(read(GR)) && !/versionCode 42/.test(read(GR)));
ok('签名块没被重复注入', count(read(GR), /signingConfigs \{/g) === 1);
ok('花括号配平', braces(read(GR)) === 0, 'balance=' + braces(read(GR)));

/* ---------- 场景 4：CI 强制签名但没密钥 → 必须失败 ---------- */
buildFixture();
r = runPatch({ XWLB_REQUIRE_SIGNING: '1', XWLB_VERSION_CODE: '44' });
results.push('== 场景 4：CI 模式缺密钥（exit ' + r.code + '）');
ok('退出码 1（fail fast，不会打出随机签名的包）', r.code === 1, 'exit=' + r.code);
ok('提示里点名需要的 Secrets', r.text.indexOf('ANDROID_KEYSTORE_BASE64') > 0);
ok('没有注入签名', read(GR).indexOf('xwlb-signing-config') < 0);
ok('versionName 仍被更新', read(GR).indexOf('versionName "' + VERSION + '"') > 0);

/* ---------- 场景 5：本地调试，不给任何变量 ---------- */
buildFixture();
r = runPatch({});
results.push('== 场景 5：本地调试无环境变量（exit ' + r.code + '）');
ok('退出码 0（本地仍可构建）', r.code === 0, 'exit=' + r.code);
ok('不注入签名', read(GR).indexOf('xwlb-signing-config') < 0);
ok('versionName 已同步', read(GR).indexOf('versionName "' + VERSION + '"') > 0);
ok('versionCode 保持模板值', /versionCode 1\b/.test(read(GR)));
ok('花括号配平', braces(read(GR)) === 0, 'balance=' + braces(read(GR)));

/* ---------- 场景 6：密钥文件不存在 → 必须失败 ---------- */
buildFixture();
r = runPatch(Object.assign({}, SIGNED, { XWLB_KEYSTORE_PATH: path.join(TMP, 'nope.jks') }));
results.push('== 场景 6：密钥文件不存在（exit ' + r.code + '）');
ok('退出码 1', r.code === 1, 'exit=' + r.code);
ok('报错里带上了路径', r.text.indexOf('nope.jks') > 0);

/* ---------- 场景 7：密码/别名不全 → 必须失败 ---------- */
buildFixture();
r = runPatch({ XWLB_KEYSTORE_PATH: FAKE_KS });
results.push('== 场景 7：密码别名不全（exit ' + r.code + '）');
ok('退出码 1', r.code === 1, 'exit=' + r.code);
ok('提示需要另外 3 个变量', r.text.indexOf('XWLB_KEYSTORE_PASSWORD') > 0);

/* ---------- 场景 8：MainActivity 已经有自己的 onCreate ---------- */
buildFixture(MAIN_ACTIVITY_CREATE);
r = runPatch(SIGNED);
results.push('== 场景 8：MainActivity 已有 onCreate（exit ' + r.code + '）');
ok('退出码 0', r.code === 0, 'exit=' + r.code);
const m8 = read(MA);
ok('插件注册进了现有 onCreate 的第一行',
    /onCreate\(Bundle savedInstanceState\) \{\s*\n\s*\/\/ xwlb-settings-plugin[\s\S]*?registerPlugin\(XwlbSettingsPlugin\.class\);/.test(m8));
ok('没有凭空多出第二个 onCreate', count(m8, /void onCreate\(/g) === 1, count(m8, /void onCreate\(/g));
ok('registerPlugin 仍在 super.onCreate 之前', m8.indexOf('registerPlugin(XwlbSettingsPlugin.class);') < m8.indexOf('super.onCreate('));
ok('原有 import 没被改乱', /^import android\.os\.Bundle;$/m.test(m8) && count(m8, /import android\.os\.Bundle;/g) === 1);
ok('花括号配平', braces(m8) === 0, 'balance=' + braces(m8));
r = runPatch(SIGNED);
ok('再跑一遍仍然是 1 处注册', count(read(MA), /registerPlugin\(XwlbSettingsPlugin\.class\)/g) === 1,
    count(read(MA), /registerPlugin\(XwlbSettingsPlugin\.class\)/g) + ' 处');

/* ---------- 场景 9：工程里没有 MainActivity.java → 必须失败 ---------- */
buildFixture();
fs.rmSync(path.join(TMP, 'android', 'app', 'src', 'main', 'java'), { recursive: true, force: true });
r = runPatch(SIGNED);
results.push('== 场景 9：没有 MainActivity.java（exit ' + r.code + '）');
ok('退出码 1（宁可打包失败，也不出一个点不开系统设置的包）', r.code === 1, 'exit=' + r.code);
ok('报错点名 MainActivity.java', r.text.indexOf('MainActivity.java') > 0);

fs.rmSync(TMP, { recursive: true, force: true });

results.forEach(function (l) { console.log(l); });
console.log('\nAndroid 补丁自检：' + pass + ' / ' + (pass + fail) +
    (fail ? '  有 ' + fail + ' 项失败 ❌' : '  全部通过 ✅'));
process.exit(fail ? 1 : 0);

