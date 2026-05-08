"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => LarkLocalImportPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// src/import/write-lark-import.ts
var import_posix = require("node:path/posix");

// src/import/paths.ts
function normalizeHyphens(value) {
  return value.replace(/-+/g, "-");
}
var WINDOWS_RESERVED_BASENAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
function trimTrailingDotsAndSpaces(value) {
  return value.replace(/[. ]+$/g, "");
}
function sanitizePathPart(input) {
  const sanitized = normalizeHyphens(
    input.trim().replace(/\.\.+/g, "-").replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
  ).trim();
  const withoutTrailingDotsAndSpaces = trimTrailingDotsAndSpaces(sanitized);
  if (!withoutTrailingDotsAndSpaces) {
    return "untitled";
  }
  const extensionIndex = withoutTrailingDotsAndSpaces.lastIndexOf(".");
  if (extensionIndex <= 0) {
    return WINDOWS_RESERVED_BASENAME.test(withoutTrailingDotsAndSpaces) ? `${withoutTrailingDotsAndSpaces}-` : withoutTrailingDotsAndSpaces;
  }
  const basename2 = trimTrailingDotsAndSpaces(withoutTrailingDotsAndSpaces.slice(0, extensionIndex));
  const extension = withoutTrailingDotsAndSpaces.slice(extensionIndex);
  const safeBasename = basename2 || "untitled";
  return WINDOWS_RESERVED_BASENAME.test(safeBasename) ? `${safeBasename}-${extension}` : `${safeBasename}${extension}`;
}
function sanitizeFolderPath(input) {
  const parts = input.split(/[\\/]+/).map((part) => part.trim()).filter((part) => part.length > 0 && part !== "." && part !== "..").map(sanitizePathPart);
  return parts.join("/") || "untitled";
}
function buildAssetPath(assetFolder, docId, preferredName) {
  return [
    sanitizeFolderPath(assetFolder),
    sanitizePathPart(docId),
    sanitizePathPart(preferredName)
  ].join("/");
}
function buildNotePath(noteFolder, title) {
  const sanitizedTitle = sanitizePathPart(title).replace(/\.md$/i, "");
  return `${sanitizeFolderPath(noteFolder)}/${sanitizedTitle || "untitled"}.md`;
}

// src/import/write-lark-import.ts
function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}
async function ensureFolder(vault, folderPath) {
  if (!folderPath || folderPath === ".") {
    return;
  }
  let currentPath = "";
  for (const part of folderPath.split("/").filter(Boolean)) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    if (!await vault.exists(currentPath)) {
      await vault.mkdir(currentPath);
    }
  }
}
function assetReplacement(asset, assetPath) {
  if (asset.type === "image" || asset.type === "video") {
    return `![[${assetPath}]]`;
  }
  return `[${(0, import_posix.basename)(assetPath)}](${assetPath})`;
}
function resolveUniqueAssetPath(assetPath, usedAssetPaths) {
  if (!usedAssetPaths.has(assetPath)) {
    usedAssetPaths.add(assetPath);
    return assetPath;
  }
  const parsedPath = (0, import_posix.parse)(assetPath);
  let sequence = 2;
  while (true) {
    const candidatePath = parsedPath.dir ? `${parsedPath.dir}/${parsedPath.name}-${sequence}${parsedPath.ext}` : `${parsedPath.name}-${sequence}${parsedPath.ext}`;
    if (!usedAssetPaths.has(candidatePath)) {
      usedAssetPaths.add(candidatePath);
      return candidatePath;
    }
    sequence += 1;
  }
}
async function writeLarkImport(vault, manifest, files) {
  const assetPaths = [];
  const usedAssetPaths = /* @__PURE__ */ new Set();
  let markdown = manifest.markdown;
  for (const asset of manifest.assets) {
    const file = files.get(asset.assetId);
    if (!file) {
      throw new Error(`missing file for ${asset.assetId}`);
    }
    const assetPath = resolveUniqueAssetPath(
      buildAssetPath(manifest.assetFolder, manifest.docId, asset.preferredName),
      usedAssetPaths
    );
    await ensureFolder(vault, (0, import_posix.dirname)(assetPath));
    await vault.writeBinary(assetPath, toArrayBuffer(file));
    assetPaths.push(assetPath);
    markdown = markdown.split(asset.placeholder).join(assetReplacement(asset, assetPath));
  }
  const notePath = buildNotePath(manifest.noteFolder, manifest.title);
  await ensureFolder(vault, (0, import_posix.dirname)(notePath));
  await vault.write(notePath, markdown);
  return {
    notePath,
    assetPaths,
    markdown
  };
}

