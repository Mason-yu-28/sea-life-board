// 生成 README 用的截图（虚构数据，绝不碰你的真实存档）
// 用法：node scripts/shots.mjs
// 产物：docs/assets/{cockpit,sail,treasure,finance}.png
//
// 原理：起一个**临时**浏览器配置，往 localStorage 灌一份虚构数据，然后逐页截图。
// 进程结束临时配置即销毁，你的真实存档在别的 profile 里，完全不受影响。
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = process.env.SEA_EDGE ||
  (process.platform === 'win32'
    ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    : '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');

const FILE = 'file:///' + process.cwd().replace(/\\/g, '/') + '/' + (process.env.SEA_FILE || 'Sea-2.8.html');
const OUT = 'docs/assets';
fs.mkdirSync(OUT, { recursive: true });

// ---------- 虚构数据 ----------
const today = new Date();
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const shift = n => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };
const monday = (() => { const d = new Date(today); const w = d.getDay() === 0 ? 7 : d.getDay(); d.setDate(d.getDate() - (w - 1)); return iso(d); })();

const islands = [
  { id: 'il1', name: '拿到心仪的 offer', rarity: '红', sea: '职业', type: '讨伐', minQty: '', deadline: '2026-12-31', desc: '先定三个目标所，再谈投递节奏', status: '进行中', createdAt: shift(-60), lastActive: shift(-1) },
  { id: 'il2', name: '半马完赛', rarity: '紫', sea: '健康', type: '讨伐', minQty: '', deadline: '2026-12-06', desc: '目标 2 小时 10 分内', status: '进行中', createdAt: shift(-45), lastActive: shift(-2) },
  { id: 'il3', name: '体脂降到 15%', rarity: '蓝', sea: '健康', type: '修行', minQty: '', deadline: '', desc: '', status: '进行中', createdAt: shift(-80), lastActive: shift(-1) },
  { id: 'il4', name: '读完 12 本书', rarity: '紫', sea: '成长', type: '修行', minQty: '', deadline: '', desc: '非虚构为主', status: '进行中', createdAt: shift(-70), lastActive: shift(-1) },
  { id: 'il5', name: '存下 3 万', rarity: '紫', sea: '财务', type: '铸造', minQty: '30000', deadline: '2027-06-30', desc: '每月固定转入', status: '进行中', createdAt: shift(-50), lastActive: shift(-3) },
  { id: 'il6', name: '英语口语撑住 20 分钟', rarity: '绿', sea: '成长', type: '修行', minQty: '', deadline: '', desc: '', status: '进行中', createdAt: shift(-30), lastActive: shift(-1) },
];

const sails = [
  { id: 'sc1', action: '改一版简历，投 3 家', sea: '职业', dur: 40, goalId: 'il1', date: shift(0), slot: 0, done: true },
  { id: 'sc2', action: '推日训练（卧推 + 肩）', sea: '健康', cat: '推', dur: 60, goalId: 'il3', date: shift(0), slot: 2, done: false },
  { id: 'sc3', action: '听力 30 分钟', sea: '成长', dur: 30, goalId: 'il6', date: shift(-1), slot: 1, done: true },
  { id: 'sc4', action: '读《置身事外》30 页', sea: '成长', dur: 40, goalId: 'il4', date: shift(-1), slot: 3, done: true },
  { id: 'sc5', action: '跑 5 公里', sea: '健康', dur: 35, goalId: 'il2', date: shift(-2), slot: 0, done: true },
  { id: 'sc6', action: '把月度账单对一遍', sea: '财务', dur: 25, goalId: 'il5', date: shift(-2), slot: 4, done: true },
  { id: 'sc7', action: '面试复盘：写三条改进', sea: '职业', dur: 30, goalId: 'il1', date: shift(1), slot: 1, done: false },
  { id: 'sc8', action: '拉日训练（划船 + 引体）', sea: '健康', cat: '拉', dur: 55, goalId: 'il3', done: false },
  { id: 'sc9', action: '整理项目库：补两条', sea: '职业', dur: 45, goalId: 'il1', done: false },
  { id: 'sc10', action: '口语练习：录一段 3 分钟', sea: '成长', dur: 20, goalId: 'il6', done: false },
];

