# AUDIT-03 · 缺陷与风险清单

> 体检对象：`Sea-2.8.html`（10272 行 / 606KB）
> 体检日期：2026-10-28
> 方法：静态阅读 + 定向抽样（不依赖运行）。**未做**：真机运行、压力测试、跨浏览器实测。
> 每条都带行号，可自行复核。凡标「待验证」的，是我从代码推断出可能出问题、但还没有运行证据的。

## 修复状态（2026-10-29 追加，v2.8.6）

上表之外，这一轮用真实浏览器（Edge + Playwright）逐条跑过，`tests/verify-fixes.mjs` 15 项断言全绿。

| 编号 | 原问题 | 状态 |
|---|---|---|
| P0-1 | 云端库 ID 硬编码 | ✅ 已修（改为宿主注入 / `?db=` / 降级纯本地） |
| P0-2 | `seedDemo` 含真实画像 | ✅ 已修（v2.9.0 作者定案：示例数据整块删除，首启即空白盘） |
| P1-1 | `validArchive` 白名单漏项 | ✅ 已修（改成通用判断） |
| P1-2 | 自愈路径不剥附件 | ✅ 已修（走 `persistForce()`；直接调 `persist()` 会因指纹判等而空转，这点已在注释里写明） |
| P1-3 | 附件分片最后一片无上限 | ✅ 已修（first-fit + overflow 明确提示） |
| P1-4 | 导入不写附件 key | ✅ 已修（导出带上 `__assets`，导入拆回） |
| P2-2 | 存储探针失败被永久缓存 | ✅ 已修（只在成功时缓存） |
| P2-7 | `finYear` 恢复不了 | ✅ 已修（`hydrate` 复用 `STATE_KEYS`，三份清单合一） |

**本轮新查出、原清单里没有的：**

| 编号 | 问题 | 严重度 | 状态 |
|---|---|---|---|
| N-1 | **导出备份不含任何附件**，弹窗却写「含成就凭证、影音封面」——换设备恢复会静默丢图 | P0 | ✅ 已修 |
| N-2 | 示例数据「英语考试通过」改名后，引用点仍按旧名 `find`，成长流水第 2 条丢目标关联 | P1 | ✅ 已修（运行验证：待归类 2 条 → 1 条） |
| N-3 | 凭证原图不压缩，2MB 图转 base64 变 2.7MB，两张即顶穿约 4.75MB 配额 | P1 | ✅ 已修（图片压到最长边 1400px） |
| N-4 | **存储型 XSS**：卡片名 / 商户 / 备注直接拼进 `innerHTML`，实测 `<img onerror>` 在八个页面共执行 40+ 次 | P1（自用可忽略，分发后是真实攻击面） | ✅ 已修（v2.9.0：全局 `esc()` + `safeUrl()`，三种载荷实测执行 0 次；根因是三处局部 `esc` 不转义单引号） |
| N-5 | 3 秒一次全量序列化（附件 875KB 时等于每 3 秒搬 1MB 字符串） | P2 | ⏳ 未修，重构级 |

**已验证没有问题的**：八个页面在「空数据 / 超长文本 / 1200 张卡」三态下不白屏不报错；零外部依赖（无 `<script src>`、无外链）；`file://` 下 localStorage 可写、关浏览器重开仍在、上限约 4.75MB；但**所有 `file://` 页面共用同一 origin**，同浏览器里两个版本的 Sea 会共用一份存档。

---

## 分级定义

| 级别 | 含义 |
|---|---|
| **P0** | 会泄露数据或不可逆丢失，必须在上传 GitHub 前处理 |
| **P1** | 功能错误 / 静默失败 / 数据看着消失，用户能感知 |
| **P2** | 性能债、架构债、一致性缺陷，暂时不影响正确性 |

---

## P0

### P0-1 · 云端数据库 ID 硬编码在源码里

**位置**：3766 行

