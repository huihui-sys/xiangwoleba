/**
 * 想我了吧 · 纯逻辑自检（Node 版）
 * 用法：node scripts/selftest.js
 *
 * 它把 mood.html 里 PURE_ENGINE_START / PURE_ENGINE_END 之间的纯逻辑抽出来在 Node 里跑，
 * 所以浏览器里点「今天」页看到的推荐、排程规则，和这里测的是同一份代码。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'mood.html');
const html = fs.readFileSync(file, 'utf8');
const m = html.match(/\/\* ==== PURE_ENGINE_START ==== \*\/([\s\S]*?)\/\* ==== PURE_ENGINE_END ==== \*\//);
if (!m) {
    console.error('✘ 在 mood.html 里找不到 PURE_ENGINE 标记，无法自检');
    process.exit(1);
}

const exported = [
    'CATS', 'BUILTIN', 'MOOD_W', 'COOL_MS', 'RECENT_N', 'LONG_LEN', 'MOOD_FACES', 'MOOD_TAGS',
    'pad2', 'catName', 'catEmoji', 'dateKey', 'hhmmToMin', 'minToHHMM', 'randInt',
    'expandBuiltin', 'moodOf', 'moodBand', 'moodStreak', 'weightedPick', 'pickCat',
    'recentIds', 'pickSentence', 'inQuiet', 'buildPlan', 'parseBulk', 'parseLines',
    'parseRange', 'filterRecords', 'cmpVersion', 'runSelfTest'
];
const factory = new Function(
    '"use strict";\n' + m[1] + '\n;return {' + exported.join(',') + '};'
);
const E = factory();

/* 和 mood.html 里 defaultState() 的初始值保持一致 */
function makeState() {
    return {
        settings: {
            appName: '想我了吧',
            dailyMax: 4,
            windows: [{ s: '08:00', e: '12:00' }, { s: '14:00', e: '18:00' }, { s: '21:00', e: '23:00' }],
            quiet: { s: '23:30', e: '07:30' },
            notify: true,
            vibrate: true,
            sound: true,
            paused: false
        },
        sentences: E.expandBuiltin(),
        records: {},
        cooldown: {},
        log: [],
        plan: [],
        planBuiltAt: 0
    };
}

const res = E.runSelfTest(makeState);
res.list.forEach(function (r) {
    console.log((r.ok ? '  ✔ ' : '  ✘ ') + r.name + (r.info ? '   [' + r.info + ']' : ''));
});
console.log('\n自检结果：' + res.pass + ' / ' + res.total + (res.allPass ? '  全部通过 ✅' : '  有失败项 ❌'));
process.exit(res.allPass ? 0 : 1);
