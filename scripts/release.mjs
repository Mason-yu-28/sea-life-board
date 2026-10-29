#!/usr/bin/env node
/**
 * 一条命令发布：检查 → 导出 02 → 校验 → push → 打 tag → 建 Release。
 *
 * 用法（在 01-源文件版/ 下跑）：
 *   node scripts/release.mjs             # 完整发布
 *   node scripts/release.mjs --dry       # 只检查，不做任何写操作
 *
 * 它替代的手工流程是这四步：
 *   ① 改代码 ② git commit ③ node scripts/export-public.mjs ④ git push + 打 tag
 *
 * 它故意不做的事：
 *   - 不会帮你 commit。提交信息要人写，脚本猜不出「为什么改」。
 *   - 不会自动 bump 版本号。版本号是决定，不是自动产物。
 *   - 不会在检查不过时「尽力而为」。任一项失败就退出，退出码非 0。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DRY = process.argv.includes('--dry');
const BRANCH = 'main';

const C = { g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', d: '\x1b[90m', b: '\x1b[1m', x: '\x1b[0m' };
const ok = m => console.log(`  ${C.g}✓${C.x} ${m}`);
const warn = m => console.log(`  ${C.y}!${C.x} ${m}`);
const bad = m => console.log(`  ${C.r}✗${C.x} ${m}`);
const step = m => console.log(`\n${C.b}${m}${C.x}`);

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, ...opts }).trim();
}
function trySh(cmd, args, opts = {}) {
  try { return { ok: true, out: sh(cmd, args, opts) }; }
  catch (e) { return { ok: false, out: (e.stdout || '') + (e.stderr || e.message) }; }
}

let failed = 0;
const fail = m => { failed++; bad(m); };

// ── 1. 版本号三方一致 ──────────────────────────────────────────────
step('① 版本号');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const html = fs.readFileSync(path.join(ROOT, 'Sea-2.8.html'), 'utf8');
const metaVer = (html.match(/<meta\s+name="version"\s+content="([^"]+)"/) || [])[1];
const V = pkg.version;
if (!metaVer) fail('Sea-2.8.html 里找不到 <meta name="version">');
else if (metaVer !== V) fail(`版本号不一致：package.json=${V} · HTML meta=${metaVer}`);
else ok(`版本号 ${V}（package.json 与 HTML meta 一致）`);

// ── 2. 工作区干净 ──────────────────────────────────────────────────
step('② 工作区');
const status = sh('git', ['status', '--porcelain']);
if (status) {
  fail('有未提交的改动，先 commit 再发布（否则发出去的是半成品）：');
  status.split('\n').slice(0, 12).forEach(l => console.log(`      ${l}`));
  if (status.split('\n').length > 12) console.log('      …');
} else ok('工作区干净');

const branch = sh('git', ['branch', '--show-current']);
if (branch !== BRANCH) warn(`当前分支是 ${branch}，发布目标是 ${BRANCH}`); else ok(`分支 ${branch}`);

// ── 3. 远程可写 ────────────────────────────────────────────────────
step('③ 远程');
const remote = trySh('git', ['remote', 'get-url', 'origin']);
if (!remote.ok) fail('没有 origin 远程，先 gh repo create 或 git remote add');
else {
  ok(`origin ${remote.out}`);
  const auth = trySh('gh', ['auth', 'status']);
  if (!auth.ok) fail('gh 未登录，先跑 gh auth login');
  else {
    const who = (auth.out.match(/account (\S+)/) || [])[1] || '?';
    ok(`gh 已登录（${who}）`);
  }
}

// ── 4. 导出 02 并校验三版 ──────────────────────────────────────────
step('④ 导出发布版');
if (DRY) {
  console.log(`  ${C.d}dry-run：跳过 export-public / sync-check 的写操作${C.x}`);
  const d = trySh('node', ['scripts/export-public.mjs', '--dry']);
  console.log(d.out.split('\n').map(l => '      ' + l).join('\n'));
} else {
  const ex = trySh('node', ['scripts/export-public.mjs']);
  console.log(ex.out.split('\n').map(l => '      ' + l).join('\n'));
  if (!ex.ok) fail('导出失败');

  const sc = trySh('node', ['scripts/sync-check.mjs']);
  const tail = sc.out.split('\n').filter(Boolean);
  const summary = tail[tail.length - 1] || '';
  if (!sc.ok) { fail('三版未对齐：'); console.log(sc.out); }
  else ok(summary);
}

if (failed) {
  console.log(`\n${C.r}发布中止：${failed} 项没通过。${C.x} 修完再跑一次。`);
  process.exit(1);
}

// ── 5. 推送 ────────────────────────────────────────────────────────
step('⑤ 推送');
if (DRY) {
  const pending = sh('git', ['log', `origin/${BRANCH}..${BRANCH}`, '--oneline']);
  console.log(`  ${C.d}将推送 ${pending ? pending.split('\n').length : 0} 个提交：${C.x}`);
  (pending || '（无）').split('\n').forEach(l => console.log(`      ${l}`));
} else {
  const push = trySh('git', ['push', 'origin', BRANCH]);
  if (!push.ok) { fail('push 失败：\n' + push.out); process.exit(1); }
  ok(`已推送 ${BRANCH}`);
}

// ── 6. 打 tag 建 Release ───────────────────────────────────────────
step(`⑥ Release v${V}`);
const tag = `v${V}`;
const hasTagLocal = trySh('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`]).ok;
const hasTagRemote = trySh('gh', ['release', 'view', tag]).ok;

if (hasTagRemote) warn(`${tag} 已存在，跳过（要重发先 gh release delete ${tag}）`);
else if (DRY) console.log(`  ${C.d}dry-run：将创建 tag ${tag} 与 Release${C.x}`);
else {
  if (!hasTagLocal) {
    trySh('git', ['tag', '-a', tag, '-m', `Sea ${tag}`]);
    trySh('git', ['push', 'origin', tag]);
  }
  const notesFile = path.join(ROOT, 'docs', 'releases', `${tag}.md`);
  const args = ['release', 'create', tag, '--title', `Sea ${tag}`, '--target', BRANCH];
  if (fs.existsSync(notesFile)) { args.push('--notes-file', notesFile); ok('用 docs/releases/' + tag + '.md 当发布说明'); }
  else { args.push('--generate-notes'); }
  const rel = trySh('gh', args);
  if (!rel.ok) fail('Release 创建失败：\n' + rel.out);
  else ok(tag + ' 已发布');
}

// ── 7. 结果 ────────────────────────────────────────────────────────
step('结果');
const repo = trySh('gh', ['repo', 'view', '--json', 'url,homepageUrl', '--jq', '.url + " " + (.homepageUrl // "")']);
if (repo.ok) {
  const [url, home] = repo.out.split(' ');
  console.log(`  仓库  ${url}`);
  if (home) {
    console.log(`  试用  ${home}`);
    console.log(`  看板  ${home.replace(/\/$/, '')}/Sea-2.8.html`);
  } else {
    console.log(`  ${C.d}没有设置 Website，跳过试用地址${C.x}`);
  }
}
console.log(`  ${C.d}Pages 会在 push 后 1 分钟内自动重建。${C.x}`);
if (DRY) console.log(`\n${C.y}dry-run 结束，什么都没改。${C.x}`);
