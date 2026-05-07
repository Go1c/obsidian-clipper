import type { LarkAssetDescriptor, LarkAssetType } from './lark-assets';
import type { LarkApiCredentials } from '../types/types';

const LARK_API_HOST = 'https://open.feishu.cn';

const LANG_MAP: Record<number, string> = {
	1: 'PlainText', 7: 'Bash', 8: 'CSharp', 9: 'CPP', 10: 'C', 12: 'CSS',
	22: 'Go', 28: 'JSON', 29: 'Java', 30: 'JavaScript', 36: 'Lua', 49: 'Python',
	56: 'SQL', 60: 'SWIFT', 61: 'Shell', 63: 'TOML', 65: 'TypeScript',
	68: 'XML', 69: 'YAML',
};
const LANG_FENCE: Record<string, string> = {
	Lua: 'lua', Python: 'python', JavaScript: 'javascript', TypeScript: 'typescript',
	Java: 'java', CSharp: 'csharp', CPP: 'cpp', C: 'c', Go: 'go', Shell: 'bash',
	Bash: 'bash', SQL: 'sql', JSON: 'json', YAML: 'yaml', XML: 'xml', HTML: 'html',
	CSS: 'css', Markdown: 'markdown', PlainText: 'text',
};

function getLangFence(id: number | undefined): string {
	if (!id) return '';
	const name = LANG_MAP[id] || '';
	return LANG_FENCE[name] || name.toLowerCase() || '';
}

interface DocxBlock {
	block_id: string;
	block_type: number;
	parent_id?: string;
	children?: string[];
	text?: { elements?: TextElement[] };
	heading1?: { elements?: TextElement[] };
	heading2?: { elements?: TextElement[] };
	heading3?: { elements?: TextElement[] };
	heading4?: { elements?: TextElement[] };
	heading5?: { elements?: TextElement[] };
	heading6?: { elements?: TextElement[] };
	heading7?: { elements?: TextElement[] };
	bullet?: { elements?: TextElement[] };
	ordered?: { elements?: TextElement[] };
	quote?: { elements?: TextElement[] };
	code?: { elements?: TextElement[]; style?: { language?: number } };
	image?: { token?: string };
	file?: { token?: string; name?: string };
	table?: { property: { column_size: number }; cells: string[] };
}

interface TextElement {
	text_run?: {
		content?: string;
		text_element_style?: {
			bold?: boolean;
			italic?: boolean;
			strikethrough?: boolean;
			inline_code?: boolean;
			link?: { url?: string };
		};
	};
}

interface LarkApiUrlMatch {
	wikiToken: string | null;
	docxToken: string | null;
}

export interface LarkApiFetchResult {
	title: string;
	markdown: string;
	assets: LarkAssetDescriptor[];
	files: Map<string, ArrayBuffer>;
}

export class LarkApiError extends Error {
	constructor(message: string, public readonly cause?: unknown) {
		super(message);
		this.name = 'LarkApiError';
	}
}

export function parseLarkApiUrl(url: string): LarkApiUrlMatch {
	const wikiMatch = url.match(/\/wiki\/([A-Za-z0-9]+)/);
	const docxMatch = url.match(/\/docx\/([A-Za-z0-9]+)/);
	return {
		wikiToken: wikiMatch ? wikiMatch[1] : null,
		docxToken: docxMatch ? docxMatch[1] : null,
	};
}

export async function getTenantAccessToken(creds: LarkApiCredentials): Promise<string> {
	const response = await fetch(`${LARK_API_HOST}/open-apis/auth/v3/tenant_access_token/internal`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ app_id: creds.appId, app_secret: creds.appSecret }),
	});
	if (!response.ok) {
		throw new LarkApiError(`tenant_access_token request failed: ${response.status}`);
	}
	const body = await response.json() as { code?: number; msg?: string; tenant_access_token?: string };
	if (body.code !== 0 || !body.tenant_access_token) {
		throw new LarkApiError(`tenant_access_token error: code=${body.code} msg=${body.msg ?? ''}`);
	}
	return body.tenant_access_token;
}

interface WikiNode {
	title: string;
	obj_type: string;
	obj_token: string;
}

