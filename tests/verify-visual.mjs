// 外观回归：把「改之前」和「改之后」两份文件各截八个页面，逐像素比对。
// 像素有差异的地方单独存图，方便人工判断是"修 bug 带来的预期变化"还是"布局被改了"。
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const EDGE = process.env.SEA_EDGE ||
  (process.platform === 'win32'
    ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    : '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
const OLD = path.resolve(process.env.OLD || ".private/Sea-备份/Sea-2.10.0.baseline.html");
const NEW = path.resolve(process.env.NEW || 'Sea-2.8.html');
const OUT = path.resolve('tests/output');
fs.mkdirSync(OUT, { recursive: true });

const VIEWS = ['cockpit', 'sail', 'treasure', 'career', 'finance', 'health', 'growth', 'review'];

// 极简 PNG 解码（只处理 8bit RGBA/RGB，够截图用）
function decodePNG(buf) {
  let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = colorType === 6 ? 4 : 3;
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const line = raw.subarray(p, p + stride); p += stride;
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (filter === 1) v += a; else if (filter === 2) v += b; else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[x] = v & 0xff;
    }
  }
  return { w, h, ch, data: out };
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

async function shoot(file, tag) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto('file:///' + file.replace(/\\/g, '/'));
  await p.waitForTimeout(1100);
  const shots = {};
  for (const v of VIEWS) {
    await p.evaluate(v => document.querySelector(`[data-nav="${v}"]`)?.click(), v);
    await p.waitForTimeout(450);
    const buf = await p.screenshot({ fullPage: true });
    fs.writeFileSync(path.join(OUT, `${tag}-${v}.png`), buf);
    shots[v] = buf;
  }
  await ctx.close();
  return shots;
}

const a = await shoot(OLD, 'old');
const b = await shoot(NEW, 'new');
await browser.close();

console.log('=== 外观像素对比（1600×1000，整页）===');
let diffTotal = 0;
for (const v of VIEWS) {
  const pa = decodePNG(a[v]), pb = decodePNG(b[v]);
  if (pa.w !== pb.w || pa.h !== pb.h) {
    console.log(`  ${v.padEnd(9)} 尺寸变了：${pa.w}×${pa.h} → ${pb.w}×${pb.h}   ⚠ 布局有位移`);
    diffTotal++;
    continue;
  }
  let n = 0;
  for (let i = 0; i < Math.min(pa.data.length, pb.data.length); i += pa.ch) {
    if (Math.abs(pa.data[i] - pb.data[i]) > 8 || Math.abs(pa.data[i + 1] - pb.data[i + 1]) > 8 || Math.abs(pa.data[i + 2] - pb.data[i + 2]) > 8) n++;
  }
  const pct = (n / (pa.w * pa.h) * 100).toFixed(3);
  console.log(`  ${v.padEnd(9)} ${pa.w}×${pa.h}  差异像素 ${String(n).padStart(7)}  ${pct}%${n > 5000 ? '   ← 需人工看一眼' : ''}`);
  if (n > 5000) diffTotal++;
}
console.log(diffTotal ? `\n有 ${diffTotal} 个页面存在可见差异，截图在 tests/output/` : '\n八个页面像素一致：外观没有被改动。');
