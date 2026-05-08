# Feishu/Lark Troubleshooting

## Chrome Cannot Find `manifest.json`

You loaded the wrong folder, or you did not unzip the Release asset.

Fix:

1. Unzip `lark-web-clipper-chrome-v*.zip`.
2. Open `chrome://extensions`.
3. Click **Load unpacked**.
4. Select the folder that directly contains `manifest.json`.

## BRAT Cannot Install The Plugin

Check these items:

- The repository URL is a public GitHub repository URL.
- The GitHub Release contains `manifest.json`.
- The GitHub Release contains `main.js`.
- `manifest.json` has `id: "lark-local-import"`.

## Import Returns `unauthorized`

The API key in Chrome does not match the Obsidian plugin.

Fix:

1. Open the Obsidian plugin settings.
2. Copy the current API key.
3. Paste it into **Lark plugin -> API key** in the Chrome extension settings.
4. Retry the import.

## Chrome Cannot Connect To Obsidian

Check these items:

- Obsidian is open.
- **Lark Local Import** is enabled.
- Endpoint is `http://127.0.0.1:27124`.
- The Obsidian plugin and Chrome extension use the same port.
- No other app is using the same port.

## Images Or Attachments Are Missing

The browser could not download the Feishu/Lark asset.

Fix:

1. Confirm Chrome is signed in to Feishu/Lark.
2. Confirm your account can view the missing asset.
3. Wait until the document page finishes loading.
4. Refresh the page and import again.

## Content Order Is Wrong

DOM mode depends on the page's rendered state. Long virtualized documents can render blocks out of order.

Fix:

1. Configure Feishu OpenAPI credentials in the extension settings.
2. Retry the import with API mode.
3. If API mode is unavailable, scroll to the top of the document and retry.

## Port `27124` Is Busy

Fix:

1. Open the Obsidian plugin settings.
2. Change the port, for example to `27125`.
3. Change the Chrome extension endpoint to `http://127.0.0.1:27125`.
4. Retry the import.

## Chrome Extension Does Not Update

Developer-mode extensions do not update from GitHub automatically.

Update steps:

1. Download the latest `lark-web-clipper-chrome-v*.zip`.
2. Unzip it.
3. Replace the old unpacked folder or choose a new folder.
4. Open `chrome://extensions`.
5. Click the reload button on the extension card.

## BRAT Still Shows An Old Version

Fix:

1. Open BRAT settings.
2. Run the BRAT update command for beta plugins.
3. Restart Obsidian or disable and re-enable **Lark Local Import**.