const routes = [
  { id: 'rt1', name: '工作日节奏', kind: 'loop', days: [1, 2, 3, 4, 5], cards: [{ sailId: 'sc3', action: '听力 30 分钟', sea: '成长', cat: '', desc: '' },
    { sailId: 'sc4', action: '读《置身事外》30 页', sea: '成长', cat: '', desc: '' }],
    desc: '工作日每天两件小事', weekAnchor: monday },
  { id: 'rt2', name: '周末长距离', kind: 'direct', dates: [shift(3)], cards: [{ sailId: 'sc5', action: '跑 5 公里', sea: '健康', cat: '', desc: '' }], desc: '周六一次' },
];

const achieves = [
  { id: 'a1', name: '第一份实习 offer', rarity: '金', sea: '职业', type: '讨伐', intro: '投递 41 天之后', desc: '三轮面试，最后一轮被问到「你最近读的一本书」，答得很实。', time: '2026-09-18', proof: null },
  { id: 'a2', name: '半马 21 公里完赛', rarity: '红', sea: '健康', type: '讨伐', intro: '2 小时 08 分', desc: '', time: '2026-10-05', proof: null },
  { id: 'a3', name: '连续 60 天有记录', rarity: '紫', sea: '成长', type: '修行', intro: '', desc: '', time: '2026-10-12', proof: null },
  { id: 'a4', name: '体重首次破 68', rarity: '蓝', sea: '健康', type: '修行', intro: '', desc: '', time: '2026-08-30', proof: null },
];

const collects = [
  { id: 'c1', name: '《置身事外》', carrier: '书', date: '2026-09-21', star: 5, note: '把财政讲成了故事', cover: null },
  { id: 'c2', name: '《年会不能停》', carrier: '电影', date: '2026-10-02', star: 4, note: '笑着笑着就沉默了', cover: null },
  { id: 'c3', name: '《漫长的季节》', carrier: '剧集', date: '2026-08-14', star: 5, note: '最后那场雪', cover: null },
];

const works = [
  { name: '一份 12 页的行业笔记', carrier: '文', date: '2026-10-08', file: null, note: '自己整理的，不是摘抄' },
];

const exps = [
  { id: 'e1', date: shift(-1), cat: '吃饭', amount: 23.5, merchant: '食堂', src: '手工' },
  { id: 'e2', date: shift(-1), cat: '交通', amount: 6, merchant: '地铁', src: '导入' },
  { id: 'e3', date: shift(-2), cat: '吃饭', amount: 31, merchant: '外卖', src: '导入' },
  { id: 'e4', date: shift(-3), cat: '日用', amount: 68, merchant: '超市', src: '导入' },
  { id: 'e5', date: shift(-4), cat: '娱乐', amount: 45, merchant: '电影票', src: '导入' },
  { id: 'e6', date: shift(-5), cat: '吃饭', amount: 27, merchant: '食堂', src: '导入' },
  { id: 'e7', date: shift(-6), cat: '健康', amount: 129, merchant: '跑鞋鞋垫', src: '手工' },
  { id: 'e8', date: shift(-8), cat: '吃饭', amount: 44, merchant: '聚餐', src: '导入' },
  { id: 'e9', date: shift(-10), cat: '衣服', amount: 199, merchant: '外套', src: '手工' },
  { id: 'e10', date: shift(-12), cat: '交通', amount: 18, merchant: '打车', src: '导入' },
  { id: 'e11', date: shift(-5), cat: '储藏', amount: 200, merchant: '转入应急金', src: '手工', taskId: 's1' },
  { id: 'e12', date: shift(-15), cat: '储藏', amount: 150, merchant: '转入换电脑', src: '手工', taskId: 's2' },
];
const incs = [
  { id: 'i1', date: shift(-6), cat: '薪酬收入', amount: 2500, merchant: '兼职', src: '手工' },
  { id: 'i2', date: shift(-15), cat: '额外收入', amount: 300, merchant: '稿费', src: '手工' },
  { id: 'i3', date: shift(-9), cat: '报销', amount: 120, merchant: '交通报销', src: '手工' },
];

