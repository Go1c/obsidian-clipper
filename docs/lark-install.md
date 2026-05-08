# Feishu/Lark Install Guide

This fork has two parts:

- A Chrome extension that reads Feishu/Lark documents.
- An Obsidian companion plugin that writes Markdown and local assets into your vault.

## Requirements

- Desktop Obsidian.
- Chrome or another Chromium browser.
- Access to this repository's GitHub Releases page.
- A Feishu/Lark account signed in through the same browser.

## Install The Chrome Extension

1. Open this repository's GitHub Releases page.
2. Download `lark-web-clipper-chrome-v*.zip`.
3. Unzip the file.
4. Open `chrome://extensions`.
5. Enable **Developer mode**.
6. Click **Load unpacked**.
7. Select the unzipped folder that directly contains `manifest.json`.
8. Pin the extension in the Chrome toolbar.

If Chrome says it cannot find the manifest, select the inner folder that contains `manifest.json`.

## Install The Obsidian Plugin With BRAT

1. Open **Settings -> Community plugins** in Obsidian.
2. Disable **Restricted mode**.
3. Install and enable [BRAT](https://github.com/TfTHacker/obsidian42-brat).
4. Run **BRAT: Add a beta plugin for testing** from the command palette.
5. Enter this repository's GitHub URL.
6. Follow BRAT's install prompts.
7. Enable **Lark Local Import** in **Community plugins**.

BRAT reads the Obsidian plugin from GitHub Release assets. Each release must include `manifest.json` and `main.js`.

## Manual Obsidian Install

Use this only if you do not want to use BRAT.

1. Download `lark-local-import-v*.zip` from the GitHub Release.
2. Extract it to:

   ```text
   <your-vault>/.obsidian/plugins/lark-local-import/
   ```

3. Confirm the folder contains:

   ```text
   manifest.json
   main.js
   README.md
   ```

4. Restart Obsidian.
5. Enable **Lark Local Import**.

## Connect Chrome To Obsidian

1. Open **Settings -> Community plugins -> Lark Local Import** in Obsidian.
2. Keep the default port `27124`, unless you need another local port.
3. Copy the generated **API key**.
4. Open the Chrome extension settings.
5. Fill in the **Lark plugin** settings:

| Field | Value |
| --- | --- |
| Endpoint | `http://127.0.0.1:27124` |
| API key | API key copied from Obsidian |
| Default note folder | `Lark Docs` |
| Default asset folder | `assets/larkdoc` |

## Import A Document

1. Keep Obsidian open.
2. Open a Feishu/Lark document or wiki page in Chrome.
3. Wait for the page to finish loading.
4. Click the extension.
5. Click **Add to Obsidian**.
6. Check the configured note folder in Obsidian.

## Optional API Mode

API mode uses Feishu OpenAPI first and falls back to DOM extraction when it fails.

1. Create a self-built app in the Feishu Open Platform.
2. Grant document read permissions.
3. Publish or enable the app for your workspace.
4. Open the extension settings.
5. Fill in **Lark API credentials** with your App ID and App Secret.

The credentials stay in Chrome local storage.
