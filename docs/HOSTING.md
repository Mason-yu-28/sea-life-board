# 两份构建，别搞混

Sea 同时存在**两个运行环境**，它们对文件的要求不一样。搞混的后果：线上看板读不到云端数据，或者公开仓库里带着作者自己的库地址。

| | 线上版（资料库） | 公开版（GitHub） |
|---|---|---|
| 节点 / 文件 | 「Sea-工作台」`<页面节点 ID>`（真实值只记在本地，不入库） | 仓库里的单文件 |
| 云端同步 | **可用**，`DATABASE_ID` 写死为作者的库 | **不可用**，故意留空 |
| `inject.js` | 平台注入的 `<script src="/page/page_comm/inject.js">` 必须在 | 不需要 |
| `data-page-node-id` | 编辑器加的锚点属性，共 500+ 处 | 不需要 |
| 首启 | 空白盘，云端有数据就拉回来 | 空白盘，纯本地 |

## ⚠️ 更新线上版：必须打补丁，不能整份替换

本地母版（`Sea-2.8.html`）里**没有** `inject.js` 脚本标签，也没有那 500 多个 `data-page-node-id`。整份覆盖上去 = 平台注入入口没了 = `window.__SMART_PAGE__` 拿不到 = 云端同步静默失效。

正确做法（2026-10-29 实操验证过）：

```bash
# 1. 开事务，拿到基线版本与 CDN 目录
python3 page/create_page_transaction.py --node-id <页面节点 ID>

# 2. 下载线上那份，作为「带锚点的基线」
curl -fsSL "<url>Sea人生工作台.html" -o live.html

# 3. 把本地相对上一个线上版本的改动做成补丁
diff -u <上一个线上版本的本地副本> Sea-2.8.html > sea.patch

# 4. 打到线上基线里（带属性，会有些 hunk 冲突，逐条人工补）
cp live.html new.html && patch -p0 --fuzz=3 new.html < sea.patch

# 5. 上传 + 提交
python3 page/upload_page_artifact.py --transaction-id <tx> --path "Sea人生工作台.html" --file new.html
python3 page/commit_page_transaction.py --transaction-id <tx> --message "..." 
```

打完补丁必须核对四件事，缺一条都别提交：

1. `grep 缺失元素` —— 所有 `getElementById('x').onclick` 里的 id 都还在（曾因正则贪婪误删过三个 set-row）
2. `grep "DATABASE_ID='"` —— 线上版**应该**还有这个硬编码（值是你的库 ID）
3. `node --check` 两个 script 块都过
4. `SEA_FILE=<补丁后文件> node tests/*.mjs` 全绿（`inject.js` 404 是 file:// 下的正常现象，不算错）

### ⚠️ 不要用 `--fuzz`（v2.10 踩过）

`patch --fuzz=3` 会「忽略 3 行上下文」强行落位，**结果是静默错位**：v2.10 那次它把「存档文件」整行塞进了「流水导出」那一行内部，还留下一个空的 `set-row`；结构错了但语法没错、测试也不报。

正确做法：**`--fuzz=0` 严格打**，让带 `pnid` 属性的块全部失败，再手工补。v2.10 一共失败 5 处，全是同一个原因 —— 平台把属性顺序改成了 `content=... name=...`、并在行内插了 `<!--pnid:...-->`：

| 失败块 | 手工补法 |
|---|---|
| `meta version` | 匹配 `content="x" name="version"`（不是母版那种顺序） |
| `setVerNum` | 值前面可能夹着 `<!--pnid:...-->`，用正则 `(id="setVerNum">)(<!--pnid:[^>]*-->)?` |
| body 顶部新增节点 | 按「`id="saveState"` 那一行之后」插入整段 |
| 设置面板新增行 | 按「`id="btnImport"` 之后的第一个行级 `</div>`」之后插入 |
| JS 新增模块 | 按 `// 初始化：优先加载` 注释前整段插入，再单独改 `init` 头部 |

补完后必查三个数字：`set-row` 数量（原 5 → 应 6）、空 `set-row` 应为 0、`data-page-node-id` 行数不得减少。

## 公开版怎么来的

从母版出发，只做一件事：确认 `DATABASE_ID` 解析链在无宿主环境下返回空（`resolveDatabaseId` 找不到宿主又没有 `?db=` → `cloudReady()` 直接 false → 纯本地）。母版本身已经是这个状态，公开版不需要额外裁剪。

## 加新功能时，补丁里最容易漏的四块

平台注入的东西是 `inject.js` + 每个元素上的 `data-page-node-id` / `<!--pnid:...-->` 锚点。v2.10 加「存档文件」时踩到的清单，以后加功能照这个顺序核：

1. **新增的 DOM 要整块插**（`#fileState` / `#filePerm` 在 `<body>` 顶部），平台不会给它们补锚点 —— **没有锚点不影响运行**，只是这个元素在编辑器里选不中。别为了补锚点去手写 `data-page-node-id`。
2. **新增的 CSS 段整段插**（`/* 存档文件镜像 */` 开头），锚点注入不会碰 `<style>`。
3. **`getElementById(...)` 的可选元素要写空判**：`const el=document.getElementById('x'); if(el) ...`。补丁漏一段时，硬取属性会直接抛错、整个 `bindDomainButtons` 后面的绑定全不执行 —— 这是最难查的那种「点了没反应」。
4. **`SEA_FILE=<补丁后文件> node tests/verify-file.mjs`** 必须全绿：它专门验「元素缺失时优雅跳过」这一路径。

## 线上版回滚

平台没有版本回滚 API。唯一退路是本地备份：`.private/Sea-备份/Sea-线上2.8.5-回滚备份.html`（v2.9 升级前的线上原样副本）。再上传一次即可回到 v2.8.5。