```js
const DATABASE_ID='<库 ID>';
```

**问题**：这个 ID 指向你资料库里存 Sea 全部数据的那张表。代码一旦公开，任何人都能拿到它。

**危害取决于平台鉴权**，有两种可能：
- 若数据库权限是"仅本人可读写"（靠 `window.__SMART_PAGE__` 的会话鉴权）→ 别人拿到 ID 也读不了，风险可控。
- 若权限宽松（这类低代码库常见"登录用户可读写"）→ 别人可以直接查询、覆盖你的生活数据，包括账单、体重、简历。

**为什么是 P0**：GitHub 的历史是不可逆的。哪怕你 5 分钟后删掉，代码可能已经被爬虫、镜像站、fork 抓走。这类东西只能"推之前就决定"，不能"推了再改"。

**处理建议**（三选一，按安全度排序）：
1. 改成运行时从平台注入的对象里取（如果 SDK 提供了 databaseId 的话），源码里不出现字面量。
2. 保留字面量，但**先确认该库的读写权限**，确认外部无鉴权时确实读不到，再决定是否公开。
3. 公开版里把这个常量替换成占位符 `'YOUR_DATABASE_ID'`，正文加一行注释说明"自建实例请填自己的"。代价：你自己的公开版跑不起来云同步，需要另存一份带真实 ID 的私有副本。

**我倾向 3**，因为你本来就有"日常用发布链接、工程文件留档"的两套载体，公开仓库的定位是"展示与学习"，不需要真的连你的数据库。

---

## P1

### P1-1 · 存档有效性判断漏掉一半数据类型，可能导致真实存档被判坏档

**位置**：3649–3654 行

```js
function validArchive(d){
  if(!d || typeof d!=='object') return false;
  if(d.blankStart) return true;
  return ['islands','sails','achieves','collects','works','resumes','projects','pays','exps','incs',
    'bodies','grows','reviews','wageRecords'].some(k=>Array.isArray(d[k]) && d[k].length>0);
}
```

**白名单里有 14 类，缺了这些**：`routes`（航线）、`savings`（储蓄任务）、`materials`（素材）、`careerAchieves`（职业成就）、`northStarHistory`（北极星历史）、`thresholds`、`firms`、`events`、`cvVersions`、`catMap`。

**可达的出错路径**：
1. 用户不用岛屿卡，只用**航线**排训练（你的 CHANGELOG 里写过"他把训练做成了航线"——这正是真实用法）。
2. 他把工作台里的岛屿、航行卡、流水、体测、成长流水、复盘逐条删空，但**没点"清空数据"**这个按钮（所以 `blankStart` 还是 `false`）。
3. 刷新 → `loadStore()` 读到的存档 `validArchive` 返回 `false` → 返回 `false` → 启动逻辑走"没有有效存档"分支 → **灌入示例数据**。

**为什么算 P1 而不是 P0**：用户的原始数据仍在 localStorage 里（`sea_workspace_v1` 没被删），只是页面显示了示例数据，看起来像"东西全没了"。而且 `snapshotLocal` 会留一份快照。有救，但用户会先被吓一跳。

**修法**：把判断改成"任意一条数据非空即可"，而不是维护一份容易漏的白名单：

```js
function validArchive(d){
  if(!d || typeof d!=='object') return false;
  if(d.blankStart) return true;
  // 任意一个有内容的字段都算有效存档；只判"有没有真的装过东西"
  return Object.keys(d).some(k=>{
    if(k==='savedAt') return false;
    const v=d[k];
    return (Array.isArray(v) && v.length>0) || (typeof v==='string' && v.trim()!=='');
  });
}
```

这样以后新增任何数据结构都不需要回来改这个函数——**白名单式的校验，只要忘了加一项就会复现同一个 bug**。

---

### P1-2 · 冷启动"自愈"路径没剥离附件，导致自愈机制实际上从不生效

**位置**：4008–4011 行

