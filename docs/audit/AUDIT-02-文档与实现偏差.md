# AUDIT-02 · 文档与实现偏差

> 目的：找出"文档写的"和"代码实际上做的"不一致的地方。
> 方法与局限先讲清楚：**我没有通读 18 份设计文档**（合计 1.2MB，含 90 号台账 127KB）。我用的是「可机械比对的地方先比，读到才记」的策略。
> 所以这份是不完整的，但**下面每一条都是核实过的**，不是推测。

## 一、已核实（3 条）

### D-1 · 「630 项冒烟全绿」——脚本已经不存在

**文档说法**：`CHANGELOG.md` v2.8 一节写「`smoke-v280` 拦住了」、「`verify-sync-v206` 的假数据库」，设计文档里多次出现"630 项冒烟全绿"。

**实际情况**：`Sea文件` 目录下搜 `smoke*` / `verify*` / `test*` / `package.json`，**全部为空**。

```
$ find . -maxdepth 2 -iname "*smoke*" -o -iname "*test*" -o -iname "package.json"
（无输出）
```

**为什么这条最严重**：它不只是一个文件丢了。它意味着**"改完敢不敢上线"这件事，现在没有第二道闸门**。你目前唯一的保障是"改完自己点一遍"——而 v2.8 那次事故（附件撑爆主数据）恰恰是"点一遍点不出来"的那种。

**处置**：列为包 1 的硬任务，重建 `tests/`。注意当年的经验要继承：jsdom 测不出布局，`beforeunload → reload` 的竞态也测不出，所以必须双层。

---

### D-2 · `finYear` 存得进去，恢复不回来

这条是我用脚本比对三份字段清单查出来的，属于**文档说"持久化"、实现漏了一处**。

`Sea-2.8.html` 里有三份几乎相同的手工字段清单：

| 位置 | 变量 | 字段数 |
|---|---|---|
| 3555–3560 | `STATE_KEYS`（清空时用它归零） | 49 |
| 3610–3616 | `buildData()`（落盘时用它收集） | 49 |
| 3687–3691 | `hydrate()` 的 keys（恢复时用它写回） | **48** |

差集结果：

```
buildData 有但 hydrate 无: finYear
STATE_KEYS 有但 hydrate 无: finYear
```

**后果**：`finYear` 是「消费曲线看哪一年」（3534 行注释明确写"持久化"）。它会被写进存档（`buildData` 收了），但 `hydrate` 恢复时**跳过了它**。所以每次刷新 / 云端拉取后，`finYear` 回到初始值 `0`，也就是"当前年"。

用户切到 2025 年看曲线，刷新一下跳回 2026——数据没丢，但"我在看哪一年"这个状态丢了。

**修法**：把 `'finYear'` 加进 `hydrate` 的 keys 数组（3689 行，`'finChartGran'` 后面）。

**更重要的修法**：这三份列表本来就是同一份东西列了三遍，`hydrate` 漏一项不会有任何报错，只会静默少恢复一个字段。建议合并成一个 `PERSIST_KEYS` 常量，三处引用：

```js
const PERSIST_KEYS=[ 'islands','sails', /* … */ ];
const STATE_DEFAULTS = Object.fromEntries(PERSIST_KEYS.map(k=>[k, structuredClone(eval(k))]));
function buildData(){ return Object.fromEntries(PERSIST_KEYS.map(k=>[k, eval(k)])); }
function hydrate(d){ PERSIST_KEYS.forEach(k=>{ if(d[k]!==undefined) eval(k+'=d[k]'); }); /* 迁移… */ }
```

改完之后，"新增字段忘了加"这一类 bug 就永久消失了。这是全项目性价比最高的一次重构：**零行为变化，消除一整类缺陷**。

---

### D-3 · 版本号注释不同步

**位置**：8812 行

```js
// === 健康域的训练条目：航行卡 + 航线派生卡（v2.9.0）===
```

但文件整体是 **v2.8**（第 4 行版本注释、`meta`、`CHANGELOG.md` 都以 v2.8 为准）。

**无害**，但它说明：局部注释里的版本号是随手写的，不可作为"这段是什么时候加的"的依据。做版本考古请以 `CHANGELOG.md` + `Sea-备份/` 为准。

---

## 二、待核清单（下一轮要做的）

这些需要真正读文档才能比对，我不在这里编结论：

| 编号 | 要核什么 | 怎么核 | 成本 |
|---|---|---|---|
| T-1 | `05-引擎-数据模型.md` 的字段字典 vs 代码实际字段 | 从文档提取字段表，与 `buildData` 的 49 个 key 做差集；再逐个看类型是否一致 | 中 |
| T-2 | `09-引擎-UI规格与设计系统.md` 的色值/间距 vs CSS 实际值 | 提取文档里的 `#RRGGBB` 与 CSS 里的做集合比对 | 低（可脚本化） |
| T-3 | `90-遗漏点与待议.md` §3「仍未闭的」 vs 代码是否已修 | 逐条读 §3，去代码里找对应实现 | 高（§3 之外还有 127KB） |
| T-4 | `10-实例配置.md` 的个人配置 vs `seedDemo` 的默认值 | 看两者是否已经分叉（示例数据里混了个人真实值？） | 中 |
| T-5 | `07-引擎-运维治理.md` 的发布流程 vs 实际 `import_html.py` / `publish_page.py` 流程 | 这两个脚本不在本目录，需要先找到 | 中 |

### T-2 可以固化成脚本（建议放进 `scripts/`）

```js
// scripts/check-doc-drift.mjs
// 用法：node scripts/check-doc-drift.mjs
// 作用：把「文档里提到但代码里找不到」的颜色 / 字段列出来
import fs from 'node:fs';

const html = fs.readFileSync('Sea-2.8.html', 'utf8');
const doc  = fs.readFileSync('Sea-设计文档/09-引擎-UI规格与设计系统.md', 'utf8');

const colors = (s) => new Set((s.match(/#[0-9A-Fa-f]{6}\b/g) || []).map(c => c.toUpperCase()));
const inDoc = colors(doc), inCode = colors(html);

const onlyDoc = [...inDoc].filter(c => !inCode.has(c));
console.log('文档有、代码无：', onlyDoc.length, onlyDoc.slice(0, 20).join(' '));
```

跑一次就知道 `09` 里画的色板有多少已经和实现对不上——那种文档比没有文档更危险，因为**它会让人以为改对了**。

---

## 三、一个结构性观察

你的文档体系是「**往里加**」的：每轮迭代都在 `00` 顶部加一段版本说明，`90` 台账一直往后追加，`CHANGELOG.md` 已经 41KB。

好处是可追溯性极强——你做审计应该能感觉到，这是底稿思维，很好。
代价是**没人能从顶部读出"现在是什么状态"**。`00-文档地图与索引.md` 已经有 57KB，而"当前系统怎么运作"这个最该一眼看到的东西，被埋在 28 个版本变更段之后。

所以包 1 的文档标准化，重点不是"再写更多"，而是**加一层入口**：

- `README.md`（对外）：它是什么、怎么跑、几张图、局限。
- `docs/ARCHITECTURE.md`（对外）：现状态的结构说明，**不写历史**，只写"现在长这样、为什么"。
- `docs/GLOSSARY.md`：术语 ↔ 字段名映射。
- 原有的 `Sea-设计文档/` 保持不动，作为**决策历史档案**——它的价值恰恰在于记录了"为什么当时这么选"，这东西无法重建。

一句话：**新增"现在的样子"，保留"为什么变成这样"，两者不要混在一份文档里。**
