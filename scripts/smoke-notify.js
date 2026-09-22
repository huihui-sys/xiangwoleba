/**
 * 想我了吧 · 通知/排程冒烟测试
 * 用法：node scripts/smoke-notify.js
 *
 * 它把 mood.html 里真实的排程代码（mineNotifs / cancelNative / renderPending / pushNative）、
 * 时段分配预览（renderWinShare）和统计柱（renderTrend）原样抽出来，
 * 配一个「假系统闹钟」和假的 DOM 跑一遍，专门守住 v1.3.0 修掉的三件事：
 *   1. 对账式排程：先 schedule（同 id 覆盖）再 cancel 多出来的；排程失败时原有的闹钟不能被清空；
 *   2. 「开启通知」开关关掉后系统里一条都不留；
 *   3. 统计柱高度严格 = 分数 / 5（3 分 60% 与 5 分 100% 不再一样高），且柱子有独立轨道。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'mood.html'), 'utf8');

const eng = html.match(/\/\* ==== PURE_ENGINE_START ==== \*\/([\s\S]*?)\/\* ==== PURE_ENGINE_END ==== \*\//)[1];
const E = new Function('"use strict";\n' + eng + '\n;return { activeWindows: activeWindows, slotShare: slotShare, quietClash: quietClash, dateKey: dateKey, pad2: pad2, PLAN_MAX: PLAN_MAX };')();

/* 新增的应用层代码：从 mineNotifs 一直到「渲染」标题，原样抽取（不是手抄） */
const s1 = html.indexOf('        function mineNotifs(res) {');
const s2 = html.indexOf('        /* ================= 渲染 ================= */');
if (s1 < 0 || s2 < 0 || s2 <= s1) { throw new Error('抽不到排程代码，检查锚点'); }
const slice = html.slice(s1, s2);

/* renderWinShare 在「设置」区，单独抽 */
const w1 = html.indexOf('        /* 时段分配规则预览');
const w2 = html.indexOf('        function renderWindows() {');
if (w1 < 0 || w2 < 0 || w2 <= w1) { throw new Error('抽不到 renderWinShare，检查锚点'); }
const shareSrc = html.slice(w1, w2);

/* renderTrend（统计柱）单独抽 */
const t1 = html.indexOf('        function renderTrend() {');
const t2 = html.indexOf('        function saveMood() {');
if (t1 < 0 || t2 < 0 || t2 <= t1) { throw new Error('抽不到 renderTrend，检查锚点'); }
const trendSrc = html.slice(t1, t2);

const els = {};
const ctx = {
    console: console, Date: Date, Math: Math, Promise: Promise, String: String, Number: Number, JSON: JSON,
    setTimeout: setTimeout,
    NATIVE: true,
    CHANNEL_ID: 'xwlb',
    PLAN_MAX: E.PLAN_MAX,
    activeWindows: E.activeWindows,
    slotShare: E.slotShare,
    quietClash: E.quietClash,
    dateKey: E.dateKey,
    pad2: E.pad2,
    ensureChannel: function () { },
    $: function (id) { return els[id] || (els[id] = { id: id, textContent: '', dataset: {} }); },
    state: null
};
ctx.global = ctx;
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(slice + '\n' + shareSrc + '\n' + trendSrc +
    '\nthis.API = { pushNative: pushNative, renderPending: renderPending, renderWinShare: renderWinShare, cancelNative: cancelNative };' +
    '\nthis.TREND = renderTrend;', ctx);

/* ---- 假系统闹钟 ---- */
let system = new Map();
let calls = [];
let failNext = false;
ctx.LocalNotif = {
    schedule: function (p) {
        calls.push('schedule:' + p.notifications.length);
        if (failNext) { failNext = false; return Promise.reject(new Error('模拟排程失败')); }
        p.notifications.forEach(function (n) { system.set(n.id, n.schedule.at.getTime()); });
        return Promise.resolve();
    },
    getPending: function () {
        var out = [];
        system.forEach(function (at, id) { out.push({ id: id, schedule: { at: new Date(at) } }); });
        return Promise.resolve({ notifications: out });
    },
    cancel: function (p) {
        calls.push('cancel:[' + p.notifications.map(function (n) { return n.id; }).join(',') + ']');
        p.notifications.forEach(function (n) { system.delete(n.id); });
        return Promise.resolve();
    }
};

function planProp(n) {
    const now = Date.now();
    const out = [];
    for (let i = 0; i < n; i++) { out.push({ at: now + (i + 1) * 3600000, text: '第' + (i + 1) + '句', cat: 'comfort', sid: 's' + i, fired: false }); }
    return out;
}
function makeState(notify) {
    return {
        settings: {
            appName: '想我了吧', dailyMax: 4,
            windows: [{ s: '08:00', e: '12:00' }, { s: '14:00', e: '18:00' }, { s: '21:00', e: '23:00' }],
            quiet: { s: '23:30', e: '07:30' }, notify: notify, paused: false
        },
        plan: planProp(3)
    };
}
const wait = () => new Promise(function (r) { setTimeout(r, 40); });
let bad = 0;
function ok(name, cond, info) {
    if (!cond) { bad++; }
    console.log((cond ? '  ✔ ' : '  ✘ ') + name + (info ? '   [' + info + ']' : ''));
}
function idsInSystem() { return Array.from(system.keys()).join(','); }

