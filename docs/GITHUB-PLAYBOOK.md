# 发布手册（一页纸）

以后每次发新版，照着这五步走。**看这一页就够了，不用翻别的文档。**

---

## 日常发版：5 步

### 1. 改代码

只改 `Sea-2.8.html`。改动前先把旧版复制进 `.private/Sea-备份/`（历史版本永不删）。

改完同步三处：

| 位置 | 改什么 |
|---|---|
| `Sea-2.8.html` 第 4 行的注释块 | 在最前面加一条本次改动 |
| `Sea-2.8.html` 的 `SEA_CHANGES` 数组 | 顶部加一条（页面「设置 → 版本」里显示的就是它） |
| `<meta name="version">` + `package.json` 的 `version` | 两个必须一致，否则发布脚本第 ① 步会拦住 |
| `CHANGELOG.md` | 顶部加一条，写清**为什么会发生**，不只是改了什么 |

### 2. 跑测试

```bash
npm test
```

**不绿不发。** 这一步会跑空白首启、数据口径、XSS、存档文件四项。要跑像素回归另加 `npm run test:visual`。

### 3. 提交

```bash
git add -A
git commit -m "fix: 拖拽排期立刻落盘"
```

提交信息格式 `type: 说明`，`type` 只用这四个：

| type | 什么时候用 |
|---|---|
| `feat` | 加了功能 |
| `fix` | 修了 bug |
| `docs` | 只改文档 |
| `chore` | 脚本、依赖、杂活 |

### 4. 一条命令发布

```bash
npm run release
```

它会依次做：核对版本号 → 检查工作区干净 → 导出 `02-GitHub发布版` → 校验三版对齐 → push → 打 tag → 建 Release。

**任何一项不过就中止，退出码非 0，什么都没推出去。** 想看它将要做什么而不执行：

```bash
npm run release:dry
```

### 5. 确认线上

打开 https://mason-yu-28.github.io/sea-life-board/

Pages 在 push 后 1 分钟内自动重建。改完立刻刷新看不到新版，等一分钟，不是你推失败了。

---

## 出问题对照表

| 症状 | 原因 | 怎么修 |
|---|---|---|
| 站点 404 | 构建没完成，或 Pages 分支不是 `main` | 等 1 分钟；`gh api repos/Mason-yu-28/sea-life-board/pages/builds/latest` 看 status |
| push 时弹登录框然后失败 | `gh` 和系统 git 没打通 | `gh auth setup-git` |
| 脚本第 ① 步报版本号不一致 | 三处没同改 | 改 `<meta name="version">` 和 `package.json` |
| 脚本第 ② 步报工作区不干净 | 有文件没提交 | 先 commit；确认没有误加 `.private` |
| 脚本第 ④ 步报三版不对齐 | 02 落后于 01 | `npm run export` 再 `npm run sync` |
| 第 ⑥ 步说 tag 已存在 | 同一个版本号发第二次 | 推荐升版本号；确实要重发：`gh release delete vX --yes`（tag 会留着，别删） |
| 忘了 `gh auth login` | 新电脑 | `gh auth login` → 选 HTTPS → 浏览器授权 → `gh auth setup-git` |
| push 报 `CONNECT tunnel failed, response 502` | 本地代理间歇故障，和仓库无关 | 重试几次（`git ls-remote origin refs/heads/main` 能返回 SHA 就说明通了）。别急着重装 git。**连续 8 次都不通就走下面「代理彻底不通」的 API 通道** |
| push 报 `schannel: server closed abruptly` | 同上，Windows 的 TLS 后端换了说法 | 加 `-c http.sslBackend=openssl` 能看清真实错误（通常露出的还是 502 CONNECT） |
| 提交显示匿名头像、不关联账号 | `user.email` 不是 GitHub 认得的邮箱 | 见下面「提交身份」，改完只影响之后的提交，历史里的不会变 |
| 误把敏感文件推上去了 | — | 立刻 `git rm --cached <文件>` + commit + `npm run release`。**如果还留在历史提交里，停下来找人，不要自己 rewrite 历史** |
| push 后本地和 `origin/main` 显示两个不同的提交 ID | 走 API 上传时 GitHub 会重算提交对象（message 尾换行不带），内容一样、ID 不同 | **别 force push**。用下面「对齐 SHA」的方法把远程对象精确复现到本地库 |

---

## 代理彻底不通时：用 API 上传（已验证可行）

判断标准：`gh api rate_limit` 正常返回，但 `git push` / `git ls-remote` 连续失败。这说明 **API 通道（api.github.com）通，git 通道（github.com）的 CONNECT 被代理挡了**。别重装 git，换通道。

