// 存档文件镜像（v2.10.0）回归验证
// 真实文件选择框没法在无头浏览器里点，所以这里验证的是「拿到句柄之后」的全部逻辑：
//   写入、去抖、权限三态、比时间戳载入、不支持时降级。句柄用假对象替身，结构对齐 FileSystemFileHandle。
import { chromium } from 'playwright-core';

const EDGE = process.env.SEA_EDGE ||
  (process.platform === 'win32'
    ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    : '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
const NAME = process.env.SEA_FILE || 'Sea-2.8.html';
const FILE = 'file:///' + process.cwd().replace(/\\/g, '/') + '/' + NAME;

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')); }
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

// ——— 1. 没绑定时什么都不该出现 ———
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(FILE);
  await page.waitForTimeout(900);
  const s = await page.evaluate(() => ({
    pill: getComputedStyle(document.getElementById('fileState')).display,
    bar: getComputedStyle(document.getElementById('filePerm')).display,
    btn: document.getElementById('btnFileBind').textContent,
    info: document.getElementById('fileInfo').textContent,
    supported: fileSupported(),
  }));
  ok('未绑定时不显示文件胶囊', s.pill === 'none', s.pill);
  ok('未绑定时不显示授权横条', s.bar === 'none', s.bar);
  ok('设置里按钮是「绑定」', s.btn === '绑定', s.btn);
  ok('本机浏览器支持文件 API', s.supported === true, String(s.supported));
  ok('首启没有脚本错误', errs.length === 0, errs.join(' | '));
  await page.close();
}

// ——— 2. 写入路径：内容、格式、去抖 ———
{
  const page = await browser.newPage();
  await page.goto(FILE);
  await page.waitForTimeout(800);
  // 先造一张岛，确保有数据可写
  await page.evaluate(() => {
    islands.push({ id: 'il-file-1', name: '镜像测试岛', desc: 'd', rarity: '蓝', status: '进行中',
      createdAt: isoOf(new Date()), lastActive: isoOf(new Date()) });
    save();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__writes = [];
    window.__fake = {
      name: 'sea-存档.json',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      createWritable: async () => ({
        write: async b => { window.__writes.push(b); },
        close: async () => {},
      }),
      getFile: async () => ({ size: (window.__writes.at(-1) || '').length }),
    };
    fileHandle = window.__fake;
    filePerm = 'granted';
  });
  const before = await page.evaluate(() => window.__writes.length);
  // 连续改三次：去抖后应该只写 1 次（最后一次的完整快照）
  await page.evaluate(() => {
    islands[0].desc = 'x1'; save();
    setTimeout(() => { islands[0].desc = 'x2'; save(); }, 100);
    setTimeout(() => { islands[0].desc = 'x3'; save(); }, 200);
  });
  await page.waitForTimeout(2000);
  const w = await page.evaluate(() => ({
    n: window.__writes.length,
    body: window.__writes.at(-1) || '',
    pill: getComputedStyle(document.getElementById('fileState')).display,
    text: document.getElementById('fileState').textContent,
  }));
  ok('去抖生效：三次连续修改只落盘一次', w.n === 1, '写入次数 ' + w.n);
  let parsed = null;
  try { parsed = JSON.parse(w.body); } catch (e) {}
  ok('文件是合法 JSON', !!parsed);
  ok('文件带 savedAt', !!(parsed && parsed.savedAt));
  ok('文件带 __assets（跟导出备份同格式）', !!(parsed && parsed.__assets));
  ok('文件内容是最后一次修改（x3）', !!(parsed && parsed.islands && parsed.islands[0].desc === 'x3'),
    parsed && parsed.islands && parsed.islands[0].desc);
  ok('写入成功后显示文件胶囊', w.pill === 'flex' || w.pill === 'inline-flex', w.pill);
  await page.close();
}

