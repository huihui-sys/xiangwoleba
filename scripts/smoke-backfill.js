/**
 * 想我了吧 · 补打卡 / 本月格子冒烟测试
 * 用法：node scripts/smoke-backfill.js
 *
 * 它把 mood.html 里真实的补记 / 本月格子代码（writeRecord → renderMonth）原样抽出来，配一个最小的假 DOM 跑一遍，
 * 专门守住 v1.5.0 这几件事：
 *   1. 补记日期范围锁在「今天往前 BACKFILL_MAX_DAYS 天」之间，未来选不了；
 *   2. 补记写进 state.records[那天]，带 filled 标记（今天的记录不带，和直接打卡一致）；
 *   3. 补「过去的日子」绝不重排通知计划（rebuildPlan / rollSentence 一次都不能被调用）；
 *   4. 补「今天」才按直接打卡处理（重排通知）；
 *   5. 补不了的日子（未来 / 太久以前）保存按钮禁用、硬保存也会被拦下，不写脏数据；
 *   6. 补记之后连续打卡天数立刻跟着 +1，本月格子同步刷新。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'mood.html'), 'utf8');

/* 纯逻辑区：补记范围 / 日期加减 / 本月格子 / 连续天数 */
const eng = html.match(/\/\* ==== PURE_ENGINE_START ==== \*\/([\s\S]*?)\/\* ==== PURE_ENGINE_END ==== \*\//)[1];
const E = new Function('"use strict";\n' + eng + '\n;return {' +
    'foodOf: foodOf, backfillOk: backfillOk, dayKeyShift: dayKeyShift, monthGrid: monthGrid, monthCn: monthCn,' +
    'checkinStreakFrom: checkinStreakFrom, BACKFILL_MAX_DAYS: BACKFILL_MAX_DAYS, WEEK_CN: WEEK_CN,' +
    'MOOD_FACES: MOOD_FACES, MOOD_TAGS: MOOD_TAGS, dateKey: dateKey };')();

/* 应用层：从 writeRecord 一直到「全部打卡记录」之前，原样抽取（不是手抄） */
const b1 = html.indexOf('        /* 写入一天的打卡记录：今天和补记共用一个入口，补记的带 filled 标记 */');
const b2 = html.indexOf('        /* 全部打卡记录：可按日期找');
if (b1 < 0 || b2 < 0 || b2 <= b1) { throw new Error('抽不到补记代码，检查锚点'); }
const slice = html.slice(b1, b2);

/* ---- 最小假 DOM：只做到这些代码用得到的那几步 ---- */
function el(id) {
    const e = {
        id: id, textContent: '', innerHTML: '', value: '', disabled: false, min: '', max: '',
        children: [],
        classList: { toggle: function () { }, add: function () { }, remove: function () { }, contains: function () { return false; } },
        getElementsByTagName: function () { return e.children; },
        getAttribute: function () { return null; }
    };
    return e;
}
const els = {};
const calls = { rebuildPlan: 0, rollSentence: 0, renderCheckin: 0, save: 0, closeSheet: 0, toast: [], sheet: '' };
const ctx = {
    console: console, Date: Date, Math: Math, JSON: JSON, String: String, Number: Number, parseInt: parseInt,
    MOOD_FACES: E.MOOD_FACES, MOOD_TAGS: E.MOOD_TAGS, WEEK_CN: E.WEEK_CN, BACKFILL_MAX_DAYS: E.BACKFILL_MAX_DAYS,
    foodOf: E.foodOf, backfillOk: E.backfillOk, dayKeyShift: E.dayKeyShift, monthGrid: E.monthGrid, monthCn: E.monthCn,
    checkinStreakFrom: E.checkinStreakFrom, dateKey: E.dateKey,
    esc: function (s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
    $: function (id) { return els[id] || (els[id] = el(id)); },
    state: { records: {} },
    save: function () { calls.save++; },
    closeSheet: function () { calls.closeSheet++; },
    openSheet: function (h) { calls.sheet = h; },
    renderCheckin: function () { calls.renderCheckin++; },
    rebuildPlan: function () { calls.rebuildPlan++; },
    rollSentence: function () { calls.rollSentence++; },
    toast: function (m) { calls.toast.push(m); }
};
ctx.global = ctx;
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(slice +
    '\nthis.API = { openBackfillSheet: openBackfillSheet, saveBackfill: saveBackfill, renderMonth: renderMonth,' +
    ' writeRecord: writeRecord, selectBfDay: selectBfDay, setMonOffset: function (v) { monOffset = v; },' +
    ' streak: function () { return checkinStreakFrom(state.records, dateKey(Date.now())); } };', ctx);

let pass = 0, total = 0;
function ok(name, cond, info) {
    total++;
    if (cond) { pass++; }
    console.log((cond ? '  ✔ ' : '  ✘ ') + name + (info === undefined ? '' : '   [' + info + ']'));
}
/* 模拟点按钮：真实代码里是 e.target.closest('button') + getAttribute('data-xxx') */
function tap(elx, attr, val) {
    const btn = {
        getAttribute: function (n) { return n === attr ? val : null; },
        classList: { toggle: function () { } }
    };
    elx.onclick({ target: { closest: function () { return btn; } } });
}

const today = E.dateKey(Date.now());
const yest = E.dayKeyShift(today, -1);

/* 场景 1：打开补记 —— 日期范围锁死在最近 BACKFILL_MAX_DAYS 天，选不了未来 */
ctx.API.openBackfillSheet(yest);
ok('打开补记时默认选中点的那天', els.bfDate.value === yest, els.bfDate.value);
ok('最早只能选到今天往前 ' + E.BACKFILL_MAX_DAYS + ' 天',
    calls.sheet.indexOf('min="' + E.dayKeyShift(today, -E.BACKFILL_MAX_DAYS) + '"') >= 0, els.bfDate.min || '（写在弹层 HTML 里）');
ok('最晚只能选到今天（选不了未来）',
    calls.sheet.indexOf('max="' + today + '"') >= 0, els.bfDate.max || '（写在弹层 HTML 里）');
ok('弹层里有「昨天 / 前天 / 三天前」三个快捷入口', (calls.sheet.match(/data-bf=/g) || []).length === 3,
    (calls.sheet.match(/data-bf=/g) || []).length + ' 个');
ok('没打过卡的那天提示「补上就好」', /补上就好/.test(els.bfHint.textContent), els.bfHint.textContent);
ok('保存按钮可用', els.bfSave.disabled === false);

/* 场景 2：选心情 + 写备注 → 保存（模拟真实点击） */
tap(els.bfMood, 'data-mood', '4');
ok('点了 4 分心情后那个按钮被选中', /data-mood="4" class="on"/.test(els.bfMood.innerHTML), els.bfMood.innerHTML.slice(0, 48));
els.bfNote.value = '那天陪我妈去医院';
ctx.API.saveBackfill();
ok('记录写进了补的那天', !!ctx.state.records[yest] && ctx.state.records[yest].mood === 4,
    JSON.stringify(ctx.state.records[yest]));
ok('补记的记录带 filled 标记（和历史列表的 🖊 对得上）', ctx.state.records[yest].filled === 1);
ok('备注一起存下来了', ctx.state.records[yest].note === '那天陪我妈去医院');
ok('补过去的日子不重排通知计划（rebuildPlan / rollSentence 都没动）',
    calls.rebuildPlan === 0 && calls.rollSentence === 0,
    'rebuildPlan=' + calls.rebuildPlan + ' rollSentence=' + calls.rollSentence);
ok('保存后自动收起弹层并刷新打卡页', calls.closeSheet === 1 && calls.renderCheckin === 1);
ok('落盘调用了 save()（不是只改内存）', calls.save >= 1, calls.save);

/* 场景 3：连续打卡天数跟着变（今天 + 补的昨天 = 2） */
ctx.API.writeRecord(today, 3, [], '');
ok('补记之后连续打卡天数 = 2', ctx.API.streak() === 2, ctx.API.streak());

/* 场景 4：补「今天」= 直接打卡，要重排通知，且不带补记标记 */
calls.rebuildPlan = 0; calls.rollSentence = 0;
ctx.API.openBackfillSheet(today);
tap(els.bfMood, 'data-mood', '5');
ctx.API.saveBackfill();
ok('补今天的心情报会重排通知（和直接打卡一致）', calls.rebuildPlan === 1 && calls.rollSentence === 1,
    'rebuildPlan=' + calls.rebuildPlan + ' rollSentence=' + calls.rollSentence);
ok('今天的记录不带 filled 标记', !ctx.state.records[today].filled, JSON.stringify(ctx.state.records[today]));

/* 场景 5：补不了的日子 —— 按钮禁用 + 硬保存被拦下 */
const tooOld = E.dayKeyShift(today, -(E.BACKFILL_MAX_DAYS + 1));
ctx.API.openBackfillSheet(tooOld);
ok('太久以前的那天保存按钮被禁用', els.bfSave.disabled === true);
ok('太久以前给出原因', new RegExp('只能补最近 ' + E.BACKFILL_MAX_DAYS + ' 天').test(els.bfHint.textContent), els.bfHint.textContent);
const before = JSON.stringify(ctx.state.records);
calls.toast = [];
ctx.API.saveBackfill();
ok('硬保存也会被拒绝，不写脏数据',
    JSON.stringify(ctx.state.records) === before && /只能补最近/.test(calls.toast[0] || ''), calls.toast[0] || '');
const future = E.dayKeyShift(today, 1);
ctx.API.openBackfillSheet(future);
ok('明天补不了（不能提前打卡）', els.bfSave.disabled === true && /不能提前打卡/.test(els.bfHint.textContent), els.bfHint.textContent);
ok('未来那天没有被写进记录', !ctx.state.records[future]);

/* 场景 6：打开已打卡的那天 → 读回原值、提示可以改 */
ctx.API.openBackfillSheet(yest);
ok('打开已打卡的那天会读回原记录', els.bfNote.value === '那天陪我妈去医院', els.bfNote.value);
ok('提示「可以改」而不是「补上就好」', /可以改/.test(els.bfHint.textContent), els.bfHint.textContent);

/* 场景 7：本月格子渲染 */
ctx.API.renderMonth();
const grid = els.monGrid.innerHTML;
ok('表头是周一到周日 7 列', (els.monHead.innerHTML.match(/class="w"/g) || []).length === 7);
ok('标题写的是「这个月」', /这个月/.test(els.monTitle.textContent), els.monTitle.textContent);
ok('打过卡的那天渲染成食物图案（🍰 = 4 分）', grid.indexOf('🍰') >= 0);
ok('补记过的那天带 🖊 标记', grid.indexOf('🖊') >= 0);
ok('还有能补的虚线淡格（点它就补记）', /class="d miss" data-day="/.test(grid));
const m = grid.match(/class="d miss" data-day="([\d-]+)"/);
ok('虚线格带具体日期，且落在可补范围内',
    !!m && E.backfillOk(m[1], today, E.BACKFILL_MAX_DAYS).ok === true, m && m[1]);
ok('统计行写明打卡天数和还缺几天', /打卡 2 天/.test(els.monStat.textContent), els.monStat.textContent);
/* 翻到上个月：太早的日子是压暗的 off，点不动 */
ctx.API.setMonOffset(-1);
ctx.API.renderMonth();
const prevGrid = els.monGrid.innerHTML;
ok('上个月里有补不了的 off 格子', /class="d off"/.test(prevGrid));
ok('off 格子不是按钮（没有 data-day，点不动）', !/class="d off" data-day/.test(prevGrid));
ok('上个月标题不写「这个月」', !/这个月/.test(els.monTitle.textContent), els.monTitle.textContent);
ctx.API.setMonOffset(0);

/* 场景 8：接线检查（这些绑定在 init 里，不在抽取切片内，只能查源码） */
ok('格子图 / 翻月按钮已经接线',
    /\$\('monGrid'\)\.onclick/.test(html) && /\$\('btnMonPrev'\)\.onclick/.test(html) && /\$\('btnMonNext'\)\.onclick/.test(html));
ok('历史记录的「补记 / 改」接线时带上 fromHist（关掉能回到记录页）',
    /openBackfillSheet\(b\.getAttribute\('data-fill'\), true\)/.test(html));
ok('打卡页里有本月格子卡（monGrid / monTitle / monStat）',
    /id="monGrid"/.test(html) && /id="monTitle"/.test(html) && /id="monStat"/.test(html));

console.log('\n补打卡冒烟结果：' + pass + ' / ' + total + (pass === total ? '  全部通过 ✅' : '  有失败项 ❌'));
process.exit(pass === total ? 0 : 1);