**能这么做的原因**：仓库内容早就存在服务端，只需要重建「哪些文件 + 谁在什么时候提交」。改动文件逐个建 blob → 建一棵基于旧树的新树 → 建提交 → 移动分支指针。

```bash
# 四个文件为例，脚本在 /tmp 里临时生成即可，不必入库
# ① POST /git/blobs     每个改动文件（content: base64, encoding: base64）
# ② POST /git/trees     base_tree = 远程现有树的 sha，tree = 四个 {path,mode,type,sha}
# ③ POST /git/commits   message + tree + parents:[远程 HEAD] + author/committer
# ④ PATCH /git/refs/heads/main  {sha, force:true}
```

**两个必须做的校验**（少一个都可能悄悄推错）：

1. 每个 blob 的 sha 要等于 `git rev-parse HEAD:<path>` —— 有个不对就是编码或换行搞错了
2. 新树的 sha 要等于 `git rev-parse HEAD^{tree}` —— 不等就说明有文件没传对

### 对齐 SHA：本地和远程必须是同一个提交

走 API 上传后，提交 ID 会跟本地不同。原因已经查清：**GitHub 保留原时区（`+0800`），但把 message 末尾的换行去掉**；而 `git commit` 会在 message 末尾留一个换行。差这一个字节，哈希就全变。

修复办法是把远程对象精确复现进本地库（不需要网络，也不需要 fetch）：

```bash
# 用 hash-object 构造与远程逐字节相同的 commit 对象，匹配后把分支指过去
git hash-object -t commit -w --stdin   # 内容见下，注意 message 末尾【没有】换行
git update-ref refs/heads/main <sha>
git update-ref refs/remotes/origin/main <sha>
```

对象的准确形态（`+0800` 不能换成 `+0000`，末尾不能多空行）：

```
tree <远程树 sha>
parent <父提交 sha>
author Mason <205913954+Mason-yu-28@users.noreply.github.com> <unix时间戳> +0800
committer Mason <205913954+Mason-yu-28@users.noreply.github.com> <unix时间戳> +0800

<提交信息，不带尾换行>
```

先 `git hash-object -t commit --stdin`（**不带 `-w`**）试算，与远程 SHA 一致再加 `-w` 写入。不一致就说明日期或时区猜错了，别硬写。

**为什么不 force push**：一来 git 通道本来就是坏的；二来强推会造出第三份历史。API 上传 + 精确复现对象的结果是本地远程同一个 ID，下次能正常 push。


---

## 提交身份（别改坏）

这台机器的全局配置已经是：

```bash
git config --global user.name  "Mason"
git config --global user.email "205913954+Mason-yu-28@users.noreply.github.com"
```

那个 `205913954+Mason-yu-28@users.noreply.github.com` 是 GitHub 给的**专用 noreply 邮箱**，格式是「你的账号 ID + 用户名」。用它提交，GitHub 才认得出这些提交属于你，同时不暴露真实邮箱。

**不要换成自己的常用邮箱**：一样能关联（前提是邮箱已验证），但会把邮箱写进每一条公开提交里，而这样做没有任何额外好处。

---

## 第一次配环境（只做一次，换电脑才需要）

这台机器已经配好了，以下是留档：

```bash
gh auth login                      # 浏览器授权，token 存进系统钥匙串
gh auth setup-git                  # 让 git 的 push 直接用 gh 的凭证，不再弹框
gh repo create sea-life-board --public --source=. --remote=origin --push
gh api --method POST repos/<你>/<仓库>/pages -f "source[branch]=main" -f "source[path]=/"
gh repo edit --homepage "https://<你>.github.io/<仓库>/"
```

---

## 三条不许做

1. **不 force push、不改写 git 历史、不删远程仓库。** 宁可多一个提交，不要"看起来干净"。
2. **不手改 `02-GitHub发布版/`。** 那是导出的产物，下次 `npm run export` 整份覆盖。
3. **不跑测试不发版。** 半成品推上去，历史就留在那里了。

## 两个容易搞混的点

- **GitHub 上的内容 = 29 个文件**，不是整个 `01-源文件版` 目录。`.gitignore` 把 `.private/`（真实存档、设计文档、历史版本）全挡住了。想知道到底推了什么：`git ls-files`。
- **线上看板（Pages）和线上工作台（资料库）是两个不同的东西。** GitHub Pages 跑的是公开版，无云端同步；资料库那个跑的是部署件，带云同步。改了一边不会自动同步到另一边。
