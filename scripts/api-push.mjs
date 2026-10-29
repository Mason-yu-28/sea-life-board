#!/usr/bin/env node
/**
 * api-push.mjs —— git 通道被代理掐断时的备选发布通道
 *
 * 什么时候用：`gh api rate_limit` 正常，但 `git push` 连续失败
 * （典型报错 CONNECT tunnel failed / schannel: server closed abruptly）。
 * 这说明 API 通道通、git 通道被挡，不用重装 git。
 *
 * 做什么：把「本地领先远程的那一个提交」用 Git Data API 原样传上去，
 * 再把远程生成的提交对象精确复现到本地库，让两边是同一个 SHA。
 *
 * 为什么不直接 force push：git 通道本来就是坏的；而且会造出第三份历史。
 *
 * 用法：
 *   node scripts/api-push.mjs          真的推
 *   node scripts/api-push.mjs --dry    只报告要做什么
 */

import { execFileSync } from 'node:child_process';

const DRY = process.argv.includes('--dry');
const REPO = 'Mason-yu-28/sea-life-board';
const cwd = process.cwd();

const git = (args, opts = {}) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 << 20, ...opts }).trim();

const api = (args, body) => {
  const out = execFileSync('gh', ['api', ...args], {
    cwd, encoding: 'utf8', maxBuffer: 256 << 20,
    input: body ? JSON.stringify(body) : undefined,
  });
  return JSON.parse(out);
};

const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

// ---------- 1. 盘点 ----------
const localHead = git(['rev-parse', 'HEAD']);
const remote = api([`repos/${REPO}/commits/main`]);
const remoteHead = remote.sha;

if (localHead === remoteHead) die('本地与远程已经是同一个提交，不需要做什么');

const ahead = git(['rev-list', '--count', `${remoteHead}..HEAD`]);
if (ahead !== '1') {
  die(`本地领先 ${ahead} 个提交。这个脚本一次只处理一个——先把历史整理成单个提交，或分批推送。`);
}

// 远程 HEAD 必须是本地 HEAD 的祖先，否则历史已经分叉，硬推会丢东西
try {
  execFileSync('git', ['merge-base', '--is-ancestor', remoteHead, localHead], { cwd });
} catch {
  die('远程 HEAD 不是本地 HEAD 的祖先（历史已分叉）。先 git fetch 看清状况，不要用这个脚本。');
}

// ---------- 2. 这个提交改了哪些文件 ----------
const changed = git(['diff-tree', '--no-commit-id', '--name-only', '-r', localHead]).split('\n').filter(Boolean);
if (!changed.length) die('这个提交没有文件改动');

const message = git(['log', '-1', '--format=%B', localHead]).replace(/\n+$/, ''); // GitHub 会去掉尾换行
const [name, email] = [git(['log', '-1', '--format=%an']), git(['log', '-1', '--format=%ae'])];
const isoDate = git(['log', '-1', '--format=%aI']);
const tz = (git(['log', '-1', '--format=%ai']).match(/([+-]\d{4})$/) || [, '+0000'])[1];
const ts = git(['log', '-1', '--format=%at']);
const localTree = git(['rev-parse', 'HEAD^{tree}']);

console.log(`远程 HEAD  ${remoteHead.slice(0, 7)}`);
console.log(`本地 HEAD  ${localHead.slice(0, 7)}`);
console.log(`改动文件   ${changed.join(' / ')}`);
for (const f of changed) console.log(`           ${f}  ${git(['cat-file', '-s', `HEAD:${f}`])}B`);
if (DRY) { console.log('\n--dry：以上是计划，什么都没做'); process.exit(0); }

// ---------- 3. 上传 blob ----------
const entries = [];
for (const path of changed) {
  const buf = execFileSync('git', ['cat-file', 'blob', `HEAD:${path}`], { cwd, maxBuffer: 256 << 20 });
  const b = api(['--method', 'POST', `repos/${REPO}/git/blobs`, '--input', '-'],
                { content: buf.toString('base64'), encoding: 'base64' });
  const want = git(['rev-parse', `HEAD:${path}`]);
  if (b.sha !== want) die(`blob 校验失败：${path} 得到 ${b.sha.slice(0, 7)}，本地是 ${want.slice(0, 7)}`);
  entries.push({ path, mode: '100644', type: 'blob', sha: b.sha });
  console.log(`  ✓ blob ${path}`);
}

// ---------- 4. 建树 + 提交 ----------
const tree = api(['--method', 'POST', `repos/${REPO}/git/trees`, '--input', '-'],
                 { base_tree: remote.commit.tree.sha, tree: entries });
if (tree.sha !== localTree) {
  die(`树校验失败：远程 ${tree.sha.slice(0, 7)} ≠ 本地 ${localTree.slice(0, 7)}。有文件没传对，已中止，远程未改动。`);
}
console.log(`  ✓ 树 ${tree.sha.slice(0, 7)} 与本地一致`);

const commit = api(['--method', 'POST', `repos/${REPO}/git/commits`, '--input', '-'], {
  message, tree: tree.sha, parents: [remoteHead],
  author:    { name, email, date: isoDate },
  committer: { name, email, date: isoDate },
});
console.log(`  ✓ 提交 ${commit.sha.slice(0, 7)}`);

// ---------- 5. 移动分支指针 ----------
api(['--method', 'PATCH', `repos/${REPO}/git/refs/heads/main`, '--input', '-'], { sha: commit.sha, force: true });
console.log(`  ✓ main → ${commit.sha.slice(0, 7)}`);

// ---------- 6. 把远程对象复现到本地，让两边同 SHA ----------
// 差异只可能来自两处：message 尾换行、时区写法。逐个变体试算，命中才写入。
const body = [
  `tree ${tree.sha}`,
  `parent ${remoteHead}`,
  `author ${name} <${email}> ${ts} ${tz}`,
  `committer ${name} <${email}> ${ts} ${tz}`,
  '',
  message,
].join('\n');

const tryHash = (text) =>
  execFileSync('git', ['hash-object', '-t', 'commit', '--stdin'], { cwd, input: text, encoding: 'utf8' }).trim();

const candidates = [body, body + '\n', body + '\n\n'];
let written = null;
for (const cand of candidates) {
  if (tryHash(cand) === commit.sha) {
    written = execFileSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'],
                           { cwd, input: cand, encoding: 'utf8' }).trim();
    break;
  }
}

if (written !== commit.sha) {
  console.log('\n⚠ 本地复现远程对象失败（提交内容形态有出入）。');
  console.log(`  远程是 ${commit.sha.slice(0, 7)}，本地仍是 ${localHead.slice(0, 7)}，两者内容完全相同。`);
  console.log('  处理：下次 git 通道通了执行 git fetch origin && git reset --hard origin/main 即可收敛。');
  process.exit(2);
}

git(['update-ref', 'refs/heads/main', commit.sha]);
git(['update-ref', 'refs/remotes/origin/main', commit.sha]);
console.log(`  ✓ 本地已对齐（main 与 origin/main 都指向 ${commit.sha.slice(0, 7)}）`);
console.log('\n完成。Pages 会在 1 分钟内自动重建。');
