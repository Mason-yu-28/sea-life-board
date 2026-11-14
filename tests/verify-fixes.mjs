// v2.8.6 修复项的回归验证。每一条都对应 AUDIT-03 里的一条缺陷。
// 用法：node tests/verify-fixes.mjs
import { chromium } from 'playwright-core';
import path from 'node:path';

const EDGE = process.env.SEA_EDGE ||
  (process.platform === 'win32'
    ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    : '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
const FILE = 'file:///' + path.resolve(process.env.SEA_FILE || 'Sea-2.8.html').replace(/\\/g, '/');
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  ok ? pass++ : fail++;
}

const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(FILE);
await page.waitForTimeout(1000);

// ——— 1. 首启必须是干净空白盘（v2.9 起示例数据整块移除）
// 依赖种子数据的断言在 v2.9 一并作废：现在造一份自己的夹具，验证「写入 → 刷新 → 原样读回」。
const blank = await page.evaluate(() => {
  const raw = localStorage.getItem('sea_workspace_v1');
  const d = raw ? JSON.parse(raw) : null;
  return {
    stored: !!d,
    anyContent: d ? Object.values(d).some(v => Array.isArray(v) && v.length > 0) : false,
    islands: d ? (d.islands || []).length : 0,
  };
});
check('首启 · 没有任何示例内容', blank.anyContent === false && blank.islands === 0, JSON.stringify(blank));

const roundtrip = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('sea_workspace_v1'));
  d.islands = [{ id: 'il-a', name: '夹具岛屿', rarity: '紫', sea: '成长', type: '修行', desc: '', status: '进行中' }];
  d.grows = [{ id: 'g-a', date: '2026-10-20', dur: 30, content: '夹具投入', goalId: 'il-a' }];
  localStorage.setItem('sea_workspace_v1', JSON.stringify(d));
  return true;
});
const pageA = await ctx.newPage();
await pageA.goto(FILE);
await pageA.waitForTimeout(900);
const rt = await pageA.evaluate(() => {
  return { grows: grows.length, goalId: grows[0] && grows[0].goalId, islands: islands.length };
});
await pageA.close();
check('存档往返 · 岛屿与投入流水原样读回', rt.grows === 1 && rt.goalId === 'il-a' && rt.islands === 1, JSON.stringify(rt));

// ——— 2. 存档有效性不再依赖白名单
const va = await page.evaluate(() => ({
  onlyRoutes: validArchive({ routes: [{ id: 'rt-1', cards: [] }] }),
  onlySavings: validArchive({ savings: [{ id: 's1' }] }),
  onlyNorthStar: validArchive({ northStar: '一句话' }),
  empty: validArchive({}),
  metaOnly: validArchive({ savedAt: 123, blankStart: false }),
  blank: validArchive({ blankStart: true }),
  notObj: validArchive(null),
}));
check('存档判断 · 只有航线也算有效存档', va.onlyRoutes === true, JSON.stringify(va));
check('存档判断 · 只有储蓄任务也算有效', va.onlySavings === true, '');
check('存档判断 · 真空白仍判无效', va.empty === false && va.metaOnly === false, '');
check('存档判断 · 主动清空(blankStart)仍有效', va.blank === true, '');

// ——— 3. 附件分片：大件优先 + 超限报错
const pack = await page.evaluate(() => {
  const L = 600 * 1024;
  const m = {};
  m['collects:big'] = 'x'.repeat(L - 200);
  m['collects:mid'] = 'y'.repeat(300 * 1024);
  m['collects:small'] = 'z'.repeat(10 * 1024);
  const r = packAssets(m);
  const used = r.buckets.map(b => Object.keys(b).length);
  const tooBig = packAssets({ 'collects:huge': 'q'.repeat(2 * 1024 * 1024) });
  return { used, overflow: r.overflow, tooBigOverflow: tooBig.overflow };
});
check('附件分片 · 大件先放，不浪费第 0 片', pack.used[0] === 1 && pack.used[1] === 2, '各片条目数 ' + JSON.stringify(pack.used));
check('附件分片 · 正常容量不误报溢出', pack.overflow.length === 0, JSON.stringify(pack.overflow));
check('附件分片 · 单张超上限被记录为溢出而不是静默塞入', pack.tooBigOverflow.length === 1, JSON.stringify(pack.tooBigOverflow));

