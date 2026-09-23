/**
 * 想我了吧 · Android 工程补丁
 * 用法：node scripts/patch-android.js（在 npx cap add android / cap sync 之后跑）
 *
 * Capacitor 生成的工程是临时的，所以这里用脚本补上：
 *   1. AndroidManifest.xml 里的通知 / 精确闹钟 / 开机自启权限
 *   2. values/strings.xml 里的应用名
 *   3. build.gradle 里的固定签名（密钥来自环境变量，见 README「固定签名」）
 *   4. build.gradle 里的 versionName / versionCode
 *   5. XwlbSettings 原生小插件（跳系统设置页 + 读电池优化状态），并在 MainActivity 里注册
 * 脚本是幂等的：重复跑不会加重复的权限，也不会重复注入签名块 / 插件注册。
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

/* ---------- 共用小工具 ---------- */
function writeIfChanged(file, text) {
    const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (old === text) { return 'keep'; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, 'utf8');
    return old === null ? 'new' : 'update';
}
function findFile(dir, name) {
    if (!fs.existsSync(dir)) { return null; }
    const stack = [dir];
    while (stack.length) {
        const cur = stack.pop();
        const items = fs.readdirSync(cur, { withFileTypes: true });
        for (const it of items) {
            const p = path.join(cur, it.name);
            if (it.isDirectory()) { stack.push(p); }
            else if (it.name === name) { return p; }
        }
    }
    return null;
}

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

/* ---------- 4. XwlbSettings：跳系统设置的小插件 ---------- */
/* Capacitor 自带的 LocalNotifications 只会弹一次权限框；被 Android 13+ 静默拒掉之后，
   页面就再也拿不到权限了 —— 而「通知开关 / 闹钟和提醒 / 电池不优化 / 自启动」这些开关
   全在系统设置里，网页端碰不到。所以注入一个几十行的原生插件，把用户直接送过去。
   插件缺失时页面会退回文字指引（mood.html 的 openSystemPage），功能不依赖它。 */
const JAVA_LINES = [
    'package __PKG__;',
    '',
    'import android.content.Context;',
    'import android.content.Intent;',
    'import android.net.Uri;',
    'import android.os.Build;',
    'import android.os.PowerManager;',
    'import android.provider.Settings;',
    '',
    'import com.getcapacitor.JSObject;',
    'import com.getcapacitor.Plugin;',
    'import com.getcapacitor.PluginCall;',
    'import com.getcapacitor.PluginMethod;',
    'import com.getcapacitor.annotation.CapacitorPlugin;',
    '',
    '/**',
    ' * 想我了吧 · 系统设置跳转插件（由 scripts/patch-android.js 自动生成，勿手工改）',
    ' *',
    ' * 为什么需要它：Android 的通知开关、闹钟和提醒、电池不优化、自启动都藏在系统设置里，',
    ' * 网页端够不着。Capacitor 的 LocalNotifications 只会弹一次权限框，被 Android 13+',
    ' * 静默拒掉之后就没有任何补救手段 —— 用户既收不到提醒，也不知道该去哪儿打开。',
    ' */',
    '@CapacitorPlugin(name = "XwlbSettings")',
    'public class XwlbSettingsPlugin extends Plugin {',
    '',
    '    /** 打开对应系统设置页：page = notify | exact | battery | auto | appdetails */',
    '    @PluginMethod',
    '    public void openSettings(PluginCall call) {',
    '        String page = call.getString("page", "notify");',
    '        try {',
    '            start(buildIntent(page));',
    '            JSObject ret = new JSObject();',
    '            ret.put("ok", true);',
    '            ret.put("page", page);',
    '            call.resolve(ret);',
    '        } catch (Exception e) {',
    '            /* 有些 ROM 把标准页面改没了：退回「应用详情」，至少用户能自己往下点 */',
    '            try {',
    '                start(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkgUri()));',
    '                JSObject ret = new JSObject();',
    '                ret.put("ok", true);',
    '                ret.put("page", "appdetails");',
    '                ret.put("fallback", true);',
    '                call.resolve(ret);',
    '            } catch (Exception e2) {',
    '                call.reject("打不开系统设置：" + e2.getMessage());',
    '            }',
    '        }',
    '    }',
    '',
    '    /** 电池优化有没有对本应用放行（放行了后台才不容易被掐掉） */',
    '    @PluginMethod',
    '    public void isIgnoringBatteryOptimizations(PluginCall call) {',
    '        boolean ignoring = false;',
    '        try {',
    '            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {',
    '                PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);',
    '                if (pm != null) {',
    '                    ignoring = pm.isIgnoringBatteryOptimizations(getContext().getPackageName());',
    '                }',
    '            } else {',
    '                ignoring = true;',
    '            }',
    '        } catch (Exception e) {',
    '            ignoring = false;',
    '        }',
    '        JSObject ret = new JSObject();',
    '        ret.put("ignoring", ignoring);',
    '        call.resolve(ret);',
    '    }',
    '',
    '    private Uri pkgUri() {',
    '        return Uri.parse("package:" + getContext().getPackageName());',
    '    }',

    '',
    '    private Intent buildIntent(String page) {',
    '        if ("exact".equals(page) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {',
    '            /* Android 12+：「闹钟和提醒」这个特殊权限页 */',
    '            return new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkgUri());',
    '        }',
    '        if ("battery".equals(page)) {',
    '            /* 申请「不优化电池」页面 */',
    '            return new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkgUri());',
    '        }',
    '        if ("auto".equals(page)) {',
    '            return autoStartIntent();',
    '        }',
    '        if ("notify".equals(page) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {',
    '            /* Android 8+：直达本应用的通知渠道列表（xwlb2 那个渠道在这里单独打开） */',
    '            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);',
    '            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());',
    '            return intent;',
    '        }',
    '        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkgUri());',
    '    }',
    '',
    '    /* 自启动管理页：各家 ROM 的 Activity 都不一样，挨个试，试不到就退回应用详情页 */',
    '    private Intent autoStartIntent() {',
    '        Intent[] list = new Intent[] {',
    '            new Intent().setClassName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),',
    '            new Intent().setClassName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),',
    '            new Intent().setClassName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),',
    '            new Intent().setClassName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),',
    '            new Intent().setClassName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"),',
    '            new Intent().setClassName("com.letv.android.letvsafe", "com.letv.android.letvsafe.AutobootManageActivity")',
    '        };',
    '        for (Intent intent : list) {',
    '            try {',
    '                if (getContext().getPackageManager().resolveActivity(intent, 0) != null) {',
    '                    return intent;',
    '                }',
    '            } catch (Exception e) {',
    '                /* 换下一个 ROM 试试 */',
    '            }',
    '        }',
    '        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkgUri());',
    '    }',
    '',
    '    private void start(Intent intent) {',
    '        if (intent == null) {',
    '            throw new IllegalStateException("没有可用的系统设置页");',
    '        }',
    '        if (getActivity() != null) {',
    '            getActivity().startActivity(intent);',
    '        } else {',
    '            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);',
    '            getContext().startActivity(intent);',
    '        }',
    '    }',
    '}',
    ''
];
const JAVA_SRC = JAVA_LINES.join('\n');