// ——— 3. 权限被撤回：不静默失败，亮横条，应用继续可用 ———
{
  const page = await browser.newPage();
  await page.goto(FILE);
  await page.waitForTimeout(800);
  const r = await page.evaluate(async () => {
    window.__writes = [];
    fileHandle = {
      name: 'sea-存档.json',
      queryPermission: async () => 'prompt',
      createWritable: async () => ({ write: async b => { window.__writes.push(b); }, close: async () => {} }),
      getFile: async () => ({ size: 10 }),
    };
    const wrote = await fileWriteNow('{"a":1}');
    return {
      wrote,
      n: window.__writes.length,
      bar: getComputedStyle(document.getElementById('filePerm')).display,
      perm: filePerm,
      text: document.getElementById('fileState').textContent,
    };
  });
  ok('权限不足时不写入', r.wrote === false && r.n === 0, JSON.stringify(r));
  ok('权限不足时弹出授权横条', r.bar === 'flex', r.bar);
  ok('状态记为 prompt', r.perm === 'prompt', r.perm);
  // 应用还能不能正常用
  const alive = await page.evaluate(() => {
    islands.push({ id: 'il-alive', name: '权限失败后仍可用', rarity: '绿', status: '进行中',
      createdAt: isoOf(new Date()), lastActive: isoOf(new Date()) });
    persist();   // 同步落盘，不等 200ms 去抖
    return JSON.parse(localStorage.getItem('sea_workspace_v1')).islands.length;
  });
  ok('授权失败不影响主存档写入', alive >= 1, 'islands=' + alive);
  await page.close();
}

// ——— 4. 载入路径：文件比本机新 → 自动接回来；比本机旧 → 不覆盖 ———
{
  const page = await browser.newPage();
  await page.goto(FILE);
  await page.waitForTimeout(800);
  const newer = await page.evaluate(async () => {
    const payload = {
      islands: [{ id: 'il-from-file', name: '来自文件的目标', rarity: '红', status: '进行中',
        createdAt: '2026-10-01', lastActive: '2026-10-01' }],
      sails: [], achieves: [], collects: [], works: [], routes: [],
      grows: [], reviews: [], northStar: '', blankStart: false,
      savedAt: Date.now() + 3600e3,
      __assets: {},
    };
    fileHandle = {
      name: 'sea-存档.json',
      queryPermission: async () => 'granted',
      createWritable: async () => ({ write: async () => {}, close: async () => {} }),
      getFile: async () => ({ size: 999, lastModified: Date.now(),
        text: async () => JSON.stringify(payload) }),
    };
    const loaded = await fileSilentLoad();
    return {
      loaded,
      name: islands[0] && islands[0].name,
      dom: (document.getElementById('islandPool') || {}).textContent || '',
      stored: (JSON.parse(localStorage.getItem('sea_workspace_v1')).islands || []).map(x => x.name),
    };
  });
  ok('文件更新时自动载入', newer.loaded === true, JSON.stringify(newer).slice(0, 120));
  ok('载入后内存数据换成了文件里的', newer.name === '来自文件的目标', newer.name);
  ok('载入后已写回 localStorage', newer.stored.indexOf('来自文件的目标') >= 0, JSON.stringify(newer.stored));

  const older = await page.evaluate(async () => {
    const before = islands[0] && islands[0].name;
    const payload = { islands: [{ id: 'il-old', name: '旧数据不该覆盖', rarity: '绿', status: '进行中',
      createdAt: '2020-01-01', lastActive: '2020-01-01' }], savedAt: 1000 };
    fileHandle = {
      name: 'sea-存档.json',
      queryPermission: async () => 'granted',
      createWritable: async () => ({ write: async () => {}, close: async () => {} }),
      getFile: async () => ({ size: 999, lastModified: Date.now(), text: async () => JSON.stringify(payload) }),
    };
    const loaded = await fileSilentLoad();
    return { loaded, before, after: islands[0] && islands[0].name };
  });
  ok('文件比本机旧时不覆盖', older.loaded === false && older.after === older.before,
    JSON.stringify(older));
  await page.close();
}

// ——— 5. 浏览器不支持时：静默降级，不报错 ———
{
  const page = await browser.newPage();
  await page.addInitScript(() => { try { delete window.showSaveFilePicker; } catch (e) {} });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(FILE);
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => ({
    supported: fileSupported(),
    pill: getComputedStyle(document.getElementById('fileState')).display,
    info: document.getElementById('fileInfo').textContent,
    islands: Array.isArray(islands),
  }));
  ok('不支持时判定为 false', r.supported === false);
  ok('不支持时不显示文件胶囊', r.pill === 'none', r.pill);
  ok('不支持时给出可读提示', r.info.indexOf('Edge') >= 0, r.info);
  ok('不支持时应用照常启动', r.islands === true && errs.length === 0, errs.join(' | '));
  await page.close();
}

await browser.close();
console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