```js
// ③ 冷启动：本机存档比云端新 = 本机有没推上去的改动 → 不覆盖，反过来把本机推上去（自愈）
if(!_localDemo && num && _localSavedAt && num < _localSavedAt-1000){
  cloudPush(JSON.stringify(Object.assign({},buildData(),{savedAt:_localSavedAt})));
  return false;
}
```

**问题**：`persist()` 推云端时走的是 `detachAttach()` 剥离后的 `dataJson`（3618–3646 行），**这里却是直接 `JSON.stringify(buildData())`，附件 base64 原封不动全在里面**。

于是必然撞上 `cloudPush` 自己的门禁（3868 行）：

```js
if(jsonStr.length > 900*1024){ _cloudTooBig=true; setSave('big'); ... return; }
```

**结果**：只要你的附件（封面、简历、凭证）加起来超过 900KB——按你的 CHANGELOG，光"影音封面 + 简历 + 凭证"就足够超——这条自愈路径**永远推不上去**，而且会把右下角状态打成「存档过大 · 已暂停同步」，比不生效更糟：它会误导你以为同步被关了。

**这正是"数据没同步上去"这类事故的一个来源**：本机有改动、云端是旧的，本该自愈，实际什么也没发生。

**修法**：复用 persist 的剥离逻辑，别自己拼 JSON：

```js
if(!_localDemo && num && _localSavedAt && num < _localSavedAt-1000){
  persist();          // persist 内部会剥离附件、分别推主数据与附件、并带上正确的 savedAt
  return false;
}
```
（`persist` 有 `_lastDataJson` 指纹，内容没变时不会重复推，所以直接调是安全的。）

---

### P1-3 · 附件分片在最后一桶没有容量上限，超限后静默失败

**位置**：3824–3833 行

```js
function packAssets(map){
  const buckets=ASSET_SLOTS.map(function(){ return {}; });
  let cur=0, used=0;
  Object.keys(map).forEach(function(k){
    const len=k.length+map[k].length+8;
    if(cur<ASSET_SLOTS.length-1 && used+len>ASSET_LIMIT){ cur++; used=0; }
    buckets[cur][k]=map[k]; used+=len;
  });
  return buckets;
}
```

**两个漏洞**：

1. **最后一桶（`cur===3`）不再换桶，也不检查容量**。`cur<ASSET_SLOTS.length-1` 为 false 时，条件整体短路，剩余所有附件全部堆进 `assets3`，可以堆到 10MB。而云端单条记录的实际上限约 700KB～1MB（你 CHANGELOG 里实测过），于是 `assets3` 的写入被拒 → `pushAssetChunks` 的 `.catch` 只打一行 `console.warn` → **用户看不到任何提示，附件在云端就是没有**。

2. **单个附件大于 600KB 时**，第一次循环就 `used+len > LIMIT` 且 `cur=0 < 3`，于是直接跳进 `buckets[1]`，`assets0` 空着——分片从第二片开始，浪费一桶；如果连续两三个大附件，会更快耗光四桶。

**修法**：先按大小排序做装箱（first-fit），并在超限时**报错而不是静默塞进去**：

```js
function packAssets(map){
  const slots=ASSET_SLOTS.map(()=>({}));
  const used=ASSET_SLOTS.map(()=>0);
  const keys=Object.keys(map).sort((a,b)=>map[b].length-map[a].length); // 大的先放
  const overflow=[];
  keys.forEach(function(k){
    const len=k.length+map[k].length+8;
    let i=used.findIndex(u=>u+len<=ASSET_LIMIT);
    if(i<0){ overflow.push(k); return; }
    slots[i][k]=map[k]; used[i]+=len;
  });
  if(overflow.length) console.warn('[sea] 附件超出 4 片容量，未能上传：', overflow);
  return slots;
}
```
再把 `overflow` 的结果通过 `setSave('big')` 或一次 toast 告诉用户，而不是让它消失。

