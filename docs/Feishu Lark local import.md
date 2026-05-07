# Feishu/Lark local import

This fork adds a local import path for Feishu/Lark documents. The browser extension extracts the document, downloads images, videos, and attachments with your active Feishu/Lark session, and sends them to a companion Obsidian plugin. The plugin writes the note and local asset files into your vault.

## Requirements

- Chrome or another Chromium browser with this fork installed.
- Obsidian desktop with the **Lark Local Import** companion plugin enabled.
- An active Feishu/Lark browser session that can access the document and its assets.

The extension cannot write binary files directly into an Obsidian vault. The companion plugin is required for local images, videos, and attachments.

## Install the browser extension

1. Run `npm install`.
2. Run `npm run build:chrome`.
3. Open `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked** and select `dist`.

The build also creates `builds/obsidian-web-clipper-1.6.2-chrome.zip` for sharing.

## Install the Obsidian plugin

1. From the repository root, run `cd obsidian-lark-import-plugin`.
2. Run `npm install`.
3. Run `npm run package`.
4. From the repository root, copy `obsidian-lark-import-plugin/release/lark-local-import` into `<your-vault>/.obsidian/plugins/lark-local-import`.
5. Restart Obsidian and enable **Lark Local Import** in **Settings > Community plugins**.
6. Copy the plugin API key.

## Configure the extension

Open the extension settings and set:

- Endpoint: `http://127.0.0.1:27124`
- API key: the key from the Obsidian plugin
- Default note folder: `Lark Docs`
- Default asset folder: `assets/larkdoc`

If the selected template has a path, that path becomes the note folder. Assets are saved under `<asset-folder>/<lark-document-id>/`.

## Import a document

1. Open a Feishu/Lark document URL, such as `/docx/`, `/docs/`, or `/wiki/`.
2. Open Web Clipper.
3. Use the **Feishu/Lark Document** template.
4. Click **Add to Obsidian**.

For `create` and `overwrite` templates, Lark documents use the local plugin import path. Other template behaviors use the normal Obsidian URI flow.

## Verify

- `GET http://127.0.0.1:27124/health` returns JSON with `ok: true`.
- The imported note appears under the configured note folder.
- Images and videos use `![[...]]` local embeds.
- Attachments use local Markdown links.
- Restarting Chrome or Obsidian preserves the endpoint, API key, and folder settings.
