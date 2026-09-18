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

console.log(bad ? '\n检查结果：有 ' + bad + ' 个问题 ❌' : '\n检查结果：全部通过 ✅');
process.exit(bad ? 1 : 0);
