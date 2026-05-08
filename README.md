# Obsidian Web Clipper — Feishu/Lark Edition

> A fork of [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper) with first-class **Feishu/Lark document import** — including images, attachments, and correct block ordering.

---

## Features

- **Two extraction modes** — choose what works best for your setup:
  - **API mode** (recommended): fetches documents through the official Feishu OpenAPI. Produces exact block order, clean numbered lists, and reliable image downloads. Requires a self-built Feishu app.
  - **DOM mode** (fallback): scrapes the live page via scroll-and-capture. No credentials needed, but may produce imperfect ordering on long virtualized documents.
- **Automatic fallback**: when API credentials are configured, the extension tries API first; on any failure it silently falls back to DOM extraction.
- **Local assets**: images, videos, and file attachments are downloaded and stored in your vault alongside the note.
- **Companion Obsidian plugin**: a lightweight local plugin receives the import payload and writes binary assets into your vault (Obsidian's URI scheme cannot write binary files).
- **Loading guard**: the clip button disables during save to prevent duplicate imports on slow connections.

## Architecture

```
┌─────────────────────┐       ┌──────────────────────────┐
│  Browser Extension  │──────▶│  Obsidian Lark Plugin    │
│  (popup / content)  │ POST  │  (localhost:27124)       │
│                     │       │  writes .md + assets     │
└─────────────────────┘       └──────────────────────────┘
        │                                 │
        │ API mode: fetch blocks          │
        ▼                                 ▼
   open.feishu.cn                   Your Obsidian Vault
```

## Quick Start

Install both parts from the same GitHub repository.

### 1. Install The Chrome Extension

1. Open this repository's **GitHub Releases** page.
2. Download `lark-web-clipper-chrome-v*.zip`.
3. Unzip it.
4. Open `chrome://extensions`.
5. Enable **Developer mode**.
6. Click **Load unpacked** and select the unzipped folder that contains `manifest.json`.

Chrome cannot install this ZIP directly. Unzip it first.

### 2. Install The Obsidian Plugin With BRAT

1. Install and enable [BRAT](https://github.com/TfTHacker/obsidian42-brat) in Obsidian.
2. Run **BRAT: Add a beta plugin for testing**.
3. Enter this repository's GitHub URL.
4. Enable **Lark Local Import** in **Settings -> Community plugins**.

### 3. Connect The Extension To Obsidian

Open the Obsidian plugin settings, copy the generated API key, then paste it into the Chrome extension settings:

| Field | Value |
|-------|-------|
| **Lark plugin -> Endpoint** | `http://127.0.0.1:27124` |
| **Lark plugin -> API key** | API key copied from Obsidian |
| **Lark plugin -> Default note folder** | e.g. `Lark Docs` |
| **Lark plugin -> Default asset folder** | e.g. `assets/larkdoc` |

Full setup details: [Install guide](docs/lark-install.md).

### 4. Optional: Enable API Mode

1. Go to [Feishu Open Platform](https://open.feishu.cn/) and create a **self-built app**.
2. Under Permissions, grant:
   - `wiki:wiki:readonly`
   - `docx:document:readonly`
   - `drive:drive:readonly`
3. Publish the app, or use test mode for personal documents.
4. In extension settings, open **Lark API credentials** and enter:
   - **App ID**: `cli_xxxxxxxxxxxxxxxx`
   - **App Secret**: your app secret (stored locally, never synced)

Once configured, every Lark clip tries API mode first and falls back to DOM mode on failure.

## Usage

1. Open any Feishu/Lark wiki or docx page in your browser.
2. Click the Obsidian Web Clipper icon.
3. The Lark template auto-activates. Click **Add to Obsidian** (or your configured action).
4. The button shows "Saving…" while downloading assets — wait for it to finish.
5. The note appears in your vault with embedded images.

## Troubleshooting

Detailed help: [Troubleshooting guide](docs/lark-troubleshooting.md).

| Symptom | Cause | Fix |
|---------|-------|-----|
| Images show `<!-- image download failed -->` | Transient API timeout or rate limit | Re-clip; the extension retries 3× automatically |
| All list items numbered "1." | Old extension build without sequential numbering fix | Rebuild and reload the extension |
| Blocks appear out of order (DOM mode) | Virtualized scroll capture race | Use API mode, or scroll to the top before clipping |
| Plugin health check fails | Obsidian plugin not running or wrong port | Ensure the Lark Import plugin is enabled in Obsidian |
| 403 on API calls | App lacks document permission | Add the document to the app's accessible scope |

## Development

Detailed release steps: [Development and release](docs/lark-development.md).

```bash
npm run dev:chrome          # watch mode
npm test                    # browser extension tests
npm run test:plugin         # Obsidian plugin tests
npm run test:release        # release packaging tests
npm run package:release     # build and package release assets
```

### Project structure (Lark-specific)

```
src/lark/
├── lark-api.ts              # Feishu OpenAPI client + blocks→markdown
├── lark-api-credentials.ts  # chrome.storage.local read/write
├── lark-api-payload.ts      # Build FormData from API results
├── lark-api.test.ts         # Unit tests (mock fetch)
├── lark-assets.ts           # DOM-mode asset discovery
├── lark-dom.ts              # DOM-mode block extraction
├── lark-import-payload.ts   # DOM-mode FormData builder
├── lark-plugin-client.ts    # HTTP client for companion plugin
├── lark-snapshot.ts         # Scroll-and-capture for virtualized pages
└── lark-url.ts              # URL pattern matching
```

## License

MIT — same as upstream Obsidian Web Clipper. Trademarks and marketing assets excluded.

---

# 中文说明

> 基于 [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper) 的分支，专为**飞书/Lark 文档导入**设计——支持图片、附件、正确的块顺序。

## 功能特性

- **双模式提取**：
  - **API 模式**（推荐）：通过飞书开放平台 API 获取文档，块顺序精确、有序列表编号正确、图片下载稳定。需要创建自建应用。
  - **DOM 模式**（兜底）：直接抓取浏览器页面，无需凭据，但长文档可能出现顺序偏差。
- **自动降级**：配置了 API 凭据后优先走 API；失败时自动回退到 DOM 抓取。
- **本地资源**：图片、视频、附件全部下载到 vault 本地。
- **Obsidian 伴侣插件**：负责将二进制文件写入 vault（Obsidian URI 协议无法写入二进制）。
- **防重复点击**：保存期间按钮禁用并显示"Saving…"。

## 快速开始

从同一个 GitHub 仓库安装 Chrome 扩展和 Obsidian 插件。

### 1. 安装 Chrome 扩展

1. 打开本仓库的 **GitHub Releases** 页面。
2. 下载 `lark-web-clipper-chrome-v*.zip`。
3. 解压 ZIP。
4. 打开 `chrome://extensions`。
5. 开启**开发者模式**。
6. 点击**加载已解压的扩展程序**，选择包含 `manifest.json` 的文件夹。

Chrome 不能直接安装这个 ZIP，需要先解压。

### 2. 使用 BRAT 安装 Obsidian 插件

1. 在 Obsidian 中安装并启用 [BRAT](https://github.com/TfTHacker/obsidian42-brat)。
2. 运行命令 **BRAT: Add a beta plugin for testing**。
3. 输入本仓库的 GitHub URL。
4. 在 **设置 -> 第三方插件** 中启用 **Lark Local Import**。

### 3. 连接 Chrome 扩展和 Obsidian

打开 Obsidian 插件设置，复制生成的 API key，然后粘贴到 Chrome 扩展设置：

| 字段 | 值 |
|------|-----|
| **Lark plugin -> Endpoint** | `http://127.0.0.1:27124` |
| **Lark plugin -> API key** | 从 Obsidian 复制的 API key |
| **Lark plugin -> Default note folder** | 如 `Lark Docs` |
| **Lark plugin -> Default asset folder** | 如 `assets/larkdoc` |

完整步骤见：[安装指南](docs/lark-install.md)。

### 4. 可选：启用 API 模式

1. 前往[飞书开放平台](https://open.feishu.cn/)并创建**自建应用**。
2. 在权限管理中开通：
   - `wiki:wiki:readonly`（知识库只读）
   - `docx:document:readonly`（文档只读）
   - `drive:drive:readonly`（云空间只读）
3. 发布应用，或使用测试模式访问个人文档。
4. 在扩展设置页打开 **Lark API credentials**，填入：
   - **App ID**：`cli_xxxxxxxxxxxxxxxx`
   - **App Secret**：你的应用密钥（仅存本地，不会同步）

配置完成后，每次抓取飞书文档都会优先使用 API 模式，失败时自动回退到 DOM 模式。

## 使用方法

1. 在浏览器中打开任意飞书 wiki 或 docx 页面
2. 点击 Obsidian Web Clipper 图标
3. Lark 模板自动激活，点击 **Add to Obsidian**
4. 按钮显示"Saving…"期间请等待（下载图片需要几秒）
5. 笔记出现在 vault 中，图片已嵌入

## 常见问题

| 现象 | 原因 | 解决 |
|------|------|------|
| 图片显示 `<!-- image download failed -->` | API 偶发超时或限流 | 重新抓取；扩展会自动重试 3 次 |
| 有序列表全显示"1." | 使用了旧版扩展 | 重新构建并重载扩展 |
| 块顺序混乱（DOM 模式） | 虚拟滚动捕获竞态 | 改用 API 模式，或抓取前先滚到页面顶部 |
| Plugin health check 失败 | Obsidian 插件未运行或端口错误 | 确认 Lark Import 插件已在 Obsidian 中启用 |
| API 返回 403 | 应用无文档访问权限 | 将文档添加到应用的可访问范围 |