---

### P1-4 · 导入备份时直接写主存档，没走剥离逻辑（待验证）

**位置**：9856–9864 行

```js
function applyImported(d){
  _resetting=true;
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify(d));
  }catch(e){ ... toast('写入失败：浏览器存储不可用或空间已满（图片凭证可能太大）'); return; }
```

**问题**：如果导出的备份 JSON 里带着 base64 附件（需要看导出函数是否剥离，这条我没跑通验证，标**待验证**），那么：
- 写进 `sea_workspace_v1` 的就是一份带图的巨型存档，v2.8 好不容易拆开的"主数据永远很小"当场被破坏；
- 附件要是超过 localStorage 配额，直接抛异常 → 导入失败。

**验证方法**：导出一次备份，用编辑器搜 `data:image` 或 `data:application`。有 → 成立。

**修法**：与 `persist` 保持一致，先 `detachAttach(d)` 得到 `assets`，主数据写 `STORE_KEY`，附件写 `ASSET_KEY`。

---

## P2

### P2-1 · 两个"上次落盘指纹"初始化口径不一致，每次启动多推一次全量

**位置**：3681 行（`loadStore`）、4024 行（`cloudApply`）

```js
_lastDataJson=JSON.stringify(buildData());   // 含附件 base64
```

而 `persist` 里比较的是**剥离附件后**的 `dataJson`（3630 行）。两者永远不可能相等 → 启动后的第一次 `persist` 必然判定"主数据变了"，于是无谓地推一次云端。

不致命（内容一样，只是浪费一次写入），但会让 `setSave('saving') → 'ok'` 闪一下，也会给云端多留一次 `updatedAt`。

**修法**：抽一个 `serializeMain(d)` 函数，`persist` / `loadStore` / `cloudApply` 三处都调它，保证只有一套序列化口径。

---

### P2-2 · 存储探针失败后被永久缓存

**位置**：3599–3609 行

```js
function storeProbe(){
  if(_storeOK!==null) return _storeOK;
  ...
}
```

一旦某次探测失败（比如隐私模式、或者恰好配额满），`_storeOK` 被钉成 `false`，整个会话内不再复查。用户腾出空间后，红条也不会消失。

**修法**：失败时不缓存（只在成功时缓存），或加一个 30 秒的重试窗口。

---

### P2-3 · 每 3 秒一次全量剥离 + 两次大 JSON 序列化

**位置**：4059 行 `setInterval(persist, 3000);`

`persist()` 每次都执行 `detachAttach`（遍历 5 张表）+ 两次 `JSON.stringify`。附件按你现在的量级（`Sea-原图备份` 875KB）算，等于**每 3 秒在主线程上搬 1MB 的字符串**，而且绝大多数时候内容根本没变。

**修法**：加脏标记。`save()` 已经节流 200ms，定时器只作为兜底：

```js
let _dirty=false;
function markDirty(){ _dirty=true; save(); }
setInterval(function(){ if(_dirty){ _dirty=false; persist(); } }, 30000);
```
这样空闲时零开销，异常情况下 30 秒内仍会落盘。

---

### P2-4 · ID 生成没有统一入口

**位置**：全文件约 20 处 `'xxx-'+Date.now()`

单个点击场景（一次 `onclick` 只造一个 ID）不会撞。批量场景你已经处理过了——8782 行用 `n++` 兜住，8710 行用 `Math.random()` 兜住。

但这是**靠每个调用点自己记得**，不是靠机制。下次加一个新模块时漏掉后缀，就是重复 ID → 编辑一条会改到另一条。

**修法**：加一个 10 行的 `uid(prefix)`，全库替换：

```js
let _uidSeq=0;
function uid(prefix){ return prefix+'-'+Date.now().toString(36)+'-'+(++_uidSeq).toString(36); }
```

---