/* 写 Java 文件 + 在 MainActivity 里注册（registerPlugin 必须放在 super.onCreate() 之前，
   Bridge 在 onCreate 里才创建，插件注册得赶在那之前） */
const MARK_MA = '// xwlb-settings-plugin';
const javaRoot = path.join(root, 'android', 'app', 'src', 'main', 'java');
const mainActivity = findFile(javaRoot, 'MainActivity.java');
if (!mainActivity) {
    console.error('✘ 找不到 MainActivity.java（先执行 npx cap add android）');
    problems++;
} else {
    const maSrc = fs.readFileSync(mainActivity, 'utf8');
    const pmPkg = maSrc.match(/^\s*package\s+([\w.]+)\s*;/m);
    if (!pmPkg) {
        console.error('✘ MainActivity.java 里读不到 package，无法生成插件');
        problems++;
    } else {
        const pkg = pmPkg[1];
        /* 插件跟 MainActivity 放同一个包，MainActivity 里就不用额外 import 了 */
        const javaFile = path.join(path.dirname(mainActivity), 'XwlbSettingsPlugin.java');
        const howJava = writeIfChanged(javaFile, JAVA_SRC.replace(/__PKG__/g, pkg));
        console.log(howJava === 'keep'
            ? '  · XwlbSettingsPlugin.java：已是最新（包名 ' + pkg + '）'
            : '  ✔ XwlbSettingsPlugin.java：' + (howJava === 'new' ? '已生成' : '已更新') + '（包名 ' + pkg + '）');

        if (maSrc.indexOf('XwlbSettingsPlugin.class') >= 0) {
            console.log('  · MainActivity.java：插件已注册，幂等跳过');
        } else if (maSrc.indexOf('extends BridgeActivity') < 0) {
            console.error('✘ MainActivity.java 不像 Capacitor 模板（没有 extends BridgeActivity）');
            problems++;
        } else {
            let ma = maSrc;
            if (!/import\s+android\.os\.Bundle\s*;/.test(ma)) {
                ma = ma.replace(/^(package\s+[\w.]+\s*;)/m, '$1\n\nimport android.os.Bundle;');
            }
            const call = '        ' + MARK_MA + '：注册「跳系统设置」插件（由 scripts/patch-android.js 注入）\n' +
                '        registerPlugin(XwlbSettingsPlugin.class);\n';
            const onC = ma.match(/void\s+onCreate\s*\(\s*Bundle[^)]*\)\s*\{/);
            if (onC) {
                ma = ma.replace(onC[0], onC[0] + '\n' + call);
            } else {
                /* 官方模板的 MainActivity 是个空类，这里给它补一个 onCreate */
                const at = ma.lastIndexOf('}');
                ma = ma.slice(0, at) +
                    '\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n' + call +
                    '        super.onCreate(savedInstanceState);\n    }\n' + ma.slice(at);
            }
            const howMa = writeIfChanged(mainActivity, ma);
            console.log(howMa === 'keep'
                ? '  · MainActivity.java：无需修改'
                : '  ✔ MainActivity.java：已注册 XwlbSettings 插件' + (onC ? '（挂在现有 onCreate 里）' : '（新建了 onCreate）'));
        }
    }
}

console.log(problems ? '\n补丁结果：有 ' + problems + ' 个问题 ❌' : '\n补丁结果：完成 ✅');
process.exit(problems ? 1 : 0);
