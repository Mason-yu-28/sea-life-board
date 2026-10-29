# 发布到 GitHub：传什么、不传什么

> 结论先给：**29 个文件，约 1.9MB**（其中 930KB 是四张截图）。主文件一个，其余全是文档、测试和脚本。
> 个人数据、历史版本、内部判定清单**物理隔离**在 `.private/` 和 `_archive/`，`.gitignore` 已经拦住。

---

## 一、上传清单

> 表里不编号。加文件就要重排一遍号码，是个纯粹的维护负担。

| 文件 | 大小 | 为什么传 |
|---|---|---|
| `Sea-2.8.html` | 610KB | **产品本体**。单文件全部代码。（文件名是历史遗留，版本号在设置面板里看，当前 2.10.0） |
| `index.html` | 1KB | GitHub Pages 的首页：跳转到 `Sea-2.8.html`。只有 20 行，没有它 Pages 根路径就是 404 |
| `README.md` | 11KB | 门面。别人点进来 30 秒决定要不要看下去：三段式——定位与截图 / 它和别的不一样在哪 / 数据与局限 |
| `CHANGELOG.md` | 54KB | **这个项目最值钱的文档**：每次事故的根因复盘。已脱敏 |
| `docs/GUIDE.md` | 13KB | 使用说明。陌生人从这里开始，不用读别的 |
| `docs/DESIGN.md` | 9KB | 设计取舍：为什么单文件、数据模型、派生卡为什么不回写源、已踩的坑、技术债 |
| `docs/HOSTING.md` | 11KB | 三个版本的关系 + 同步纪律 + 线上更新流程（节点 ID 已换成占位符） |
| `docs/PUBLISH.md` | 本文件 | 发布清单 + 上传前 7 项检查，给未来的自己看 |
| `docs/GITHUB-PLAYBOOK.md` | 5KB | 一页纸发布手册：日常发版 5 步 + 出问题对照表。作者本人最常翻的一份 |
| `docs/REPO-TEXT.md` | 4KB | 仓库级文案：About 描述 / Topics / Release 正文 / 社交预览图规格 |
| `docs/audit/AUDIT-01-代码地图.md` | 14KB | 万行单文件怎么读——公开这个，等于先回答了「你自己看得懂吗」 |
| `docs/audit/AUDIT-02-文档与实现偏差.md` | 8KB | 文档与代码对不上的地方，诚实记录 |
| `docs/audit/AUDIT-03-缺陷与风险清单.md` | 18KB | 缺陷台账（含已修/未修）。自曝短板，但也是可信度来源 |
| `tests/verify-blank.mjs` | 3KB | 空白首启回归 |
| `tests/verify-fixes.mjs` | 12KB | 15 项存档与口径断言 |
| `tests/probe-xss.mjs` | 3KB | 3 种 XSS 载荷 × 8 页 |
| `tests/verify-file.mjs` | 15KB | 存档文件镜像 23 项 |
| `tests/verify-visual.mjs` | 4KB | 像素级外观回归 |
| `package.json` + `.gitignore` | 1KB | 测试只依赖 `playwright-core`；`.gitignore` 是隐私边界本身，必须入库 |
| `LICENSE` | 1KB | MIT |
| `docs/assets/{cockpit,sail,treasure,finance}.png` | 930KB | README 首屏证据。**里面是虚构数据**，由 `scripts/shots.mjs` 在临时浏览器配置里生成 |
| `scripts/shots.mjs` | 11KB | 重拍截图的脚本（别人想换截图自己跑） |
| `scripts/release.mjs` | 8KB | 一条命令发布：核对版本 → 导出 → 校验 → push → tag → Release。检查不过就中止 |
| `scripts/export-public.mjs` | 6KB | 从 git 白名单导出「发布版」。想让「产物与源」保持一致的人会看它 |
| `scripts/sync-check.mjs` | 9KB | 只读校验三版是否对齐（作者自用；公开也算透明） |

**依赖只有一个**：`playwright-core`（跑测试用，不是运行时依赖）。别人 clone 下来 `npm i` 就能跑 `npm test`。

---

## 二、不上传（已经被 `.gitignore` 拦住）

| 排除项 | 体积 | 里面是什么 | 为什么不能传 |
|---|---|---|---|
| `.private/` | **25MB** | 真实存档 JSON、原图备份、设计文档（引擎 00–09 + 实例 10–14）、31 个历史版本 HTML、含真实数据的截图 | 整份个人画像 + 作者私有设计体系 |
| `_archive/` | 1.2MB | 前身产品草稿、皮肤预览 | 历史垃圾，只会让人困惑 |
| `node_modules/` | 14MB | 依赖 | `npm i` 能装回来 |
| `tests/output/` | 5.5MB | 8 页截图 | 跑测试会自动重新生成 |
| `docs/SENSITIVE-REVIEW.md` | 8KB | 敏感项判定清单 | **这份文档本身就是「哪里有隐私」的地图**，只能本人看 |
| `.workbuddy/` | — | 本机会话产物 | 与产品无关 |
| `Sea-备份/`、`*.bak.html`、`Sea-数据-*.json`、`Sea-设计文档/` | — | 兜底规则 | 防止文件被挪到根目录时漏网 |

