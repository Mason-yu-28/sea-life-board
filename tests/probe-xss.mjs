// 存储型 XSS 探针：用三种经典载荷分别投毒，翻遍八个页面 + 打开弹窗，看有没有执行
// 运行：node tests/probe-xss.mjs
import { chromium } from 'playwright-core';

const EDGE = process.env.SEA_EDGE ||
  (process.platform === 'win32'
    ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    : '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
const FILE = 'file:///' + process.cwd().replace(/\\/g, '/') + '/' + (process.env.SEA_FILE || 'Sea-2.8.html');

const PAYLOADS = [
  { name: '裸标签', v: '<img src=x onerror="window.__X=(window.__X||0)+1">' },
  { name: '双引号破属性', v: '"><img src=x onerror="window.__X=(window.__X||0)+1">' },
  { name: '单引号破属性', v: "'><img src=x onerror='window.__X=(window.__X||0)+1'>" },
];

const TEXT_KEYS = new Set([
  'name', 'desc', 'note', 'action', 'content', 'intro', 'org', 'role', 'result', 'reason',
  'item', 'merchant', 'title', 'text', 'target', 'change', 'src', 'label', 'carrier',
  'firm', 'client', 'stage', 'cls', 'kind', 'verdict', 'need', 'now', 'endReason',
  'duties', 'transfer', 'sentence', 'hard', 'resumeLabel', 'cv', 'cat', 'status',
]);

function poison(obj, p) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (Array.isArray(v)) {
      v.forEach((it, i) => {
        if (typeof it === 'string') { if (TEXT_KEYS.has(k)) v[i] = p; }
        else poison(it, p);
      });
    } else if (v && typeof v === 'object') poison(v, p);
    else if (typeof v === 'string' && TEXT_KEYS.has(k)) obj[k] = p;
  }
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage();
await page.goto(FILE);
await page.waitForTimeout(900);
const base = JSON.parse(await page.evaluate(() => localStorage.getItem('sea_workspace_v1')));

let bad = 0;
const pages = ['cockpit', 'sail', 'treasure', 'career', 'finance', 'health', 'growth', 'review'];

for (const pl of PAYLOADS) {
  const d = JSON.parse(JSON.stringify(base));
  poison(d, pl.v);
  if ('northStar' in d) d.northStar = pl.v;
  await page.evaluate(x => {
    localStorage.setItem('sea_workspace_v1', JSON.stringify(x));
    localStorage.setItem('sea_force_local', '1');
  }, d);

  let total = 0;
  const detail = {};
  for (const v of pages) {
    await page.goto(FILE);
    await page.waitForTimeout(650);
    await page.evaluate(p => document.querySelector(`[data-nav="${p}"]`)?.click(), v);
    await page.waitForTimeout(350);
    const n = await page.evaluate(() => {
      ['#addIsland', '#sailAddBtn', '#finAddBtn', '#btnWageRecords', '#profEditBtn'].forEach(s => {
        try { document.querySelector(s)?.click(); } catch (e) {}
      });
      const h = window.__X || 0;
      document.querySelectorAll('.dm-mask,.modal-mask').forEach(m => m.remove());
      return h;
    });
    if (n) { detail[v] = n; total += n; const dbg = await page.evaluate(() => [...document.querySelectorAll('img[src="x"]')].slice(0,2).map(im => { let p = im, path = ''; for (let i=0;i<5&&p;i++){path += p.tagName + (p.className?'.'+String(p.className).split(' ')[0]:'') + ' > '; p = p.parentElement;} return path + ' || ' + (im.parentElement ? im.parentElement.outerHTML.slice(0,240) : ''); })); console.log('   ↳', JSON.stringify(dbg)); }
  }

  // 导入路径：模拟陌生人递来一份毒备份
  await page.goto(FILE);
  await page.waitForTimeout(650);
  const viaImport = await page.evaluate(x => {
    window.__X = 0;
    try { applyImported(JSON.parse(x)); } catch (e) { return 'ERR:' + e.message; }
    return window.__X || 0;
  }, JSON.stringify(d));

  const sum = total + (typeof viaImport === 'number' ? viaImport : 0);
  bad += sum;
  console.log(`[${pl.name}] 页面执行 ${total} 次 ${JSON.stringify(detail)}｜导入路径 ${viaImport}`);
}

await browser.close();
console.log(bad === 0 ? 'PASS 三种载荷全部被转义' : `FAIL 仍有 ${bad} 次执行`);
process.exit(bad === 0 ? 0 : 1);
