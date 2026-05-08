# Feishu/Lark Development And Release

## Repository Shape

This repository is an extended fork of Obsidian Web Clipper.

```text
src/                          Chrome extension source
obsidian-lark-import-plugin/  Obsidian companion plugin source
scripts/package-release.mjs   GitHub Release packager
tests/release-package.test.mjs Release packager test
manifest.json                 BRAT-facing Obsidian plugin manifest
main.js                       BRAT-facing Obsidian plugin entry
release/                      Local generated Release assets
```

`manifest.json` and `main.js` at the repository root are copied from `obsidian-lark-import-plugin/` by the release script. Keep them in sync before publishing.

## Install Dependencies

```bash
npm install
npm --prefix obsidian-lark-import-plugin install
```

## Test

```bash
npm test
npm run test:plugin
npm run test:release
```

## Build

```bash
npm run build:chrome
npm run package:obsidian
```

## Package A GitHub Release

Run the full build and packager:

```bash
npm run package:release
```

If you already built both plugins, only repackage:

```bash
npm run package:release:skip-build
```

The release script writes:

```text
release/
  lark-web-clipper-chrome-v<version>.zip
  lark-local-import-v<version>.zip
  main.js
  manifest.json
  README.md
```

Upload all files in `release/` to the GitHub Release.

## Publish Checklist

1. Confirm the version in `obsidian-lark-import-plugin/manifest.json`.
2. Run:

   ```bash
   npm test
   npm run test:plugin
   npm run test:release
   npm run package:release
   ```

3. Commit source, docs, root `manifest.json`, and root `main.js`.
4. Push the branch to GitHub.
5. Create a GitHub Release for the same version.
6. Upload all files from `release/`.
7. Test Chrome by unzipping the Chrome ZIP and loading it through `chrome://extensions`.
8. Test Obsidian by installing the repository through BRAT.

## Generated Files

Do not commit these folders:

- `dist/`
- `builds/`
- `release/`
- `obsidian-lark-import-plugin/release/`
- `node_modules/`

Commit the root `main.js` and `manifest.json`, because BRAT can use them as a simple repository entry point.