export async function getWikiNode(token: string, wikiToken: string): Promise<WikiNode> {
	const response = await fetch(
		`${LARK_API_HOST}/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(wikiToken)}`,
		{ headers: { Authorization: `Bearer ${token}` } },
	);
	if (!response.ok) {
		throw new LarkApiError(`get_node failed: ${response.status}`);
	}
	const body = await response.json() as { code?: number; msg?: string; data?: { node?: WikiNode } };
	if (body.code !== 0 || !body.data?.node) {
		throw new LarkApiError(`get_node error: code=${body.code} msg=${body.msg ?? ''}`);
	}
	return body.data.node;
}

export async function getDocxTitle(token: string, docxToken: string): Promise<string> {
	const response = await fetch(
		`${LARK_API_HOST}/open-apis/docx/v1/documents/${docxToken}`,
		{ headers: { Authorization: `Bearer ${token}` } },
	);
	if (!response.ok) {
		throw new LarkApiError(`get_document failed: ${response.status}`);
	}
	const body = await response.json() as { code?: number; data?: { document?: { title?: string } } };
	return body.data?.document?.title || docxToken;
}

export async function listDocxBlocks(token: string, docxToken: string): Promise<DocxBlock[]> {
	const all: DocxBlock[] = [];
	let pageToken = '';
	do {
		const url = `${LARK_API_HOST}/open-apis/docx/v1/documents/${docxToken}/blocks?page_size=500${pageToken ? `&page_token=${pageToken}` : ''}`;
		const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
		if (!response.ok) {
			throw new LarkApiError(`list_blocks failed: ${response.status}`);
		}
		const body = await response.json() as { code?: number; data?: { items?: DocxBlock[]; has_more?: boolean; page_token?: string } };
		all.push(...(body.data?.items || []));
		pageToken = body.data?.has_more ? body.data.page_token || '' : '';
	} while (pageToken);
	return all;
}

export async function downloadMedia(token: string, mediaToken: string): Promise<{ buffer: ArrayBuffer; contentType: string }> {
	const maxAttempts = 3;
	let lastError: unknown = null;
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			const response = await fetch(
				`${LARK_API_HOST}/open-apis/drive/v1/medias/${mediaToken}/download`,
				{
					headers: { Authorization: `Bearer ${token}` },
					redirect: 'follow',
				},
			);
			if (!response.ok) {
				throw new LarkApiError(`download_media ${mediaToken} failed: HTTP ${response.status}`);
			}
			const contentType = response.headers.get('content-type') || '';
			// Lark sometimes returns a JSON error envelope with a 200 status on transient failures.
			if (contentType.includes('application/json')) {
				const text = await response.text();
				throw new LarkApiError(`download_media ${mediaToken} returned JSON envelope: ${text.slice(0, 200)}`);
			}
			return { buffer: await response.arrayBuffer(), contentType };
		} catch (err) {
			lastError = err;
			if (attempt < maxAttempts) {
				await new Promise(resolve => setTimeout(resolve, 200 * attempt));
				continue;
			}
		}
	}
	throw lastError instanceof Error
		? lastError
		: new LarkApiError(`download_media ${mediaToken} failed after ${maxAttempts} attempts`);
}

function renderTextElements(elements: TextElement[] | undefined): string {
	if (!elements) return '';
	return elements.map(el => {
		const run = el.text_run;
		if (!run) return '';
		const style = run.text_element_style || {};
		const text = run.content || '';
		if (style.link?.url) {
			let decoded = style.link.url;
			try { decoded = decodeURIComponent(style.link.url); } catch { /* keep raw */ }
			return `[${text}](${decoded})`;
		}
		if (style.inline_code) return `\`${text}\``;
		if (style.bold && style.italic) return `***${text}***`;
		if (style.bold) return `**${text}**`;
		if (style.italic) return `*${text}*`;
		if (style.strikethrough) return `~~${text}~~`;
		return text;
	}).join('');
}

function inferExtensionFromContentType(contentType: string): string {
	if (/png/i.test(contentType)) return 'png';
	if (/jpe?g/i.test(contentType)) return 'jpg';
	if (/gif/i.test(contentType)) return 'gif';
	if (/svg/i.test(contentType)) return 'svg';
	if (/webp/i.test(contentType)) return 'webp';
	return 'bin';
}

function inferExtensionFromBytes(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png';
	if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
	if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'gif';
	return 'bin';
}