### P2-5 · 派生卡的属性依赖 `sailId` 实时查，删掉航行卡会让历史记录消失

**位置**：8846–8853 行（`_isTrainCard` / `_catOf`）

派生卡自己的 `cat` 是个副本，真正取值走 `sailId` → 找回同名航行卡。**航行卡一旦被删，`cardCat()` 返回空，`_isTrainCard()` 就返回 false** ——于是那条航线派生出来的、已经勾完的训练记录，从热力图和"本周训练"里直接消失。

数据没丢（`occDone` 还在），但统计口径变了，且没有任何提示。

**修法**：`_catOf()` 已经在做同名兜底，但没有兜住"同名卡也没了"的情况。可以在删除航行卡时，先把 `cat` 快照写回所有引用它的派生卡（`c.cat = cat`），断掉这条实时依赖。

---

### P2-6 · 关闭页面时只落本地，不推云端

**位置**：4060 行 `window.addEventListener('beforeunload', persist);`

`persist` 里 `cloudPush` 是异步的（Promise），`beforeunload` 里发起的网络请求大概率来不及完成。本地能存住（`localStorage.setItem` 是同步的），云端要靠下次启动的自愈——**而自愈正是 P1-2 那个不生效的路径**。

两条叠加，实际行为是：关页面前的最后一次改动，云端可能永久落后。

**修法**：修好 P1-2 后这条自动缓解（下次启动会自愈）。另外可以加 `visibilitychange`（`hidden` 时立即 persist），比 `beforeunload` 触发更早、更可靠。

---

### P2-7 · `finYear` 存得进存档，恢复不回来（脚本比对确认）

**位置**：3687–3691 行（`hydrate` 的 keys）

`finYear`（消费曲线看哪一年，3534 行注释写"持久化"）在 `STATE_KEYS`（3558）和 `buildData`（3613）里都有，**唯独 `hydrate` 的 keys 数组里没有**。

用脚本比对三份清单的结果：

```
buildData: 49 项 | STATE_KEYS: 49 项 | hydrate: 48 项
buildData 有但 hydrate 无: finYear
```

后果：每次刷新或云端回灌，`finYear` 静默回到 `0`（当前年）。用户切到 2025 看曲线，刷新后跳回 2026——不丢数据，但丢状态，而且**没有任何报错**。

**修法**：加回去是一行。真正的修法是合并那三份清单（见 `AUDIT-01` §八），消除这一类 bug。

---

## 我检查了什么 / 没检查什么

**已检查**（有代码证据）：
- 持久化链路全流程：`persist` / `loadStore` / `hydrate` / `snapshotLocal` / `cloudPush` / `cloudPushAssets` / `cloudLoad` / `cloudApply` / `flushCloud` / `applyImported`
- 存档有效性判断、附件剥离与分片、状态默认值快照与 `resetMemory`
- 统计口径主入口 `entriesOn` / `trainEntriesOn` / `trainWeekDays`
- 导入链路：`parseBillText` 之后的落库、待分类队列、去重计数
- 全局副作用：定时器、`beforeunload`、`pointerdown` 涟漪

**未检查 / 需要运行才能确认**（下一轮补）：
- 八个页面在真实浏览器里的布局与尺寸（jsdom 测不出，必须 Playwright）
- 拖拽交互的完整路径（`dragState` 跨 `dragover`/`drop` 的实际行为）
- 198 处 `innerHTML` 里有多少拼接了用户输入（需要逐个看上下文才能定性，抽样未发现明显注入点，但没查完）
- 130 处 `addEventListener` 的重复绑定与泄漏
- 移动端断点（`≤900px`）下的实际表现
- 附件导入的真实配额上限（需要真机试）

**为什么没有一次查完**：静态阅读能定性"逻辑上会错"，但定不了"看上去错"。布局与交互必须跑起来看。这也是重建测试的理由——不是为了交差，是因为**这个项目已经大到靠人眼看不完**。
