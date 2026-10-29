# 发布到 GitHub：传什么、不传什么

> 结论先给：**16 个文件，约 650KB**。主文件一个，其余全是文档和测试。
> 个人数据、历史版本、内部判定清单**物理隔离**在 `.private/` 和 `_archive/`，`.gitignore` 已经拦住。

---

## 一、上传清单（16 个文件）

| # | 文件 | 大小 | 为什么传 |
|---|---|---|---|
| 1 | `Sea-2.8.html` | 610KB | **产品本体**。单文件全部代码。（文件名是历史遗留，版本号在设置面板里看，当前 2.10.0） |
| 2 | `README.md` | 6KB | 门面。别人点进来 30 秒决定要不要看下去 |
| 3 | `CHANGELOG.md` | 54KB | **这个项目最值钱的文档**：每次事故的根因复盘。已脱敏 |
| 4 | `docs/GUIDE.md` | 13KB | 使用说明。陌生人从这里开始，不用读别的 |
| 5 | `docs/HOSTING.md` | 8KB | 两份构建的差异 + 线上更新纪律（节点 ID 已换成占位符） |
| 6 | `docs/PUBLISH.md` | 本文件 | 发布清单，给未来的自己看 |
| 7 | `docs/audit/AUDIT-01-代码地图.md` | 14KB | 万行单文件怎么读——公开这个，等于先回答了「你自己看得懂吗」 |
| 8 | `docs/audit/AUDIT-02-文档与实现偏差.md` | 8KB | 文档与代码对不上的地方，诚实记录 |
| 9 | `docs/audit/AUDIT-03-缺陷与风险清单.md` | 18KB | 缺陷台账（含已修/未修）。自曝短板，但也是可信度来源 |
| 10 | `tests/verify-blank.mjs` | 3KB | 空白首启回归 |
| 11 | `tests/verify-fixes.mjs` | 12KB | 15 项存档与口径断言 |
| 12 | `tests/probe-xss.mjs` | 3KB | 3 种 XSS 载荷 × 8 页 |
| 13 | `tests/verify-file.mjs` | 15KB | 存档文件镜像 23 项 |
| 14 | `tests/verify-visual.mjs` | 4KB | 像素级外观回归 |
| 15–16 | `package.json` + `.gitignore` | 1KB | 测试只依赖 `playwright-core`；`.gitignore` 是隐私边界本身，必须入库 |

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

## 三、上传前必做的 6 项检查

```bash
# ① 敏感串扫描：这四条必须全部无输出（SENSITIVE-REVIEW.md 本身除外，它不入库）
grep -rn "avf6AYAE\|qVNvf5ur\|14652\|C:\\\\Users" --include="*.md" --include="*.html" --include="*.mjs" .  \
  --exclude-dir=node_modules --exclude-dir=.private --exclude-dir=_archive

# ② 数量核对：应该是 16
git add -An | wc -l

# ③ 体积核对：主文件约 610KB，整个仓库 < 1MB
ls -lh Sea-2.8.html && du -sh .git

# ④ 版本号一致：三处都应显示 2.10.0
grep -m1 '"version"' package.json
grep -o 'id="setVerNum">[^<]*' Sea-2.8.html
head -3 CHANGELOG.md

# ⑤ 测试全绿
npm i && npm test

# ⑥ 首启空白（防止把示例数据带出去）
npm test   # 里面第一条就是 verify-blank
```

六项任一不过，不要 push。

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

## 六、还没决定的（发布前你可以拍板）

| 事项 | 现状 | 建议 |
|---|---|---|
| **LICENSE** | 没有。README 写「待定，保留所有权利」 | 没有 LICENSE 时法律上默认全保留——想让人用就选一个：MIT（最宽松）/ 或自定义「源码可见，禁止商用与二次分发」 |
| **仓库名** | — | `sea-workbench`（与 package.json 一致）。避免只用 `sea`：Sea Limited（冬海集团）已占 `sea.com` 与企业级品牌 |
| **是否公开 `docs/audit/`** | 建议公开 | 它自曝了一堆未修缺陷，但「敢公开自己的缺陷清单」本身就是可信度 |
| **截图** | README 里两行注释占位 | 需要**空白盘 + 自己录的假数据**截图，不能用真实存档截图 |