function mimeTypeForExtension(extension: string): string {
	switch (extension) {
		case 'png': return 'image/png';
		case 'jpg': return 'image/jpeg';
		case 'gif': return 'image/gif';
		case 'webp': return 'image/webp';
		case 'svg': return 'image/svg+xml';
		default: return 'application/octet-stream';
	}
}

interface BuildContext {
	token: string;
	blockMap: Map<string, DocxBlock>;
	out: string[];
	imgCounter: { value: number };
	orderedCounter: { value: number };
	assets: LarkAssetDescriptor[];
	files: Map<string, ArrayBuffer>;
}

async function renderBlock(block: DocxBlock | undefined, indent: number, ctx: BuildContext): Promise<void> {
	if (!block) return;
	const t = block.block_type;
	const pad = '  '.repeat(indent);

	if (t === 1) {
		for (const cid of block.children || []) {
			await renderBlock(ctx.blockMap.get(cid), indent, ctx);
		}
		return;
	}

	if (t >= 3 && t <= 9) {
		// Restart ordered-list numbering at each heading so sections get their own 1..N sequence.
		ctx.orderedCounter.value = 0;
		const keys = ['heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6', 'heading7'] as const;
		const data = block[keys[t - 3]];
		ctx.out.push('');
		ctx.out.push(`${'#'.repeat(t - 2)} ${renderTextElements(data?.elements)}`);
		ctx.out.push('');
	} else if (t === 2) {
		const text = renderTextElements(block.text?.elements);
		ctx.out.push(text.trim() ? `${pad}${text}` : '');
	} else if (t === 12) {
		ctx.out.push(`${pad}- ${renderTextElements(block.bullet?.elements)}`);
	} else if (t === 13) {
		// Real incrementing numbers — required because image/quote blocks between list items break
		// a plain `1. ... 1. ...` sequence into separate lists in Obsidian's renderer.
		ctx.orderedCounter.value += 1;
		ctx.out.push(`${pad}${ctx.orderedCounter.value}. ${renderTextElements(block.ordered?.elements)}`);
	} else if (t === 14) {
		const lang = getLangFence(block.code?.style?.language);
		const content = (block.code?.elements || [])
			.map(e => e.text_run?.content || '')
			.join('');
		ctx.out.push('```' + lang);
		ctx.out.push(content.replace(/\n$/, ''));
		ctx.out.push('```');
		ctx.out.push('');
	} else if (t === 15) {
		ctx.out.push(`> ${renderTextElements(block.quote?.elements)}`);
		ctx.out.push('');
	} else if (t === 22) {
		ctx.out.push('');
		ctx.out.push('---');
		ctx.out.push('');
	} else if (t === 27) {
		const mediaToken = block.image?.token;
		if (mediaToken) {
			ctx.imgCounter.value += 1;
			const assetId = `asset-${String(ctx.imgCounter.value).padStart(3, '0')}`;
			const placeholder = `__LARK_ASSET_${assetId}__`;
			try {
				const { buffer, contentType } = await downloadMedia(ctx.token, mediaToken);
				const ext = inferExtensionFromContentType(contentType) === 'bin'
					? inferExtensionFromBytes(buffer)
					: inferExtensionFromContentType(contentType);
				const preferredName = `image-${ctx.imgCounter.value}.${ext}`;
				const mimeType = mimeTypeForExtension(ext);
				ctx.assets.push({
					assetId,
					type: 'image' satisfies LarkAssetType,
					blockId: block.block_id,
					originalUrl: `lark-api://media/${mediaToken}`,
					preferredName,
					mimeType,
					placeholder,
				});
				ctx.files.set(`${assetId}__${preferredName}`, buffer);
				ctx.out.push('');
				ctx.out.push(placeholder);
				ctx.out.push('');
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				console.warn(`[lark-api] image download failed for ${mediaToken}:`, message);
				ctx.out.push('');
				ctx.out.push(`<!-- image download failed: ${mediaToken} -->`);
				ctx.out.push('');
			}
		}
	} else if (t === 23) {
		const file = block.file;
		if (file?.token && file.name) {
			ctx.imgCounter.value += 1;
			const assetId = `asset-${String(ctx.imgCounter.value).padStart(3, '0')}`;
			const placeholder = `__LARK_ASSET_${assetId}__`;
			try {
				const { buffer, contentType } = await downloadMedia(ctx.token, file.token);
				ctx.assets.push({
					assetId,
					type: 'attachment' satisfies LarkAssetType,
					blockId: block.block_id,
					originalUrl: `lark-api://media/${file.token}`,
					preferredName: file.name,
					mimeType: contentType.split(';')[0]?.trim() || 'application/octet-stream',
					placeholder,
				});
				ctx.files.set(`${assetId}__${file.name}`, buffer);
				ctx.out.push('');
				ctx.out.push(placeholder);
				ctx.out.push('');
			} catch {
				ctx.out.push('');
				ctx.out.push(`[file: ${file.name}]`);
				ctx.out.push('');
			}
		}
	} else if (t === 33) {
		for (const cid of block.children || []) {
			await renderBlock(ctx.blockMap.get(cid), indent, ctx);
		}
		return;
	} else if (t === 34) {
		const start = ctx.out.length;
		for (const cid of block.children || []) {
			await renderBlock(ctx.blockMap.get(cid), indent, ctx);
		}
		for (let i = start; i < ctx.out.length; i += 1) {
			if (ctx.out[i] !== '') ctx.out[i] = `> ${ctx.out[i]}`;
		}
		ctx.out.push('');
	} else if (t === 31) {
		const tbl = block.table;
		if (!tbl) return;
		const cols = tbl.property.column_size;
		const cells = tbl.cells;
		for (let r = 0; r * cols < cells.length; r += 1) {
			const row = cells.slice(r * cols, (r + 1) * cols);
			const cellTexts = row.map(cellId => {
				const cell = ctx.blockMap.get(cellId);
				if (!cell?.children) return '';
				return cell.children.map(ccid => {
					const cb = ctx.blockMap.get(ccid);
					if (!cb) return '';
					if (cb.block_type === 2) return renderTextElements(cb.text?.elements).trim();
					return '';
				}).filter(Boolean).join('<br>');
			});
			ctx.out.push(`| ${cellTexts.join(' | ')} |`);
			if (r === 0) ctx.out.push(`|${cellTexts.map(() => '---').join('|')}|`);
		}
		ctx.out.push('');
	} else {
		for (const cid of block.children || []) {
			await renderBlock(ctx.blockMap.get(cid), indent, ctx);
		}
		return;
	}

	if ((t === 12 || t === 13) && block.children) {
		for (const cid of block.children) {
			await renderBlock(ctx.blockMap.get(cid), indent + 1, ctx);
		}
	}
}

