# Obsidian Web Clipper 飞书/Lark 增强版

这是基于官方 [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper) 修改的增强版本。它保留官方网页剪藏能力，并新增飞书/Lark 文档导入能力，方便把飞书文档、图片和附件保存到 Obsidian 本地库。

本仓库同时提供两个组件：

- **Chrome 浏览器扩展**：在飞书/Lark 页面中读取文档内容。
- **Obsidian 本地插件**：接收浏览器扩展发送的内容，并把 Markdown、图片、视频和附件写入 vault。

## 基于官方版本新增了什么

- **飞书/Lark 文档导入**：支持 wiki、docx 等飞书文档页面。
- **API 模式**：通过飞书开放平台 API 获取文档块，顺序更稳定，适合正式使用。
- **DOM 模式**：无需飞书 API 凭据，直接从当前浏览器页面抓取内容，适合作为兜底方案。
- **自动回退**：配置 API 后会优先使用 API；失败时自动回退到 DOM 模式。
- **本地附件保存**：图片、视频和文件附件会保存到 Obsidian vault，不只保留远程链接。
- **BRAT 安装支持**：Obsidian 插件可以直接通过 BRAT 使用本仓库地址安装。
- **发布包脚本**：可以一键生成 Chrome 扩展 ZIP 和 Obsidian 插件发布文件。

## 下载

进入本仓库的 GitHub Releases 页面：

<https://github.com/Go1c/obsidian-clipper/releases>

下载以下文件：

| 文件 | 用途 |
| --- | --- |
| `lark-web-clipper-chrome-v*.zip` | Chrome 浏览器扩展安装包 |
| `lark-local-import-v*.zip` | Obsidian 插件手动安装包 |
| `manifest.json`、`main.js`、`README.md` | BRAT 安装 Obsidian 插件所需文件 |

如果你使用 BRAT 安装 Obsidian 插件，一般不需要手动下载 `lark-local-import-v*.zip`。

## 安装 Chrome 扩展

1. 从 Releases 下载 `lark-web-clipper-chrome-v*.zip`。
2. 解压这个 ZIP。
3. 打开 Chrome，进入 `chrome://extensions`。
4. 打开右上角的**开发者模式**。
5. 点击**加载已解压的扩展程序**。
6. 选择刚才解压后、包含 `manifest.json` 的文件夹。
7. 将扩展固定到浏览器工具栏，方便后续使用。

注意：Chrome 不能直接安装这个 ZIP，必须先解压。

## 安装 Obsidian 插件（推荐：BRAT）

1. 在 Obsidian 中安装并启用 [BRAT](https://github.com/TfTHacker/obsidian42-brat)。
2. 打开命令面板，运行 **BRAT: Add a beta plugin for testing**。
3. 输入本仓库地址：

```text
https://github.com/Go1c/obsidian-clipper
```

4. 按照 BRAT 提示完成安装。
5. 在 Obsidian 的 **设置 -> 第三方插件** 中启用 **Lark Local Import**。

## 手动安装 Obsidian 插件

如果不使用 BRAT，可以手动安装：

1. 从 Releases 下载 `lark-local-import-v*.zip`。
2. 解压到你的 vault 插件目录：

```text
<你的 vault>/.obsidian/plugins/lark-local-import/
```

3. 重启 Obsidian。
4. 在 **设置 -> 第三方插件** 中启用 **Lark Local Import**。

## 连接 Chrome 扩展和 Obsidian

Obsidian 插件默认监听本机地址：

```text
http://127.0.0.1:27124
```

连接步骤：

1. 打开 Obsidian，并确认 **Lark Local Import** 已启用。
2. 打开 **Lark Local Import** 插件设置。
3. 复制插件自动生成的 API key。
4. 打开 Chrome 扩展设置。
5. 填写以下配置：

| 设置项 | 推荐值 |
| --- | --- |
| Endpoint | `http://127.0.0.1:27124` |
| API key | 从 Obsidian 插件复制的 API key |
| Default note folder | `Lark Docs` |
| Default asset folder | `assets/larkdoc` |

## 使用方法

1. 先打开 Obsidian，并保持 **Lark Local Import** 插件启用。
2. 在 Chrome 中登录飞书/Lark。
3. 打开要保存的飞书 wiki 或 docx 文档。
4. 点击浏览器工具栏中的 Obsidian Web Clipper 图标。
5. 使用内置的飞书/Lark 模板，点击 **Add to Obsidian**。
6. 等待按钮从 `Saving...` 恢复正常。图片和附件下载可能需要几秒。
7. 回到 Obsidian，查看导入的 Markdown 笔记和本地附件。

## 可选：启用飞书 API 模式

API 模式更稳定，适合长期使用。启用步骤：

1. 前往 [飞书开放平台](https://open.feishu.cn/)。
2. 创建一个**自建应用**。
3. 在权限管理中开通以下权限：
   - `wiki:wiki:readonly`
   - `docx:document:readonly`
   - `drive:drive:readonly`
4. 发布应用，或在测试模式下使用个人文档。
5. 打开 Chrome 扩展设置中的 **Lark API credentials**。
6. 填入：
   - **App ID**：例如 `cli_xxxxxxxxxxxxxxxx`
   - **App Secret**：你的应用密钥

配置完成后，扩展会优先使用 API 模式；如果 API 调用失败，会自动回退到 DOM 模式。

## 常见问题

| 问题 | 处理方法 |
| --- | --- |
| Chrome 提示找不到 `manifest.json` | 选择解压后的内层文件夹，确保该文件夹直接包含 `manifest.json`。 |
| BRAT 安装失败 | 确认输入的是公开 GitHub 仓库地址，并且 Release 中存在 `manifest.json` 和 `main.js`。 |
| 导入时提示 `unauthorized` | 重新从 Obsidian 插件复制 API key，并粘贴到 Chrome 扩展设置。 |
| Chrome 连接不上 Obsidian | 确认 Obsidian 已打开，插件已启用，端口是 `27124`。 |
| 图片或附件缺失 | 确认 Chrome 当前账号可以访问这些资源，然后重新导入。 |
| 文档块顺序异常 | 优先启用 API 模式；如果使用 DOM 模式，导入前先滚动到文档顶部。 |

## 开发和打包

```bash
npm install
npm --prefix obsidian-lark-import-plugin install
npm test
npm run test:plugin
npm run test:release
npm run package:release
```

常用命令：

| 命令 | 作用 |
| --- | --- |
| `npm run dev:chrome` | 开发 Chrome 扩展 |
| `npm run build:chrome` | 构建 Chrome 扩展 |
| `npm run package:obsidian` | 构建 Obsidian 插件 |
| `npm run package:release` | 生成 Release 所需资产 |

生成的发布文件会写入 `release/` 目录。

## 更多文档

- [安装指南](docs/lark-install.md)
- [故障排查](docs/lark-troubleshooting.md)
- [开发与发布](docs/lark-development.md)

## 许可证

本项目沿用官方 Obsidian Web Clipper 的 MIT 许可证。Obsidian、飞书、Lark 等名称和商标归各自所有者所有。
