# Lark Local Import

Lark Local Import 是 Obsidian Web Clipper 飞书/Lark 增强版的本地伴侣插件。它在本机 `127.0.0.1` 上接收 Chrome 扩展发送的导入请求，并把 Markdown、图片、视频和附件写入当前 Obsidian vault。

这个插件是桌面端插件，默认端口是 `27124`。

## 推荐安装方式：BRAT

1. 在 Obsidian 中安装并启用 [BRAT](https://github.com/TfTHacker/obsidian42-brat)。
2. 打开命令面板，运行 **BRAT: Add a beta plugin for testing**。
3. 输入仓库地址：

```text
https://github.com/Go1c/obsidian-clipper
```

4. 按照 BRAT 提示安装。
5. 在 **设置 -> 第三方插件** 中启用 **Lark Local Import**。
6. 打开插件设置，复制自动生成的 API key。

## 手动安装

1. 从 GitHub Release 下载 `lark-local-import-v*.zip`。
2. 解压到：

```text
<你的 vault>/.obsidian/plugins/lark-local-import/
```

3. 重启 Obsidian。
4. 在 **设置 -> 第三方插件** 中启用 **Lark Local Import**。
5. 打开插件设置，复制自动生成的 API key。

## 配置 Chrome 扩展

在 Chrome 扩展设置中填写：

| 设置项 | 推荐值 |
| --- | --- |
| Endpoint | `http://127.0.0.1:27124` |
| API key | 从本插件复制的 API key |
| Default note folder | `Lark Docs` |
| Default asset folder | `assets/larkdoc` |

附件会保存到：

```text
<Default asset folder>/<飞书文档 ID>/
```

## 使用方法

1. 打开 Obsidian，并保持 **Lark Local Import** 启用。
2. 在 Chrome 中打开飞书/Lark 文档。
3. 点击 Obsidian Web Clipper 扩展图标。
4. 使用飞书/Lark 模板，点击 **Add to Obsidian**。
5. 等待导入完成。

导入完成后，插件会在 vault 中创建 Markdown 笔记，并把图片、视频和附件保存为本地文件。

## 常见问题

| 问题 | 处理方法 |
| --- | --- |
| 提示 `unauthorized` | 重新从插件设置复制 API key，并粘贴到 Chrome 扩展设置。 |
| Chrome 连接不上 Obsidian | 确认 Obsidian 已打开，插件已启用，端口与扩展设置一致。 |
| 端口被占用 | 在插件设置里修改端口，并同步更新 Chrome 扩展的 Endpoint。 |
| 附件缺失 | 确认 Chrome 当前账号可以访问这些飞书/Lark 附件，然后重新导入。 |

## 开发

```bash
npm install
npm test
npm run package
```

`npm run package` 会构建 `main.js`，并在 `release/lark-local-import/` 中生成手动安装目录。