export async function blocksToMarkdown(
	token: string,
	blocks: DocxBlock[],
): Promise<{ markdown: string; assets: LarkAssetDescriptor[]; files: Map<string, ArrayBuffer> }> {
	const blockMap = new Map<string, DocxBlock>();
	for (const block of blocks) {
		blockMap.set(block.block_id, block);
	}
	const ctx: BuildContext = {
		token,
		blockMap,
		out: [],
		imgCounter: { value: 0 },
		orderedCounter: { value: 0 },
		assets: [],
		files: new Map(),
	};
	const root = blocks.find(b => b.block_type === 1);
	if (root) {
		await renderBlock(root, 0, ctx);
	}
	const markdown = ctx.out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
	return { markdown, assets: ctx.assets, files: ctx.files };
}

export async function fetchLarkDocumentViaApi(
	url: string,
	creds: LarkApiCredentials,
): Promise<LarkApiFetchResult> {
	const { wikiToken, docxToken } = parseLarkApiUrl(url);
	if (!wikiToken && !docxToken) {
		throw new LarkApiError(`URL is not a Lark document: ${url}`);
	}

	const token = await getTenantAccessToken(creds);

	let title: string;
	let resolvedDocxToken: string;
	if (wikiToken) {
		const node = await getWikiNode(token, wikiToken);
		if (node.obj_type !== 'docx' && node.obj_type !== 'doc') {
			throw new LarkApiError(`Wiki node is type "${node.obj_type}", only docx is supported via API`);
		}
		title = node.title;
		resolvedDocxToken = node.obj_token;
	} else {
		resolvedDocxToken = docxToken as string;
		title = await getDocxTitle(token, resolvedDocxToken);
	}

	const blocks = await listDocxBlocks(token, resolvedDocxToken);
	const { markdown, assets, files } = await blocksToMarkdown(token, blocks);

	return { title, markdown, assets, files };
}