// src/http/router.ts
function json(status, payload) {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    body: Buffer.from(JSON.stringify(payload))
  };
}
var InvalidImportRequestError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidImportRequestError";
  }
};
var HEADER_SEPARATOR = Buffer.from("\r\n\r\n");
var CRLF = Buffer.from("\r\n");
function getHeader(headers, name) {
  const expectedName = name.toLowerCase();
  return Object.entries(headers).find(([key]) => key.toLowerCase() === expectedName)?.[1];
}
async function readRequestBody(req) {
  if (req.body) {
    return req.body;
  }
  if (req.readBody) {
    return req.readBody();
  }
  return Buffer.alloc(0);
}
function getMultipartBoundary(contentType) {
  const match = contentType?.match(/multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = match?.[1] || match?.[2];
  if (!boundary) {
    throw new InvalidImportRequestError("missing multipart boundary");
  }
  return boundary;
}
function getDispositionParam(disposition, name) {
  const match = disposition.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match?.[1];
}
function getAssetIdFromFilename(filename) {
  if (!filename) {
    throw new InvalidImportRequestError("missing file filename");
  }
  return filename.split("__", 2)[0] || filename;
}
function parseManifest(input) {
  let manifest;
  try {
    manifest = JSON.parse(input);
  } catch {
    throw new InvalidImportRequestError("invalid manifest json");
  }
  if (typeof manifest.docId !== "string" || typeof manifest.title !== "string" || typeof manifest.sourceUrl !== "string" || typeof manifest.noteFolder !== "string" || typeof manifest.assetFolder !== "string" || typeof manifest.importMode !== "string" || typeof manifest.markdown !== "string" || !Array.isArray(manifest.assets) || !manifest.assets.every(isValidManifestAsset) || hasDuplicateAssetIds(manifest.assets)) {
    throw new InvalidImportRequestError("invalid manifest");
  }
  return manifest;
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function isValidManifestAsset(asset) {
  if (!asset || typeof asset !== "object") {
    return false;
  }
  const candidate = asset;
  return isNonEmptyString(candidate.assetId) && (candidate.type === "image" || candidate.type === "attachment" || candidate.type === "video") && isNonEmptyString(candidate.preferredName) && isNonEmptyString(candidate.mimeType) && isNonEmptyString(candidate.placeholder) && isNonEmptyString(candidate.originalUrl);
}
function hasDuplicateAssetIds(assets) {
  const assetIds = /* @__PURE__ */ new Set();
  for (const asset of assets) {
    if (assetIds.has(asset.assetId)) {
      return true;
    }
    assetIds.add(asset.assetId);
  }
  return false;
}
function indexOfValidBoundary(body, boundaryBuffer, startIndex) {
  let searchIndex = startIndex;
  while (searchIndex < body.length) {
    const boundaryIndex = body.indexOf(boundaryBuffer, searchIndex);
    if (boundaryIndex < 0) {
      return -1;
    }
    const prefixIndex = boundaryIndex - CRLF.length;
    if (prefixIndex >= 0 && body.subarray(prefixIndex, boundaryIndex).equals(CRLF)) {
      const suffixIndex = boundaryIndex + boundaryBuffer.length;
      const suffix = body.subarray(suffixIndex, suffixIndex + 2);
      if (suffix.equals(CRLF) || suffix.toString("latin1") === "--") {
        return boundaryIndex;
      }
    }
    searchIndex = boundaryIndex + boundaryBuffer.length;
  }
  return -1;
}
function parseMultipartHeaders(headerBlock) {
  return Object.fromEntries(
    headerBlock.split("\r\n").map((line) => {
      const separator = line.indexOf(":");
      if (separator < 0) {
        throw new InvalidImportRequestError("invalid multipart header");
      }
      return [
        line.slice(0, separator).trim().toLowerCase(),
        line.slice(separator + 1).trim()
      ];
    })
  );
}
async function parseMultipartImport(req) {
  const boundary = getMultipartBoundary(getHeader(req.headers, "content-type"));
  const body = await readRequestBody(req);
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const files = /* @__PURE__ */ new Map();
  let manifest;
  if (!body.subarray(0, boundaryBuffer.length).equals(boundaryBuffer)) {
    throw new InvalidImportRequestError("invalid multipart body");
  }
  let cursor = boundaryBuffer.length;
  while (cursor < body.length) {
    const nextMarker = body.subarray(cursor, cursor + 2).toString("latin1");
    if (nextMarker === "--") {
      return finalizeMultipartImport(manifest, files);
    }
    if (!body.subarray(cursor, cursor + CRLF.length).equals(CRLF)) {
      throw new InvalidImportRequestError("invalid multipart boundary");
    }
    cursor += CRLF.length;
    const headerEnd = body.indexOf(HEADER_SEPARATOR, cursor);
    if (headerEnd < 0) {
      throw new InvalidImportRequestError("invalid multipart section");
    }
    const headers = parseMultipartHeaders(body.toString("utf8", cursor, headerEnd));
    const disposition = headers["content-disposition"];
    if (!disposition) {
      throw new InvalidImportRequestError("missing content-disposition");
    }
    const contentStart = headerEnd + HEADER_SEPARATOR.length;
    const nextBoundaryIndex = indexOfValidBoundary(body, boundaryBuffer, contentStart);
    if (nextBoundaryIndex < 0) {
      throw new InvalidImportRequestError("invalid multipart body");
    }
    const fieldName = getDispositionParam(disposition, "name");
    const contentBuffer = body.subarray(contentStart, nextBoundaryIndex - CRLF.length);
    if (fieldName === "manifest") {
      manifest = parseManifest(contentBuffer.toString("utf8"));
    } else if (fieldName === "file") {
      const filename = getDispositionParam(disposition, "filename");
      files.set(getAssetIdFromFilename(filename), Buffer.from(contentBuffer));
    }
    cursor = nextBoundaryIndex + boundaryBuffer.length;
  }
  return finalizeMultipartImport(manifest, files);
}
function finalizeMultipartImport(manifest, files) {
  if (!manifest) {
    throw new InvalidImportRequestError("missing manifest");
  }
  return { manifest, files };
}
function resolveVaultAdapter(ctx) {
  return ctx.vault ?? globalThis.app?.vault?.adapter;
}
async function handleRequest(req, ctx) {
  if (req.method === "GET" && req.url === "/health") {
    return json(200, { ok: true, version: ctx.version, vault: ctx.vaultName });
  }
  if (req.url === "/imports/lark") {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${ctx.apiKey}`) {
      return json(401, { ok: false, error: "unauthorized" });
    }
    if (req.method === "POST") {
      try {
        const vault = resolveVaultAdapter(ctx);
        if (!vault) {
          return json(500, { ok: false, error: "vault_unavailable" });
        }
        const { manifest, files } = await parseMultipartImport(req);
        const result = await writeLarkImport(vault, manifest, files);
        return json(200, { ok: true, result });
      } catch (error) {
        if (error instanceof InvalidImportRequestError) {
          return json(400, { ok: false, error: error.message });
        }
        throw error;
      }
    }
  }
  return json(404, { ok: false, error: "not_found" });
}

// src/http/server.ts
var import_node_http = require("node:http");
var MAX_REQUEST_BODY_BYTES = 25 * 1024 * 1024;
var RequestBodyTooLargeError = class extends Error {
  constructor(limit) {
    super(`Request body exceeds the ${limit}-byte limit.`);
    this.name = "RequestBodyTooLargeError";
  }
};
async function readBody(req, limit = MAX_REQUEST_BODY_BYTES) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > limit) {
      throw new RequestBodyTooLargeError(limit);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
function normalizeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(", ") : value
    ])
  );
}
function startServer(settings, router) {
  const server = (0, import_node_http.createServer)(async (req, res) => {
    try {
      let cachedBody;
      const response = await router({
        method: req.method || "GET",
        url: req.url || "/",
        headers: normalizeHeaders(req.headers),
        readBody: () => {
          cachedBody ||= readBody(req);
          return cachedBody;
        }
      });
      res.writeHead(response.status, response.headers);
      res.end(response.body);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        res.writeHead(413, {
          "content-type": "application/json; charset=utf-8"
        });
        res.end(Buffer.from(JSON.stringify({ ok: false, error: "payload_too_large" })));
        return;
      }
      res.writeHead(500, {
        "content-type": "application/json; charset=utf-8"
      });
      res.end(Buffer.from(JSON.stringify({ ok: false, error: "internal_error" })));
    }
  });
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve({
        close: () => new Promise((closeResolve) => {
          server.close(() => closeResolve());
        })
      });
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(settings.port, settings.host);
  });
}

// src/settings.ts
var API_KEY_PATTERN = /^[A-Za-z0-9_-]{32,}$/;
var API_KEY_ERROR = 'API key must be at least 32 characters using letters, numbers, "_" or "-".';
function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}
function createApiKey() {
  return Array.from(randomBytes(24)).map((value) => value.toString(16).padStart(2, "0")).join("");
}
function createDefaultSettings() {
  return {
    host: "127.0.0.1",
    port: 27124,
    apiKey: createApiKey(),
    defaultNoteFolder: "Lark Docs",
    defaultAssetFolder: "assets/larkdoc"
  };
}
function isSafeApiKey(apiKey) {
  return typeof apiKey === "string" && API_KEY_PATTERN.test(apiKey);
}
function validateApiKeyEdit(apiKey) {
  if (!isSafeApiKey(apiKey)) {
    throw new Error(API_KEY_ERROR);
  }
  return apiKey;
}
function normalizeSettings(input) {
  const defaults = createDefaultSettings();
  const port = input?.port && input.port > 0 && input.port < 65536 ? input.port : defaults.port;
  return {
    host: "127.0.0.1",
    port,
    apiKey: isSafeApiKey(input?.apiKey) ? input.apiKey : defaults.apiKey,
    defaultNoteFolder: input?.defaultNoteFolder && !input.defaultNoteFolder.includes("..") ? input.defaultNoteFolder : defaults.defaultNoteFolder,
    defaultAssetFolder: input?.defaultAssetFolder && !input.defaultAssetFolder.includes("..") ? input.defaultAssetFolder : defaults.defaultAssetFolder
  };
}
function applySettingsEdit(current, partial) {
  const nextInput = { ...current, ...partial };
  if (Object.hasOwn(partial, "apiKey") && partial.apiKey !== void 0) {
    nextInput.apiKey = validateApiKeyEdit(partial.apiKey.trim());
  }
  return normalizeSettings(nextInput);
}

// src/main.ts
var LarkImportSettingTab = class extends import_obsidian.PluginSettingTab {
  plugin;
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Lark Local Import" });
    new import_obsidian.Setting(containerEl).setName("Host").setDesc("Desktop plugin only listens on localhost.").addText(
      (text) => text.setValue(this.plugin.settings.host).setDisabled(true)
    );
    new import_obsidian.Setting(containerEl).setName("Port").setDesc("Local HTTP port used by the browser extension.").addText((text) => {
      let draftValue = String(this.plugin.settings.port);
      const commit = async () => {
        if (draftValue === String(this.plugin.settings.port)) {
          return;
        }
        await this.commitSetting({ port: Number.parseInt(draftValue, 10) });
      };
      text.setPlaceholder("27124").setValue(draftValue).onChange((value) => {
        draftValue = value.trim();
      });
      text.inputEl.addEventListener("blur", () => {
        void commit();
      });
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void commit();
        }
      });
    });
    new import_obsidian.Setting(containerEl).setName("API key").setDesc("Bearer token required for protected import requests.").addText((text) => {
      let draftValue = this.plugin.settings.apiKey;
      const commit = async () => {
        if (draftValue === this.plugin.settings.apiKey) {
          return;
        }
        await this.commitSetting({ apiKey: draftValue.trim() });
      };
      text.setPlaceholder("Generated automatically").setValue(draftValue).onChange((value) => {
        draftValue = value;
      });
      text.inputEl.addEventListener("blur", () => {
        void commit();
      });
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void commit();
        }
      });
    }).addButton(
      (button) => button.setButtonText("Regenerate").onClick(async () => {
        await this.commitSetting({ apiKey: createApiKey() });
        this.display();
        new import_obsidian.Notice("Generated a new Lark import API key.");
      })
    );
    new import_obsidian.Setting(containerEl).setName("Default note folder").setDesc("Vault folder used for imported notes.").addText((text) => {
      let draftValue = this.plugin.settings.defaultNoteFolder;
      const commit = async () => {
        if (draftValue === this.plugin.settings.defaultNoteFolder) {
          return;
        }
        await this.commitSetting({ defaultNoteFolder: draftValue.trim() });
      };
      text.setPlaceholder("Lark Docs").setValue(draftValue).onChange((value) => {
        draftValue = value;
      });
      text.inputEl.addEventListener("blur", () => {
        void commit();
      });
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void commit();
        }
      });
    });
    new import_obsidian.Setting(containerEl).setName("Default asset folder").setDesc("Vault folder used for imported attachments.").addText((text) => {
      let draftValue = this.plugin.settings.defaultAssetFolder;
      const commit = async () => {
        if (draftValue === this.plugin.settings.defaultAssetFolder) {
          return;
        }
        await this.commitSetting({ defaultAssetFolder: draftValue.trim() });
      };
      text.setPlaceholder("assets/larkdoc").setValue(draftValue).onChange((value) => {
        draftValue = value;
      });
      text.inputEl.addEventListener("blur", () => {
        void commit();
      });
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void commit();
        }
      });
    });
  }
  async commitSetting(partial) {
    try {
      await this.plugin.updateSettings(partial);
      this.display();
    } catch (error) {
      this.display();
      const message = error instanceof Error ? error.message : "Failed to save plugin settings.";
      new import_obsidian.Notice(message);
    }
  }
};
var LarkLocalImportPlugin = class extends import_obsidian.Plugin {
  settings;
  server;
  settingsUpdateQueue = Promise.resolve();
  async onload() {
    this.settings = normalizeSettings(await this.loadData());
    this.addSettingTab(new LarkImportSettingTab(this.app, this));
    this.server = await startServer(
      this.settings,
      (req) => handleRequest(req, {
        apiKey: this.settings.apiKey,
        version: this.manifest.version,
        vaultName: this.app.vault.getName()
      })
    );
  }
  async onunload() {
    await this.server?.close();
  }
  async updateSettings(partial) {
    const operation = this.settingsUpdateQueue.then(() => this.applySettings(partial));
    this.settingsUpdateQueue = operation.catch(() => void 0);
    return operation;
  }
  async applySettings(partial) {
    const nextSettings = applySettingsEdit(this.settings, partial);
    const portChanged = !this.server || nextSettings.host !== this.settings.host || nextSettings.port !== this.settings.port;
    if (portChanged) {
      await this.restartServer(nextSettings);
    }
    this.settings = nextSettings;
    await this.saveData(this.settings);
  }
  async restartServer(nextSettings) {
    const previousSettings = this.settings;
    const previousServer = this.server;
    if (previousServer) {
      await previousServer.close();
      this.server = void 0;
    }
    this.settings = nextSettings;
    try {
      this.server = await startServer(
        this.settings,
        (req) => handleRequest(req, {
          apiKey: this.settings.apiKey,
          version: this.manifest.version,
          vaultName: this.app.vault.getName()
        })
      );
    } catch (error) {
      this.settings = previousSettings;
      if (previousServer) {
        this.server = await startServer(
          this.settings,
          (req) => handleRequest(req, {
            apiKey: this.settings.apiKey,
            version: this.manifest.version,
            vaultName: this.app.vault.getName()
          })
        );
      }
      throw error;
    }
  }
};
//# sourceMappingURL=main.js.map
