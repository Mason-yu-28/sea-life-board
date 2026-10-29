// 空白首启验证：全新浏览器（零存档）打开，确认是干净空白盘、八页不报错、没有示例数据残留
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const EDGE = process.env.SEA_EDGE ||
  (process.platform === 'win32'
    ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    : '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
const FILE = 'file:///' + process.cwd().replace(/\\/g, '/') + '/' + (process.env.SEA_FILE || 'Sea-2.8.html');
const OUT = 'tests/output';
fs.mkdirSync(OUT, { recursive: true });

let fail = 0;
const ok = (n, c, d = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (d ? '  — ' + d : '')); if (!c) fail++; };

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(FILE);
await page.waitForTimeout(1200);

const state = await page.evaluate(() => {
  const raw = localStorage.getItem('sea_workspace_v1');
  if (!raw) return { stored: false };
  return { stored: true, data: JSON.parse(raw) };
});

ok('首次打开是空白存档（没有任何内容）', !state.stored || (Object.values(state.data||{}).every(v => !Array.isArray(v) || v.length === 0)), state.stored ? '已写空存档' : '尚未写盘');

const pages = ['cockpit', 'sail', 'treasure', 'career', 'finance', 'health', 'growth', 'review'];
for (const v of pages) {
  await page.evaluate(p => document.querySelector(`[data-nav="${p}"]`)?.click(), v);
  await page.waitForTimeout(350);
  const shot = await page.screenshot({ fullPage: true });
  fs.writeFileSync(`${OUT}/blank-${v}.png`, shot);
}

// 空白盘上不该出现任何示例内容。
// v2.9 把整块种子代码删了，所以这里查两件事：① 源码里没有种子入口（防回归）；② DOM 里卡池是空的。
const src = fs.readFileSync(process.env.SEA_FILE || 'Sea-2.8.html', 'utf8');
const srcHits = ['seedDemo', 'seedFinance', 'seedFinPrevMonth', '载入示例'].filter(k => src.includes(k));
ok('源码里没有种子数据入口', srcHits.length === 0, srcHits.join('、') || '干净');

const domEmpty = await page.evaluate(() => ({
  islands: document.getElementById('islandPool').children.length,
  sails: document.getElementById('sailPool').children.length,
  routes: document.getElementById('routePool').children.length,
}));
ok('三个卡池都是空的', domEmpty.islands === 0 && domEmpty.sails === 0 && domEmpty.routes === 0, JSON.stringify(domEmpty));

ok('没有 JS 报错', errors.length === 0, errors.slice(0, 3).join(' | '));

// 空盘上录入一条，确认能正常落存档
await page.evaluate(() => document.querySelector('[data-nav="sail"]')?.click());
await page.waitForTimeout(300);
await page.evaluate(() => { document.getElementById('addIsland').click(); });
await page.waitForTimeout(300);
const modalOpen = await page.evaluate(() => {
  const inp = document.getElementById('fiName');
  if (!inp) return false;
  inp.value = '空白盘冒烟测试';
  document.getElementById('fiSave').click();
  return true;
});
await page.waitForTimeout(600);
const afterSave = await page.evaluate(() => {
  const raw = localStorage.getItem('sea_workspace_v1');
  if (!raw) return null;
  const d = JSON.parse(raw);
  return { islands: (d.islands || []).map(x => x.name) };
});
ok('空白盘能新建岛屿卡并写盘', !!afterSave && afterSave.islands.some(n => n === '空白盘冒烟测试'), JSON.stringify(afterSave));

await browser.close();
console.log(fail === 0 ? '\nPASS 空白首启正常' : `\nFAIL ${fail} 项`);
process.exit(fail === 0 ? 0 : 1);
