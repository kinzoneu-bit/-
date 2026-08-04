# 选品全链路看板 · KinZon

一个多品牌选品全链路管理看板：品牌货架、类目状态、产品跨站对比、SKU 跟踪。

---

## 📦 部署到 Vercel（三步走）

### 第 1 步 · 上传代码到 GitHub

**最简单方式（不用命令行）：**

1. 打开 https://github.com/new
2. 填 **Repository name**：`xuanpin-kanban`（随便起，好记就行）
3. 选 **Public**（公开，Vercel 免费版只支持公开仓库，代码里没敏感信息不用担心）
4. **不要勾** "Add a README file"（我们自己有 README）
5. 点绿色按钮 **Create repository**

创建完页面上会有一段说明，选中间那块 **"uploading an existing file"** 链接 —— 会跳到一个"拖拽上传"的页面。

**把当前项目文件夹里所有文件（含隐藏的 `.gitignore`）全选拖进去**，等上传完成，最下面填一个 Commit 说明（比如 "初始版本"），点 **Commit changes**。

（如果拖不进去 `.gitignore` 这类隐藏文件，Mac 按 `⌘+Shift+.` 显示隐藏文件、Windows 在文件夹选项里勾选"显示隐藏文件"。没上传也没关系，不影响部署。）

---

### 第 2 步 · Vercel 连接 GitHub 部署

1. 打开 https://vercel.com/new
2. 页面上会列出你的 GitHub 仓库，找到 `xuanpin-kanban`，点右侧 **Import**
3. 到项目配置页面：**所有选项都保持默认**（Framework 会自动识别成 Vite，其他别改）
4. 点最下面 **Deploy**
5. 等 2-3 分钟，构建完成会有 🎉 提示

---

### 第 3 步 · 拿到 URL 分享

部署完页面上会显示一个 URL，形如：

```
xuanpin-kanban-xxx.vercel.app
```

点一下能打开你的看板。**把这个 URL 发给团队**就完事了。

---

## 🔄 之后怎么更新

以后货架有变化（新加类目、改状态、加产品），流程是：

1. 我给你新代码
2. 你到 GitHub 仓库的 `src/App.jsx` 文件页面，点编辑（铅笔图标）
3. 全选粘贴新代码
4. 提交（Commit changes）
5. **Vercel 会自动检测到更新、几分钟内自动重新部署** —— URL 不变，团队刷新一下就看到新内容

---

## 🗂 项目结构

```
xuanpin-kanban/
├── src/
│   ├── App.jsx        ← 主要代码（货架、产品、供应商等所有逻辑都在这）
│   └── main.jsx       ← 入口
├── index.html         ← HTML 骨架
├── package.json       ← 依赖清单
├── vite.config.js     ← 构建配置
└── README.md          ← 本文件
```

---

## ⚠️ 当前限制（第一版）

- 数据都是**写死在代码里的**，团队打开只能**查看**，不能编辑
- 团队要看到最新，需要等你更新代码后重新提交
- 下一版会接 Supabase 数据库，支持团队多人协作编辑

---

有问题随时问，把当前遇到的截图发出来就行。
