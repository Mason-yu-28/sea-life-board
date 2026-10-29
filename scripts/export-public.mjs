#!/usr/bin/env node
/**
 * 从 git 白名单导出「GitHub 发布版」（Sea/02-GitHub发布版/）。
 *
 * 为什么是「白名单复制」而不是「从母版裁剪」：
 *   .gitignore 已经把 .private / _archive / node_modules / tests/output 排除了，
 *   所以 git ls-files 列出来的就是可以公开的全部。02 只该是 01 的 HEAD 的投影。
 *
 * 用法（在 01-源文件版/ 下跑）：
 *   node scripts/export-public.mjs             # 实际写盘
 *   node scripts/export-public.mjs --dry       # 只报告差异，不动文件
 *   node scripts/export-public.mjs --keep-extra  # 保留目标目录里白名单外的文件
 *   node scripts/export-public.mjs --out <dir>   # 导出到别处
 *
 * 铁律：02 是产物。任何手改都会在下一次导出时被整份覆盖。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DRY = process.argv.includes('--dry');
const KEEP_EXTRA = process.argv.includes('--keep-extra');
const OUT = (() => {
  const i = process.argv.indexOf('--out');
  if (i > -1 && process.argv[i + 1]) return path.resolve(process.argv[i + 1]);
  return path.resolve(ROOT, '..', '02-GitHub发布版');
})();

const C = { g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', d: '\x1b[90m', b: '\x1b[1m', x: '\x1b[0m' };
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const toAbs = (base, rel) => path.join(base, rel.split('/').join(path.sep));

function gitList() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 << 20 });
  return out.toString('utf8').split('\0').filter(Boolean);
}

// HEAD 里该文件的内容（用于区分「工作区改了没提交」）
function headBuf(rel) {
  try {
    return execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, maxBuffer: 64 << 20 });
  } catch {
    return null;
  }
}

function walk(base, rel = '', acc = []) {
  const dir = rel ? path.join(base, rel) : base;
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(base, r, acc);
    else acc.push(r);
  }
  return acc;
}

const files = gitList();
const outFiles = walk(OUT);
const outSet = new Set(outFiles);
const wantSet = new Set(files);

const added = [];   // 02 缺，或内容不同
const modified = [];
let same = 0;

for (const rel of files) {
  const src = toAbs(ROOT, rel);
  if (!fs.existsSync(src)) { added.push(rel + '  (01 里不存在，但 git 说应该有)'); continue; }
  const a = sha(fs.readFileSync(src));
  const dst = toAbs(OUT, rel);
  if (!fs.existsSync(dst)) { added.push(rel); continue; }
  const b = sha(fs.readFileSync(dst));
  if (a === b) same++;
  else modified.push(rel);
}

const extra = outFiles.filter(f => !wantSet.has(f));

// 工作区是否有没提交的改动（白名单内的文件）
const uncommitted = [];
for (const rel of files) {
  const src = toAbs(ROOT, rel);
  if (!fs.existsSync(src)) continue;
  const h = headBuf(rel);
  if (!h) { uncommitted.push(rel + '  (新文件，未加入 HEAD)'); continue; }
  if (sha(h) !== sha(fs.readFileSync(src))) uncommitted.push(rel);
}

console.log(`${C.b}Sea 发布版导出${C.x}`);
console.log(`  源   ${ROOT}`);
console.log(`  目标 ${OUT}`);
console.log(`  白名单 ${files.length} 个文件 · 目标现有 ${outFiles.length} 个${DRY ? `  ${C.y}(dry-run，不写盘)${C.x}` : ''}`);
console.log('');

if (uncommitted.length) {
  console.log(`${C.y}⚠ 有 ${uncommitted.length} 个文件工作区与 HEAD 不一致${C.x}（导出的是工作区内容，不是已提交内容）：`);
  uncommitted.slice(0, 12).forEach(f => console.log(`    ${f}`));
  if (uncommitted.length > 12) console.log(`    …还有 ${uncommitted.length - 12} 个`);
  console.log(`  ${C.d}建议先 git commit 再导出，否则 02 会领先于版本历史。${C.x}`);
  console.log('');
}

console.log(`  ${C.g}一致${C.x}      ${same}`);
console.log(`  ${C.y}待更新${C.x}    ${added.length + modified.length}`);
if (added.length) { console.log(`    ${C.d}新增/缺失：${C.x}`); added.forEach(f => console.log(`      + ${f}`)); }
if (modified.length) { console.log(`    ${C.d}内容不同：${C.x}`); modified.forEach(f => console.log(`      ~ ${f}`)); }
if (extra.length) {
  console.log(`  ${C.r}多余${C.x}      ${extra.length}${KEEP_EXTRA ? `  ${C.d}(--keep-extra，保留)${C.x}` : `  ${C.d}(将被删除)${C.x}`}`);
  extra.forEach(f => console.log(`      - ${f}`));
}

if (!added.length && !modified.length && !extra.length) {
  console.log(`\n${C.g}02 已经等于 01 的当前内容，不用导出。${C.x}`);
  process.exit(0);
}

if (DRY) {
  console.log(`\n${C.y}dry-run 结束，未改动任何文件。${C.x} 去掉 --dry 执行导出。`);
  process.exit(0);
}

fs.mkdirSync(OUT, { recursive: true });
for (const rel of [...added.filter(f => !f.includes('  (')) , ...modified]) {
  const dst = toAbs(OUT, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(toAbs(ROOT, rel), dst);
}
if (!KEEP_EXTRA) {
  for (const rel of extra) fs.rmSync(toAbs(OUT, rel), { force: true });
  // 清掉导出后变空的目录
  const dirs = walkDirs(OUT);
  for (const d of dirs.sort((a, b) => b.length - a.length)) {
    try { if (!fs.readdirSync(d).length) fs.rmdirSync(d); } catch {}
  }
}
function walkDirs(base, rel = '', acc = []) {
  const dir = rel ? path.join(base, rel) : base;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { const r = rel ? `${rel}/${e.name}` : e.name; acc.push(path.join(base, r.split('/').join(path.sep))); walkDirs(base, r, acc); }
  }
  return acc;
}

console.log(`\n${C.g}导出完成${C.x}：写入 ${added.length + modified.length} 个，删除 ${KEEP_EXTRA ? 0 : extra.length} 个。`);
console.log(`${C.d}下一步：node scripts/sync-check.mjs 确认三版对齐。${C.x}`);
