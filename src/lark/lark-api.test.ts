import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
	blocksToMarkdown,
	fetchLarkDocumentViaApi,
	parseLarkApiUrl,
} from './lark-api';

interface MockResponse {
	ok: boolean;
	status: number;
	json?: () => Promise<unknown>;
	arrayBuffer?: () => Promise<ArrayBuffer>;
	headers?: Headers;
}

function createMockResponse(init: Partial<MockResponse> & { ok?: boolean; status?: number }): Response {
	return {
		ok: init.ok ?? true,
		status: init.status ?? 200,
		headers: init.headers ?? new Headers(),
		json: init.json ?? (async () => ({})),
		arrayBuffer: init.arrayBuffer ?? (async () => new ArrayBuffer(0)),
	} as unknown as Response;
}

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	vi.restoreAllMocks();
});

describe('parseLarkApiUrl', () => {
	test('extracts wiki token', () => {
		expect(parseLarkApiUrl('https://x.feishu.cn/wiki/UTCWwfyCiiXumGkBgGOchuLpnqc')).toEqual({
			wikiToken: 'UTCWwfyCiiXumGkBgGOchuLpnqc',
			docxToken: null,
		});
	});

	test('extracts docx token', () => {
		expect(parseLarkApiUrl('https://x.feishu.cn/docx/abc123')).toEqual({
			wikiToken: null,
			docxToken: 'abc123',
		});
	});

	test('returns null for non-document URLs', () => {
		expect(parseLarkApiUrl('https://x.feishu.cn/sheets/foo')).toEqual({
			wikiToken: null,
			docxToken: null,
		});
	});
});

describe('blocksToMarkdown', () => {
	test('renders headings, paragraphs, and ordered lists in document order', async () => {
		const blocks = [
			{ block_id: 'root', block_type: 1, children: ['h1', 'p', 'l1'] },
			{ block_id: 'h1', block_type: 3, heading1: { elements: [{ text_run: { content: 'Title' } }] } },
			{ block_id: 'p', block_type: 2, text: { elements: [{ text_run: { content: 'Hello world' } }] } },
			{ block_id: 'l1', block_type: 13, ordered: { elements: [{ text_run: { content: 'first item' } }] } },
		];

		const { markdown, assets, files } = await blocksToMarkdown('TOKEN', blocks);

		expect(markdown).toContain('# Title');
		expect(markdown).toContain('Hello world');
		expect(markdown).toContain('1. first item');
		expect(assets).toEqual([]);
		expect(files.size).toBe(0);
	});

	test('downloads images and emits placeholders + asset descriptors', async () => {
		const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		const fetchMock = vi.fn(async (input: string | URL) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/medias/MEDIA_TOKEN/download')) {
				return createMockResponse({
					headers: new Headers({ 'content-type': 'image/png' }),
					arrayBuffer: async () => pngBytes.buffer,
				});
			}
			throw new Error(`unexpected fetch: ${url}`);
		});
		globalThis.fetch = fetchMock as typeof fetch;

		const blocks = [
			{ block_id: 'root', block_type: 1, children: ['p', 'img'] },
			{ block_id: 'p', block_type: 2, text: { elements: [{ text_run: { content: 'Before' } }] } },
			{ block_id: 'img', block_type: 27, image: { token: 'MEDIA_TOKEN' } },
		];

		const { markdown, assets, files } = await blocksToMarkdown('TOKEN', blocks);

		expect(assets).toHaveLength(1);
		expect(assets[0]).toMatchObject({
			assetId: 'asset-001',
			type: 'image',
			blockId: 'img',
			placeholder: '__LARK_ASSET_asset-001__',
			preferredName: 'image-1.png',
			mimeType: 'image/png',
		});
		expect(markdown).toContain('__LARK_ASSET_asset-001__');
		expect(files.get('asset-001__image-1.png')).toBeDefined();
	});

	test('quote container nests children with > prefix', async () => {
		const blocks = [
			{ block_id: 'root', block_type: 1, children: ['quote'] },
			{ block_id: 'quote', block_type: 34, children: ['p1', 'p2'] },
			{ block_id: 'p1', block_type: 2, text: { elements: [{ text_run: { content: 'URL example.com' } }] } },
			{ block_id: 'p2', block_type: 2, text: { elements: [{ text_run: { content: 'Key SECRET' } }] } },
		];

		const { markdown } = await blocksToMarkdown('TOKEN', blocks);

		expect(markdown).toContain('> URL example.com');
		expect(markdown).toContain('> Key SECRET');
	});

	test('ordered list items get real incrementing numbers when broken by other blocks', async () => {
		const blocks = [
			{ block_id: 'root', block_type: 1, children: ['l1', 'p', 'l2', 'l3', 'q', 'l4'] },
			{ block_id: 'l1', block_type: 13, ordered: { elements: [{ text_run: { content: 'first' } }] } },
			{ block_id: 'p', block_type: 2, text: { elements: [{ text_run: { content: 'interrupting paragraph' } }] } },
			{ block_id: 'l2', block_type: 13, ordered: { elements: [{ text_run: { content: 'second' } }] } },
			{ block_id: 'l3', block_type: 13, ordered: { elements: [{ text_run: { content: 'third' } }] } },
			{ block_id: 'q', block_type: 15, quote: { elements: [{ text_run: { content: 'a quote' } }] } },
			{ block_id: 'l4', block_type: 13, ordered: { elements: [{ text_run: { content: 'fourth' } }] } },
		];

		const { markdown } = await blocksToMarkdown('TOKEN', blocks);

		expect(markdown).toContain('1. first');
		expect(markdown).toContain('2. second');
		expect(markdown).toContain('3. third');
		expect(markdown).toContain('4. fourth');
	});

	test('ordered list numbering restarts at each heading', async () => {
		const blocks = [
			{ block_id: 'root', block_type: 1, children: ['h1', 'l1', 'l2', 'h2', 'l3', 'l4'] },
			{ block_id: 'h1', block_type: 3, heading1: { elements: [{ text_run: { content: 'Section A' } }] } },
			{ block_id: 'l1', block_type: 13, ordered: { elements: [{ text_run: { content: 'a1' } }] } },
			{ block_id: 'l2', block_type: 13, ordered: { elements: [{ text_run: { content: 'a2' } }] } },
			{ block_id: 'h2', block_type: 3, heading1: { elements: [{ text_run: { content: 'Section B' } }] } },
			{ block_id: 'l3', block_type: 13, ordered: { elements: [{ text_run: { content: 'b1' } }] } },
			{ block_id: 'l4', block_type: 13, ordered: { elements: [{ text_run: { content: 'b2' } }] } },
		];

		const { markdown } = await blocksToMarkdown('TOKEN', blocks);

		expect(markdown).toContain('1. a1');
		expect(markdown).toContain('2. a2');
		expect(markdown).toContain('1. b1');
		expect(markdown).toContain('2. b2');
	});
});

