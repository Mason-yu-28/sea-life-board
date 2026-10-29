#!/usr/bin/env node
/**
 * 只读校验 Sea 的三个版本是否对齐。**不改任何文件。**
 *
 *   01 源文件版   ← 唯一的源，有 .git
 *   02 GitHub 发布版 ← 应该是 01 的 HEAD 的逐字节投影
 *   03 资料库版   ← 线上部署件的原样下载，应与 01 只差「平台注入」那一层
 *
 * 用法（在 01-源文件版/ 下跑）：
 *   node scripts/sync-check.mjs
 *
 * 退出码：0 = 全绿（或只有提示）· 1 = 有硬失败
 *
 * 为什么不直接 diff 01 和 03：
 *   平台改了三处（库 ID / inject.js / 868 个锚点），还会把属性顺序改成
 *   content=... name=...，所以全文比对必然一片红、且报的都是噪声。
 *   这里改用「结构等价」判据：函数名集合 + 被引用的元素 id 集合 + 版本号。
 *   这三样任意一样不同，就是真的漏了同步。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.SEA_ROOT ? path.resolve(process.env.SEA_ROOT) : path.resolve(HERE, '..');
const SEA = path.resolve(ROOT, '..');
const PUB = path.join(SEA, '02-GitHub发布版');
const LIVE_DIR = path.join(SEA, '03-资料库版');

const C = { g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', d: '\x1b[90m', b: '\x1b[1m', x: '\x1b[0m' };
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const toAbs = (base, rel) => path.join(base, rel.split('/').join(path.sep));

let pass = 0, warn = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`${C.g}[PASS]${C.x} ${name}${detail ? `  ${C.d}${detail}${C.x}` : ''}`); }
  else { fail++; console.log(`${C.r}[FAIL]${C.x} ${name}${detail ? `  ${C.d}${detail}${C.x}` : ''}`); }
  return cond;
}
function note(name, detail = '') { warn++; console.log(`${C.y}[提示]${C.x} ${name}${detail ? `  ${C.d}${detail}${C.x}` : ''}`); }

function gitList() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 << 20 });
  return out.toString('utf8').split('\0').filter(Boolean);
}
function walk(base, rel = '', acc = []) {
  const dir = rel ? path.join(base, rel) : base;
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(base, r, acc); else acc.push(r);
  }
  return acc;
}
const verOf = s => (s.match(/id="setVerNum">(?:<!--pnid:[^>]*-->)?([^<]*)/) || [])[1] || '';
const fnsOf = s => new Set([...s.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]));
// 只收字面量：getElementById('view-'+x) 这类拼接无法静态判定，必须排除
const idsOf = s => new Set([...s.matchAll(/getElementById\(\s*'([^']*)'\s*\)/g)].map(m => m[1]));
// 静态 id 属性 + 运行时 .id= 赋值（storeWarn 这类元素是 JS 现造的）
const defIdsOf = s => new Set([
  ...[...s.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]),
  ...[...s.matchAll(/\.id\s*=\s*'([\w-]+)'/g)].map(m => m[1]),
]);
const diffSet = (a, b) => [...a].filter(x => !b.has(x));

// 03（资料库版）里被平台换掉的东西：DATABASE_ID 由「动态解析函数」变成「硬编码 const」，
// 所以 resolveDatabaseId 在线上件里不存在，这是设计如此，不是漏同步。
const PLATFORM_ONLY_SRC = new Set(['resolveDatabaseId']);
// 查询了但允许不存在的元素（代码里用 if(el) 兜住，属于可选挂件）
const OPTIONAL_IDS = new Set(['finExport']);

console.log(`${C.b}Sea 三版同步检查${C.x}`);
console.log(`  01 ${ROOT}`);
console.log(`  02 ${PUB}`);
console.log(`  03 ${LIVE_DIR}`);
console.log('');

const mainSrc = path.join(ROOT, 'Sea-2.8.html');
const liveHtml = fs.existsSync(LIVE_DIR)
  ? fs.readdirSync(LIVE_DIR).filter(f => /\.html$/i.test(f)).map(f => path.join(LIVE_DIR, f))[0]
  : null;

if (!fs.existsSync(mainSrc)) {
  console.log(`${C.r}找不到 01 的主文件：${mainSrc}${C.x}`);
  process.exit(1);
}
const src = fs.readFileSync(mainSrc, 'utf8');

// ── 1. 02 是不是 01 工作区的投影 ─────────────────────────────
if (!fs.existsSync(PUB)) {
  ok('02 目录存在', false, PUB);
} else {
  const files = gitList();
  const pubSet = new Set(walk(PUB));
  const missing = [], differ = [];
  for (const rel of files) {
    const s = toAbs(ROOT, rel), d = toAbs(PUB, rel);
    if (!fs.existsSync(s)) continue;
    if (!fs.existsSync(d)) { missing.push(rel); continue; }
    if (sha(fs.readFileSync(s)) !== sha(fs.readFileSync(d))) differ.push(rel);
  }
  const extra = [...pubSet].filter(f => !new Set(files).has(f));
  ok('02 与 01 逐字节一致', missing.length + differ.length === 0,
    `${files.length} 个文件；缺 ${missing.length} / 不同 ${differ.length}`);
  if (missing.length) missing.slice(0, 6).forEach(f => console.log(`        ${C.d}缺 ${f}${C.x}`));
  if (differ.length) differ.slice(0, 6).forEach(f => console.log(`        ${C.d}不同 ${f}${C.x}`));
  if (extra.length) note(`02 有 ${extra.length} 个白名单外文件`, extra.slice(0, 6).join('、'));

  // ── 2. 工作区有没有没提交的改动（会导致 02 领先于版本历史）──────
  let porcelain = '';
  try { porcelain = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT }).toString('utf8').trim(); } catch {}
  const dirty = porcelain ? porcelain.split('\n').filter(Boolean) : [];
  ok('01 工作区无未提交改动', dirty.length === 0,
    dirty.length ? `${dirty.length} 项待提交：${dirty.slice(0, 4).map(s => s.substring(2).trim()).join('、')}` : '干净');
}

// ── 3. 版本号 ───────────────────────────────────────────────
const srcVer = verOf(src);
if (!liveHtml) {
  ok('03 目录里有线上件', false, '没找到 .html —— 需要重新下载');
} else {
  const live = fs.readFileSync(liveHtml, 'utf8');
  const liveVer = verOf(live);
  ok('版本号一致', srcVer && srcVer === liveVer, `01 = ${srcVer || '?'} · 03 = ${liveVer || '?'}`);

  // ── 4. 结构等价：函数名集合 + 被引用的元素 id ────────────────
  const fs1 = fnsOf(src), fs3 = fnsOf(live);
  const onlySrc = diffSet(fs1, fs3).filter(f => !PLATFORM_ONLY_SRC.has(f));
  const onlyLive = diffSet(fs3, fs1);
  ok('函数集合一致', onlySrc.length === 0 && onlyLive.length === 0,
    `${fs1.size} 个函数` + (onlySrc.length ? ` · 01 多：${onlySrc.slice(0, 5).join(',')}` : '') +
    (onlyLive.length ? ` · 03 多：${onlyLive.slice(0, 5).join(',')}` : ''));

  const g1 = idsOf(src), g3 = idsOf(live);
  const missIng = diffSet(g1, g3).filter(x => !OPTIONAL_IDS.has(x));
  ok('03 引用的元素 id 覆盖 01', missIng.length === 0,
    `${g1.size} 个引用` + (missIng.length ? ` · 03 缺：${missIng.slice(0, 5).join(',')}` : ''));

  const d3 = defIdsOf(live);
  const undef = diffSet(g1, d3).filter(x => !OPTIONAL_IDS.has(x));
  ok('01 的每个 getElementById 都有对应元素', undef.length === 0,
    undef.length ? `未定义：${undef.slice(0, 5).join(',')}` : `${defIdsOf(src).size} 个元素`);

  // ── 5. 平台注入特征：03 该有、01 该没有 ──────────────────────
  const liveInject = /page_comm\/inject\.js/.test(live);
  const liveAnchors = (live.match(/data-page-node-id/g) || []).length;
  const liveDbId = /const\s+DATABASE_ID\s*=\s*'([^']+)'/.exec(live);
  ok('03 保留平台注入', liveInject && liveAnchors > 500 && !!liveDbId && liveDbId[1].length > 10,
    `inject.js ${liveInject ? '在' : '缺失'} · 锚点 ${liveAnchors} · 库 ID ${liveDbId ? '已硬编码' : '缺失'}`);

  ok('01 母版未被污染', !/page_comm\/inject\.js/.test(src) && !/data-page-node-id/.test(src),
    /page_comm\/inject\.js/.test(src) ? '母版里出现了 inject.js' : `/ 锚点 0 · DATABASE_ID 走动态解析`);

  // ── 6. 行数差（只作提示，不作为失败）────────────────────────
  const l1 = src.split('\n').length, l3 = live.split('\n').length;
  const delta = l3 - l1;
  if (Math.abs(delta) > 80) note(`行数差 ${delta > 0 ? '+' : ''}${delta}`, `01 ${l1} 行 · 03 ${l3} 行 —— 差得偏多，值得看一眼是不是有改动没打上去`);
  else console.log(`${C.d}[信息]${C.x} 行数差 ${delta > 0 ? '+' : ''}${delta}  ${C.d}01 ${l1} · 03 ${l3}（平台注入的正常范围）${C.x}`);
}

console.log('');
if (fail === 0) {
  console.log(`${C.g}${C.b}对齐${C.x}：${pass} 项通过${warn ? ` / ${warn} 项提示` : ''}。`);
  process.exit(0);
} else {
  console.log(`${C.r}${C.b}没对齐${C.x}：${fail} 项失败${warn ? ` / ${warn} 项提示` : ''}。`);
  console.log(`${C.d}02 不对 → node scripts/export-public.mjs`);
  console.log(`03 不对 → 照 docs/HOSTING.md 打补丁上传，再下载回来覆盖 03-资料库版/`);
  process.exit(1);
}