(async function () {
    /* 场景 1：正常排程 → 系统里正好 3 条，且设置页显示真实条数 */
    ctx.state = makeState(true);
    calls = []; system = new Map();
    ctx.API.pushNative();
    await wait();
    ok('排程后系统里正好 3 条', idsInSystem() === '1,2,3', idsInSystem());
    ok('调用顺序是「先排、后清」', calls[0] === 'schedule:3', calls.join(' | '));
    ok('没有多余的 cancel', calls.filter(function (c) { return c.indexOf('cancel') === 0; }).length === 0, calls.join(' | '));
    ok('设置页显示「系统里待发 3 条」', /系统里待发 3 条/.test(els.pendingState.textContent), els.pendingState.textContent);
    ok('首页提示写进了 schedNote', /已把 3 条排进系统闹钟/.test(els.schedNote.textContent), els.schedNote.textContent);

    /* 场景 2：系统里有旧的 5 条、新计划只有 3 条 → 只清掉多出来的 4、5（对账） */
    system = new Map([[1, Date.now()], [2, Date.now()], [3, Date.now()], [4, Date.now()], [5, Date.now()]]);
    system.set(990001, Date.now());   /* 「30 秒后测试」那条，绝不能误伤 */
    calls = [];
    ctx.API.pushNative();
    await wait();
    ok('旧闹钟被清成和计划一致（1,2,3 + 测试那条）', idsInSystem() === '1,2,3,990001', idsInSystem());
    ok('只 cancel 了多出来的 4,5', calls.indexOf('cancel:[4,5]') >= 0, calls.join(' | '));
    ok('测试通知（99 万号）没被误删', system.has(990001));

    /* 场景 3（核心回归）：排程失败时，系统里原有的闹钟不能被清空 */
    system = new Map([[1, Date.now()], [2, Date.now()], [3, Date.now()]]);
    calls = [];
    failNext = true;
    ctx.API.pushNative();
    await wait();
    ok('排程失败后系统里仍是原来的 3 条（不是一条不剩）', idsInSystem() === '1,2,3', idsInSystem());
    ok('排程失败时没有调用 cancel', calls.indexOf('cancel:[1,2,3]') < 0 && calls.length === 1, calls.join(' | '));
    ok('失败信息写进了 schedNote', /排程失败/.test(els.schedNote.textContent), els.schedNote.textContent);

    /* 场景 4：关掉「开启通知」→ 清空系统闹钟 + 状态写 0 */
    ctx.state = makeState(false);
    system = new Map([[1, Date.now()], [2, Date.now()], [3, Date.now()]]);
    calls = [];
    els.pendingState.textContent = '';
    ctx.API.pushNative();
    await wait();
    ok('关掉开关后系统里一条不剩', idsInSystem() === '', idsInSystem());
    ok('关掉开关时不会再 schedule', calls.filter(function (c) { return c.indexOf('schedule') === 0; }).length === 0, calls.join(' | '));
    ok('设置页提示已关掉主动提醒', /已关掉主动提醒/.test(els.pendingState.textContent), els.pendingState.textContent);
    ok('首页提示写明系统里不会留提醒', /不会留下提醒/.test(els.schedNote.textContent), els.schedNote.textContent);

    /* 场景 5：时段分配预览文案 */
    ctx.state = makeState(true);
    els.pendingState && (els.pendingState.textContent = '');
    ctx.$('winShare').textContent = '';
    ctx.API.renderWinShare();
    ok('预览写明每天句数和每段条数', /每天 4 句/.test(els.winShare.textContent) && /第 1 段 2 句/.test(els.winShare.textContent), els.winShare.textContent);
    ctx.state.settings.windows = [{ s: '01:00', e: '05:00' }, { s: '09:00', e: '11:00' }, { s: '14:00', e: '18:00' }];
    ctx.API.renderWinShare();
    ok('整段落在安静时段时给出 ⚠️ 提示', /⚠️ 第 1 段/.test(els.winShare.textContent), els.winShare.textContent);

    /* 场景 6：统计柱高度严格按分数（v1.3.0 修的「3 分和 5 分一样高」） */
    const recs = {};
    [5, 4, 3, 2, 1, 0, 0].forEach(function (v, i) {
        const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i));
        if (v) { recs[E.dateKey(d.getTime())] = { mood: v, tags: [], note: '' }; }
    });
    ctx.state = { settings: {}, records: recs };
    ctx.$('trendBars').innerHTML = '';
    ctx.TREND();
    const bars = els.trendBars.innerHTML;
    ok('每根柱子都套了独立轨道 div.track（高度才不被压扁）', (bars.match(/<div class="track">/g) || []).length === 7,
        (bars.match(/<div class="track">/g) || []).length + ' 根');
    const hs = [];
    bars.replace(/height:([\d.]+)%/g, function (m, n) { hs.push(parseFloat(n)); return m; });
    ok('高度 = 分数 / 5（5→100.0% 4→80.0% 3→60.0% 2→40.0% 1→20.0%）',
        hs.slice(0, 5).join(',') === '100,80,60,40,20', hs.join(','));
    ok('3 分柱（60%）比 5 分柱（100%）矮 40 个百分点，不再一样高', hs[0] - hs[2] === 40, hs[0] + ' - ' + hs[2]);
    ok('没打卡的那两天是 b none 且只有 6% 一点灰', /class="b none"><div class="track"><i style="height:6.0%"/.test(bars) &&
        (bars.match(/class="b none"/g) || []).length === 2, (bars.match(/class="b none"/g) || []).length + ' 天');
    ok('统计文案仍然正常', /打卡 5 天/.test(els.trendStat.textContent), els.trendStat.textContent);

    console.log('\n冒烟结果：' + (bad ? bad + ' 项失败 ❌' : '全部通过 ✅'));
    process.exit(bad ? 1 : 0);
})();