describe('fetchLarkDocumentViaApi', () => {
	beforeEach(() => {
		const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
			const url = typeof input === 'string' ? input : input.toString();

			if (url.endsWith('/auth/v3/tenant_access_token/internal')) {
				expect(init?.method).toBe('POST');
				return createMockResponse({
					json: async () => ({ code: 0, tenant_access_token: 'FAKE_TOKEN' }),
				});
			}

			if (url.includes('/wiki/v2/spaces/get_node?token=WIKI123')) {
				return createMockResponse({
					json: async () => ({
						code: 0,
						data: { node: { title: 'My Doc', obj_type: 'docx', obj_token: 'DOCX_TOKEN' } },
					}),
				});
			}

			if (url.includes('/docx/v1/documents/DOCX_TOKEN/blocks')) {
				return createMockResponse({
					json: async () => ({
						code: 0,
						data: {
							has_more: false,
							items: [
								{ block_id: 'root', block_type: 1, children: ['p1'] },
								{ block_id: 'p1', block_type: 2, text: { elements: [{ text_run: { content: 'Hello' } }] } },
							],
						},
					}),
				});
			}

			throw new Error(`unexpected fetch: ${url}`);
		});
		globalThis.fetch = fetchMock as typeof fetch;
	});

	test('fetches a wiki document end-to-end', async () => {
		const result = await fetchLarkDocumentViaApi(
			'https://x.feishu.cn/wiki/WIKI123',
			{ appId: 'cli_test', appSecret: 'secret' },
		);

		expect(result.title).toBe('My Doc');
		expect(result.markdown).toContain('Hello');
		expect(result.assets).toEqual([]);
		expect(result.files.size).toBe(0);
	});

	test('rejects URLs that are neither wiki nor docx', async () => {
		await expect(fetchLarkDocumentViaApi(
			'https://x.feishu.cn/sheets/foo',
			{ appId: 'cli_test', appSecret: 'secret' },
		)).rejects.toThrow(/not a Lark document/);
	});
});
