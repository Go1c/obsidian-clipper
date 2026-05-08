# Lark Local Import

Lark Local Import is the companion Obsidian plugin for the Feishu/Lark edition of Obsidian Web Clipper. It receives imports from the Chrome extension over localhost, writes Markdown into the vault, saves images, videos, and attachments as local files, and rewrites asset placeholders to Obsidian links.

## Install With BRAT

1. Install and enable [BRAT](https://github.com/TfTHacker/obsidian42-brat) in Obsidian.
2. Run **BRAT: Add a beta plugin for testing**.
3. Enter this repository's GitHub URL.
4. Enable **Lark Local Import** in **Settings -> Community plugins**.
5. Open the plugin settings and copy the generated API key.

The plugin is desktop-only. It binds to `127.0.0.1` and defaults to port `27124`.

## Configure The Chrome Extension

In the Chrome extension settings, set:

| Setting | Value |
| --- | --- |
| Endpoint | `http://127.0.0.1:27124` |
| API key | Value copied from this Obsidian plugin |
| Default note folder | `Lark Docs` |
| Default asset folder | `assets/larkdoc` |

Assets are written under `<asset-folder>/<lark-document-id>/`.

## Use

1. Open Obsidian and keep this plugin enabled.
2. Open a Feishu/Lark document in Chrome.
3. Open the Feishu/Lark edition of Obsidian Web Clipper.
4. Click **Add to Obsidian**.

## Manual Install

1. Download `lark-local-import-v*.zip` from the GitHub Release.
2. Extract it to `<your-vault>/.obsidian/plugins/lark-local-import`.
3. Restart Obsidian.
4. Enable **Lark Local Import**.

## Development

```bash
npm install
npm test
npm run package
```

`npm run package` builds `main.js` and prepares `release/lark-local-import` for manual installation.