> `.gitignore` 里还留了一组「兜底规则」（`Sea-数据-*.json`、`Sea-备份/` 等）。上面两条目录级规则已经覆盖，兜底规则是防「文件被随手复制到根目录」。

---

## 三、上传前必做的 7 项检查

```bash
# ① 敏感串扫描：不得出现库 ID / 页面节点 ID / 本机绝对路径
#    真值写在 .private/grep-keys.txt（这个文件本身不入库，所以扫描式里看不见真值）
grep -rEnf .private/grep-keys.txt --include="*.md" --include="*.html" --include="*.mjs" .  \
  --exclude-dir=node_modules --exclude-dir=.private --exclude-dir=_archive

# ② 数量核对：git 里的文件数 == 02 目录里的文件数
git ls-files | wc -l && find ../02-GitHub发布版 -type f | wc -l

# ③ 体积核对：主文件约 600KB，整个仓库 < 2MB
ls -lh Sea-2.8.html && du -sh .git

# ④ 版本号一致：三处都应显示同一版本
grep -m1 '"version"' package.json
grep -o 'id="setVerNum">[^<]*' Sea-2.8.html
head -3 CHANGELOG.md

# ⑤ 测试全绿（第一条就是 verify-blank，同时兜住「首启空白」这一项）
npm i && npm test

# ⑥ 三版同步：02 = 01 的 HEAD、03 版本号 = 01、平台注入特征在位
node scripts/sync-check.mjs

# ⑦ 02 是否需要重新导出（--dry 只报告，不写盘）
node scripts/export-public.mjs --dry
```

七项任一不过，不要 push。

> **02 什么时候必须重导**：只要动了 `git ls-files` 白名单里的任何文件。判断方法就一条 —— `node scripts/export-public.mjs --dry` 说有差异，就重导一次。反过来，02 目录里的东西**永远不要手改**：下次导出会整份覆盖。

---

## 四、首次发布

```bash
git init
git add -A          # .gitignore 已就位，add -A 是安全的
git status --short  # 再确认一遍只有那 15 个
git commit -m "Sea v2.10.0: 单文件个人工作台（空白首启 + 存档文件镜像 + XSS 修复）"
git branch -M main
git remote add origin <你的仓库地址>
git push -u origin main
```

**推送前最后一眼**：在 GitHub 网页上逐个点开 `CHANGELOG.md` 和 `docs/audit/AUDIT-03`，确认没有剩下任何能定位到具体人的组合信息。

---

## 五、本次发布前做的脱敏（4 个文件）

发布前扫出 4 处会把作者画像带出去的地方，已改：

| 文件 | 改了什么 |
|---|---|
| `CHANGELOG.md` | ① 示例数据那段的准标识符清单改成占位符（原文列了训练重量、卧推成绩、出生年份、目标事务所、英语分数）；② 两处「六级通过」→「英语考试通过」；③ 库 ID → 「库 ID 已脱敏」 |
| `docs/audit/AUDIT-03` | ① `DATABASE_ID` 的真实值 → `<库 ID>`；② 「六级通过」→「英语考试通过」 |
| `docs/HOSTING.md` | ① 页面节点 ID → `<页面节点 ID>`（两处）；② `grep "DATABASE_ID='avf6"` → 去掉值，只说「值是你的库 ID」 |
| `tests/verify-blank.mjs` | 删掉 9 个个人字符串断言（原文列了具体训练重量、目标事务所、食堂名等），改成两道不可反向推断的检查：**源码里没有 `seedDemo`/`seedFinance`/`载入示例`** + **三个卡池 children 为 0** |

> 注意：这几处改动只影响**发布副本**的措辞，功能零变化。但 `.private/` 里的历史版本仍带原始数据——所以 `.private/` 永远不能进仓库。

---

## 六、已定的三件事（2026-10-29）

| 事项 | 结论 |
|---|---|
| **LICENSE** | **MIT**。版权行现在是「Sea-人生看板 作者」，想署真名就改 `LICENSE` 第一段 |
| **对外名字** | **Sea-人生看板**。GitHub 仓库名只能用 ASCII，建议 `sea-life-board`（与 `package.json` 一致）；中文名写进仓库 Description 与 README 标题 |
| **截图** | 已生成 4 张在 `docs/assets/`，数据全虚构。要重拍：`node scripts/shots.mjs` |

## 七、还剩的一件小事：页内标题

`Sea-2.8.html` 里的 `<title>` 目前是 `Sea · 海图台（8 页）`，侧栏品牌是 `Sea`。
对外叫「Sea-人生看板」之后这两处不一致，但**改它意味着升版本号 + 重新给线上打补丁**（`docs/HOSTING.md` 的那套流程），所以单独列在这里，等你决定什么时候一起做。