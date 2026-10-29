# 仓库文案

GitHub 上除了 README，还有四处文字会单独露出来。**这四处不写，README 写得再好也没人点进来。**

复制粘贴用，不要在仓库里另找一份。

---

## 1. About 描述

位置：仓库首页右上角 **About** → ⚙️ → Description（上限 350 字符，中文约 120 字最合适）

> 单文件个人生活看板：零依赖、无账号、数据只在本机。用来看「这一年有没有偏航」，而不是「今天要做什么」。

英文备用（面向海外访客，或仓库主语言设为 English 时用）：

> A single-file personal life dashboard. Zero dependencies, no account, data stays on your machine. It asks "did I drift this year?" instead of "what's today's task?"

**Website 一栏**先留空。等 GitHub Pages 开了再填（见 `PUBLISH.md`）。

## 2. Topics 标签

位置：About → ⚙️ → Topics。建议这 12 个，够用且不堆词：

```
life-dashboard
personal-os
single-file
local-first
vanilla-js
no-dependencies
offline-first
productivity
self-management
goal-tracking
localstorage
mit-license
```

排序理由：前四个是别人真会搜的词（`local-first` / `single-file` 是这个项目最独特的标签），中间是技术栈，最后两个是许可证与检索兜底。

**不要加的**：`react`、`vue`、`typescript`（会让搜到的人失望）、`todo-app`（会引来错误的期待——它不是待办工具）。

## 3. Release 说明（v2.10.0）

位置：仓库右侧 **Releases** → Draft a new release → Tag `v2.10.0`

标题：`v2.10.0 · 存档文件镜像`

正文：

```markdown
第一个公开版本。

**是什么**：一个 HTML 文件（598KB），双击就能用的个人生活看板。八个页面——船舵 / 航行 / 秘宝 / 职业 / 财务 / 健康 / 成长 / 复盘。零依赖、无构建、无账号，数据默认只存在你自己的浏览器里。

**这个版本有什么**

- **存档文件镜像（新）**：在设置里绑定一个 `sea-存档.json`，之后每次改动 1.2 秒内自动整份写入。`localStorage` 仍是唯一真源，文件是实时副本——所以外部改动不会覆盖你的数据。仅 Chromium 系可用。
- **示例数据全部移除**：首次打开就是空白盘，不写任何文件。之前版本会塞一批演示卡，容易让人误以为那就是自己的数据。
- **修完三类 XSS**：所有用户输入统一转义（含单引号），外链统一过滤协议。三种载荷 × 八个页面 × 导入路径，实测执行次数 0。

**已知局限**（完整清单见 README）

- 只在 Chrome / Edge 验证过；移动端只有窄屏断点
- 拖拽与右键菜单没有自动化测试，靠人工点检
- 附件存在 `localStorage`（约 5MB 配额），大图会顶到上限

**怎么开始**：下载 `Sea-2.8.html` → 双击 → 读 `docs/GUIDE.md`

> 文件名沿用 `2.8` 是历史遗留，真实版本看页面「设置」。
```

## 4. 社交预览图

位置：仓库 Settings → Social preview → Upload image（1280×640，PNG/JPG，建议 < 1MB）

分享仓库链接时露出的就是这张。**不能用截图当预览图**——缩到 200px 宽以后什么都看不清。要求：

| 项 | 要求 |
|---|---|
| 尺寸 | 1280 × 640（2:1） |
| 背景 | 深墨绿或纸白，纯色，不用渐变 |
| 主文字 | 「Sea 人生看板」六个字，占画面高度 1/3 以上 |
| 副文字 | 一行：单文件 · 零依赖 · 数据只在你本机 |
| 左下角 | `Sea-2.8.html · v2.10.0` 小字 |
| 右侧 | 船舵截图的局部裁切（只用一块区域，不要整张缩进去） |
| 安全区 | 四周留 64px 空白，避免被裁 |

尚未制作。做好了放 `docs/assets/social-preview.png`，一并提交。

---

## 5. 一致性检查（发布前扫一眼）

- [ ] About 描述与 README 第 3 行说的是同一件事
- [ ] Topics 里的 `local-first` / `single-file` 在 README 里确实有对应段落
- [ ] Release tag `v2.10.0` 与 `package.json` 的 `version` 一致
- [ ] Release 正文里提到的功能，在 `CHANGELOG.md` 里能查到
- [ ] 社交预览图里没有真实数据（金额、体重、简历）