const bodies = [
  { date: shift(-42), weight: 66.8, fat: 17.2, waist: 78, hip: 94, arm: 31 },
  { date: shift(-35), weight: 67.1, fat: 17.0, waist: 78, hip: 94, arm: 31.2 },
  { date: shift(-28), weight: 67.4, fat: 16.6, waist: 77.5, hip: 94, arm: 31.4 },
  { date: shift(-21), weight: 67.2, fat: 16.2, waist: 77, hip: 93.5, arm: 31.6 },
  { date: shift(-14), weight: 67.6, fat: 15.9, waist: 77, hip: 93.5, arm: 31.8 },
  { date: shift(-7), weight: 68.0, fat: 15.6, waist: 76.5, hip: 93.5, arm: 32 },
];

const grows = [
  { id: 'g1', date: shift(-1), content: '听力 30 分钟', dur: 30, goalId: 'il6' },
  { id: 'g2', date: shift(-1), content: '读 30 页', dur: 40, goalId: 'il4' },
  { id: 'g3', date: shift(-2), content: '读书笔记整理', dur: 50, goalId: 'il4' },
  { id: 'g4', date: shift(-3), content: '口语练习', dur: 20, goalId: 'il6' },
  { id: 'g5', date: shift(-5), content: '读 25 页', dur: 35, goalId: 'il4' },
  { id: 'g6', date: shift(-6), content: '听力 30 分钟', dur: 30, goalId: 'il6' },
];

const reviews = [
  { id: 'r1', kind: '周', date: shift(-3), text: '本周动了 9 张卡，没动的是「口语练习」。下周把它挪到早上。' },
  { id: 'r2', kind: '月', date: shift(-20), text: '这个月产出：一份行业笔记、一个项目入库、半马完赛。其余都是输入。' },
];

const DATA = {
  islands, sails, achieves, collects, works, routes,
  occMoves: {}, occGone: {}, occDone: {},
  resumes: [], projects: [],
  pays: [],
  wageRecords: [{ id: 'w1', date: '2026-10-20', resumeLabel: '事务所 · 审计助理（估算）',
    W: 9000, M: 12, C: 800, D: 21, P: 9, T: 1, O: 1, N: 2500 }], cvVersions: [], events: [], firms: [], thresholds: [],
  careerAchieves: [],
  myParams: { W: 9000, M: 12, C: 800, D: 21, P: 9, T: 1, O: 1, N: 2500 },
  exps, incs, catMap: [], budgets: [], finBudget: 1800, finWhite: [], pendingTxns: [], savings: [
    { id: 's1', name: '应急金', target: 6000, monthly: 500, deadline: '2027-03-31' },
    { id: 's2', name: '换电脑', target: 8000, monthly: 400, deadline: '2027-06-30' },
  ],
  bodies, hlthHeight: 172, grows, materials: [], reviews,
  northStar: '2027 年 6 月前，把「能独立完成一个项目」变成简历上的一行事实。',
  focusIslandId: 'il1',
  blankStart: false,
  northStarHistory: [{ text: '先不急着定方向，把手头的事做完再说。', at: shift(-60) }],
  savedAt: Date.now(),
};

// ---------- 截图 ----------
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));

await page.goto(FILE);
await page.waitForTimeout(900);
await page.evaluate(d => localStorage.setItem('sea_workspace_v1', JSON.stringify(d)), DATA);
await page.reload();
await page.waitForTimeout(1400);

const shots = [['cockpit', '船舵'], ['sail', '航行'], ['treasure', '秘宝'], ['finance', '财务']];
for (const [key, label] of shots) {
  await page.evaluate(k => document.querySelector(`[data-nav="${k}"]`)?.click(), key);
  await page.waitForTimeout(700);
  const file = path.join(OUT, key + '.png');
  await page.screenshot({ path: file });
  console.log('  ✓ ' + label + ' → ' + file + '  (' + Math.round(fs.statSync(file).size / 1024) + 'KB)');
}

// 自证：截图上不该出现真实存档（临时 profile 是干净的）
const n = await page.evaluate(() => (JSON.parse(localStorage.getItem('sea_workspace_v1') || '{}').islands || []).length);
console.log('  岛屿卡数（虚构数据自检）：' + n + '，JS 报错：' + (errs.length ? errs[0] : '无'));

await browser.close();
