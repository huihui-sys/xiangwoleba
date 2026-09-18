/**
 * 想我了吧 · 组装打包目录
 * 用法：node scripts/build-www.js
 *
 * Capacitor 需要一个 webDir（这里用 www/），
 * 我们始终以根目录的 mood.html 为唯一源文件，复制到这个目录里再打包。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');

/* mood.html 就是整个 App；其它是 PWA 附属文件 */
const files = ['mood.html', 'manifest.webmanifest', 'icon.svg', 'sw.js'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

let n = 0;
files.forEach(function (f) {
    const from = path.join(root, f);
    if (!fs.existsSync(from)) {
        console.log('  · 跳过（不存在）：' + f);
        return;
    }
    fs.copyFileSync(from, path.join(out, f));
    n++;
    console.log('  ✔ ' + f);
});

/* WebView 默认加载 index.html，所以再放一份同内容的首屏 */
fs.copyFileSync(path.join(root, 'mood.html'), path.join(out, 'index.html'));
console.log('  ✔ index.html（mood.html 的副本，供 WebView 首屏加载）');

const kb = (fs.statSync(path.join(root, 'mood.html')).size / 1024).toFixed(1);
console.log('\nwww/ 组装完成，共 ' + (n + 1) + ' 个文件；mood.html 体积 ' + kb + ' KB');
