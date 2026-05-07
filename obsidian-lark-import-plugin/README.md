# Lark Local Import

Lark Local Import is the companion Obsidian plugin for the Feishu/Lark fork of Obsidian Web Clipper. It receives imports from the browser extension over localhost, writes Markdown into the vault, stores images, videos, and attachments as local files, and rewrites placeholders to Obsidian links.

## Install

1. Run `npm install`.
2. Run `npm run package`.
3. Copy `release/lark-local-import` to `<your-vault>/.obsidian/plugins/lark-local-import`.
4. Restart Obsidian, open **Settings > Community plugins**, and enable **Lark Local Import**.
5. Open the plugin settings and copy the generated API key.

The plugin is desktop-only. It binds to `127.0.0.1` and defaults to port `27124`.

## Configure Web Clipper

In the browser extension settings, set:

- Endpoint: `http://127.0.0.1:27124`
- API key: the value from the Obsidian plugin settings
- Default note folder: `Lark Docs`
- Default asset folder: `assets/larkdoc`

The extension uses the folder from the selected Lark template when one is provided. Assets are written under `<asset-folder>/<lark-document-id>/`.

## Use

1. Open Obsidian and keep this plugin enabled.
2. Open a Feishu/Lark document in a browser where you are already signed in.
3. Open the Web Clipper extension and use the built-in **Feishu/Lark Document** template.
4. Click **Add to Obsidian**.

The browser downloads document assets with the active Feishu/Lark session and uploads them to this plugin. The plugin writes the final note and local assets into the vault.

## Development

- `npm test` runs the plugin test suite.
- `npm run build` bundles `src/main.ts` to `main.js`.
- `npm run dev` rebuilds in watch mode.
- `npm run package` builds and prepares `release/lark-local-import` for manual installation.

## Troubleshooting

- If import fails with `unauthorized`, copy the API key again from Obsidian to the extension settings.
- If import fails with `missing file`, refresh the Lark page and retry after the document finishes loading.
- If Obsidian cannot start the server, change the port in plugin settings and use the same endpoint in the extension.
- If assets are missing, confirm the browser can view or download those assets while signed in to Feishu/Lark.