// ——— 4. 导出备份必须带附件；导入必须还原附件
await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('sea_workspace_v1'));
  d.collects = d.collects || [];
  d.collects.push({ id: 'cl-test', name: '测试封面', cat: '影音', cover: null });
  localStorage.setItem('sea_workspace_v1', JSON.stringify(d));
  localStorage.setItem('sea_assets_v1', JSON.stringify({ 'collects:cl-test': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' }));
});
await page.reload();
await page.waitForTimeout(900);

const exported = await page.evaluate(() => {
  openDataExport();
  const ta = document.querySelector('.dm-modal .dm-json');
  const raw = ta ? ta.value : '';
  document.querySelectorAll('.dm-modal').forEach(m => (m.closest('.modal-mask') || m).remove());
  return { len: raw.length, hasAssets: raw.indexOf('__assets') >= 0, hasDataUrl: raw.indexOf('data:image') >= 0 };
});
check('导出备份 · 文件里带上了附件', exported.hasAssets && exported.hasDataUrl, '导出 ' + exported.len + ' 字节');

const imported = await page.evaluate(async () => {
  openDataExport();
  const ta = document.querySelector('.dm-modal .dm-json');
  const raw = ta.value;
  document.querySelectorAll('.dm-modal').forEach(m => (m.closest('.modal-mask') || m).remove());
  applyImported(JSON.parse(raw));
  const a = localStorage.getItem('sea_assets_v1');
  const m = localStorage.getItem('sea_workspace_v1');
  return { assetHasKey: a.indexOf('collects:cl-test') >= 0, mainClean: m.indexOf('__assets') < 0 };
});
check('导入恢复 · 附件写回 sea_assets_v1', imported.assetHasKey, '');
check('导入恢复 · 主存档里不留 __assets 键', imported.mainClean, '');

// ——— 5. finYear 能跨刷新恢复（原来 hydrate 的键表漏了它）
// 用新页面 + addInitScript 预置存档：不能先改 localStorage 再 reload ——
// reload 会触发 beforeunload → persist，用内存里的旧状态把刚写的覆盖掉（这是上一次误判的原因）。
const page2 = await ctx.newPage();
await page2.addInitScript(() => {
  try {
    const raw = localStorage.getItem('sea_workspace_v1');
    if (!raw) return;
    const d = JSON.parse(raw);
    d.finYear = 2025; d.finChartMode = 'Y';
    localStorage.setItem('sea_workspace_v1', JSON.stringify(d));
  } catch (e) {}
});
await page2.addInitScript(() => { window.__presetDone = true; });
await page2.goto(FILE);
await page2.waitForTimeout(1000);
const year = await page2.evaluate(() => {
  document.querySelector('[data-nav="finance"]').click();
  const seg = document.getElementById('finYearSeg');
  return seg ? seg.innerText.replace(/\s+/g, ' ').trim() : '(没有年份切换条)';
});
check('状态恢复 · finYear 刷新后不回到今年', year.indexOf('2025') >= 0, '年份条：' + year);
await page2.close();

// ——— 6. 存储探针失败不缓存（localStorage 的方法不能被覆写，只能静态核对实现）
import fs from 'node:fs';
const src = fs.readFileSync(process.env.SEA_FILE || 'Sea-2.8.html', 'utf8');
const probeSrc = (src.match(/function storeProbe\(\)\{[\s\S]*?\n\}/) || [''])[0];
check('存储探针 · 只在成功时缓存结果', /if\(_storeOK===true\) return true/.test(probeSrc) && !/_storeOK!==null/.test(probeSrc),
  probeSrc ? '实现已改为「成功才缓存」' : '没找到 storeProbe');

// ——— 6.5 财务海域（v2.11.0）
// 导入账单的「取消」曾经点了没反应：它的 id 和岛屿卡弹窗的取消按钮撞了车，
// getElementById 拿到的是别人家那个，真正那个从头到尾没被绑过。
const cancel = await page.evaluate(() => {
  document.querySelector('[data-nav="finance"]').click();
  document.getElementById('importBill').click();
  const opened = document.querySelectorAll('.fin-import-modal').length;
  const btn = [...document.querySelectorAll('.fin-import-modal .modal-foot button')]
    .find(b => b.textContent.trim() === '取消');
  if (btn) btn.click();
  return { opened, left: document.querySelectorAll('.fin-import-modal').length };
});
check('导入账单 · 取消能关掉弹窗', cancel.opened === 1 && cancel.left === 0,
  `打开 ${cancel.opened} 个 → 取消后 ${cancel.left} 个`);

// 消费曲线「月内」翻月：翻到上个月 → 天数/合计跟着走 → 翻回本月且不能继续往后
const mon = await page.evaluate(() => {
  const d = new Date();
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const pd = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const prev = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`;
  const seg = document.getElementById('finMonthSeg');
  if (!seg) return { err: '没有月份切换条' };
  const val = () => document.getElementById('finMonthVal').textContent;
  const atNow = val();
  seg.querySelector('[data-d="-1"]').click();
  const afterPrev = val();
  const legend = (document.getElementById('finChart').textContent || '').replace(/\s+/g, '');
  seg.querySelector('[data-d="1"]').click();
  const back = val();
  return { atNow, ym, prev, afterPrev, back, legend, nxOff: seg.querySelector('[data-d="1"]').disabled,
    prevLabel: `${prev.slice(0, 4)}年${+prev.slice(5, 7)}月` };
});
check('消费曲线 · 月内能翻到上个月再翻回来',
  !mon.err && mon.atNow === mon.ym && mon.afterPrev === mon.prev && mon.back === mon.ym,
  mon.err || `${mon.atNow} → ${mon.afterPrev} → ${mon.back}`);
check('消费曲线 · 翻月后合计按所选月份', !mon.err && mon.legend.includes(mon.prevLabel),
  mon.err || `图例：${(mon.legend || '').slice(0, 40)}`);
check('消费曲线 · 停在本月时不再给往后翻', !mon.err && mon.nxOff === true, mon.err || `› ${mon.nxOff ? '已禁用' : '仍可点'}`);

// ——— 6.6 待分类队列的金额方向（v2.11.1）
// 队列项只存 expId、不存方向，渲染时以前一律按支出画（负号 + 绿），收入条目也跟着变绿负数。
const pend = await page.evaluate(() => {
  exps.length = 0; incs.length = 0; pendingTxns.length = 0;
  const outRow = { id: 'p-out', date: '2026-11-14', cat: '未分类', amount: 15, merchant: '夹具支出', src: '导入' };
  const inRow = { id: 'p-in', date: '2026-11-14', cat: '未分类', amount: 88, merchant: '夹具收入', src: '导入' };
  exps.push(outRow); incs.push(inRow);
  syncPendingFor(outRow); syncPendingFor(inRow);
  renderPending();
  return [...document.querySelectorAll('#pendingList .pending-row')].map(r => {
    const a = r.querySelector('.pr-amt');
    return { name: r.querySelector('.pr-name').textContent, amt: a.textContent.trim(),
      cls: a.className, color: getComputedStyle(a).color };
  });
});
const pOut = pend.find(r => r.name.includes('夹具支出')) || {};
const pIn = pend.find(r => r.name.includes('夹具收入')) || {};
const RED = 'rgb(180, 64, 47)', GREEN = 'rgb(63, 115, 85)';
check('待分类队列 · 支出行显示 -¥ 且为绿色',
  (pOut.amt || '').startsWith('-') && /(^|\s)out(\s|$)/.test(pOut.cls || '') && pOut.color === GREEN,
  JSON.stringify(pOut));
check('待分类队列 · 收入行显示 +¥ 且为红色',
  (pIn.amt || '').startsWith('+') && /(^|\s)in(\s|$)/.test(pIn.cls || '') && pIn.color === RED,
  JSON.stringify(pIn));
check('待分类队列 · 金额不出现双负号',
  !pend.some(r => r.amt.includes('--') || r.amt.includes('-¥-')), JSON.stringify(pend.map(r => r.amt)));

// ——— 6.5 云端覆盖防护 + 滚动快照（v2.11.2）
const mg = await page.evaluate(() => { try {
  const local = {
    collects: [{ id: 'c1', name: '本机1' }, { id: 'c2', name: '本机2' }, { id: 'c3', name: '只在本地' }],
    bodies: [{ date: '2026-10-20', weight: 70 }, { date: '2026-11-01', weight: 71 }],
    exps: [{ id: 'e1', amount: 10 }], islands: [],
  };
  const cloud = {
    collects: [{ id: 'c1', name: '云端1' }, { id: 'c2', name: '云端2' }],
    bodies: [{ date: '2026-10-20', weight: 70 }],
    exps: [{ id: 'e1', amount: 10 }],
  };
  const r = mergeArchives(local, cloud);
  return { kept: r.kept, names: r.out.collects.map(x => x.name), bodies: r.out.bodies.length,
    cloudFirst: r.out.collects[0].name };
} catch(e){ return {error:String(e)}; } });
check('云端合并 · 本机独有的条目不会被删掉',
  mg.kept === 2 && (mg.names||[]).includes('只在本地') && mg.bodies === 2, JSON.stringify(mg));
check('云端合并 · 同 id 以云端为准', mg.cloudFirst === '云端1', JSON.stringify(mg.names));
check('云端合并 · 不多不少（不重复追加已有条目）',
  (mg.names||[]).filter(n => n === '云端2').length === 1 && (mg.names||[]).length === 3, JSON.stringify(mg.names));

const ring = await page.evaluate(() => { try {
  const d = { islands: [{ id: 'i1' }], collects: [{ id: 'c1' }, { id: 'c2' }],
    exps: [{ id: 'e1' }], bodies: [{ date: '2026-10-20' }] };
  const before = ringList().length;
  const ok = ringPush(JSON.stringify(d));
  const dup = ringPush(JSON.stringify(d));            // 同内容不该重复占位
  const bad = ringPush('{}');                          // 无效存档不该占位
  const after = ringList().length;
  let maxCollects = 0;
  ringList().forEach(m => {
    try { maxCollects = Math.max(maxCollects, (JSON.parse(localStorage.getItem('sea_ring_' + m.at)).collects || []).length); } catch (e) {}
  });
  const best = ringBest();
  return { before, ok, dup, bad, after, maxCollects, bestTotal: best ? best.total : 0,
    counts: archCounts(d), capped: after <= 10 };
} catch(e){ return {error:String(e)}; } });
check('滚动快照 · 覆盖前的那份能被写进快照环',
  ring.ok === true && ring.maxCollects >= 2, JSON.stringify(ring));
check('滚动快照 · 同内容不重复占位、无效存档被拒',
  ring.dup === false && ring.bad === false, JSON.stringify(ring));
check('滚动快照 · 最多只留 10 份（不无限涨）', ring.capped === true, JSON.stringify(ring));

// ——— 7. 八个视图 + 控制台
check('运行期 · 没有未捕获异常', errs.length === 0, errs.join(' | '));

await browser.close();

console.log('\n=== v2.8.6 回归验证 ===');
results.forEach(r => console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.name + (r.detail ? '   — ' + r.detail : '')));
console.log('\n通过 ' + pass + ' · 失败 ' + fail);
process.exit(fail ? 1 : 0);
