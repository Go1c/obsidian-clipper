import { describe, expect, test, vi } from 'vitest';

import type { LarkAssetDescriptor } from './lark-assets';
import { buildLarkImportPayload, parseLarkAssets } from './lark-import-payload';

const larkAssets: LarkAssetDescriptor[] = [
	{
		assetId: 'asset-001',
		type: 'image',
		blockId: 'image-block',
		originalUrl: 'https://example.com/hero.png',
		preferredName: 'hero.png',
		mimeType: 'image/png',
		placeholder: '__LARK_ASSET_asset-001__',
	},
	{
		assetId: 'asset-002',
		type: 'attachment',
		blockId: 'attachment-block',
		originalUrl: 'https://example.com/deck.pdf',
		preferredName: 'deck.pdf',
		mimeType: 'application/pdf',
		placeholder: '__LARK_ASSET_asset-002__',
	},
];

describe('parseLarkAssets', () => {
	test('returns deserialized assets when the payload is valid', () => {
		expect(parseLarkAssets(JSON.stringify(larkAssets))).toEqual(larkAssets);
	});

	test('accepts video asset metadata', () => {
		const videoAsset: LarkAssetDescriptor = {
			assetId: 'asset-003',
			type: 'video',
			blockId: 'video-block',
			originalUrl: 'https://example.com/demo.mp4',
			preferredName: 'demo.mp4',
			mimeType: 'video/mp4',
			placeholder: '__LARK_ASSET_asset-003__',
		};

		expect(parseLarkAssets(JSON.stringify([videoAsset]))).toEqual([videoAsset]);
	});

	test('throws a clear error when the payload is malformed', () => {
		expect(() => parseLarkAssets('{"assetId":')).toThrow(
			'Invalid Lark asset metadata. Refresh the page and try again.',
		);
	});
});

describe('buildLarkImportPayload', () => {
	test('builds manifest JSON and downloads each asset into multipart files', async () => {
		const fetchMock = vi.fn<typeof fetch>()
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers({ 'content-type': 'image/png; charset=utf-8' }),
				arrayBuffer: async () => new TextEncoder().encode('image-bytes').buffer,
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers({ 'content-type': 'application/pdf' }),
				arrayBuffer: async () => new TextEncoder().encode('pdf-bytes').buffer,
			} as Response);

		const formData = await buildLarkImportPayload({
			docId: 'doc-123',
			title: 'Quarterly Plan',
			sourceUrl: 'https://example.com/doc/123',
			noteFolder: 'Lark Docs',
			assetFolder: 'assets/larkdoc',
			markdown: '# Plan\n\n__LARK_ASSET_asset-001__',
			assets: larkAssets,
			fetchImpl: fetchMock,
		});

		expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://example.com/hero.png', {
			credentials: 'include',
		});
		expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://example.com/deck.pdf', {
			credentials: 'include',
		});

		expect(JSON.parse(formData.get('manifest') as string)).toEqual({
			docId: 'doc-123',
			title: 'Quarterly Plan',
			sourceUrl: 'https://example.com/doc/123',
			noteFolder: 'Lark Docs',
			assetFolder: 'assets/larkdoc',
			importMode: 'create-or-update',
			markdown: '# Plan\n\n__LARK_ASSET_asset-001__',
			assets: larkAssets,
		});

		const files = formData.getAll('file') as File[];
		expect(files).toHaveLength(2);
		expect(files.map(file => file.name)).toEqual([
			'asset-001__hero.png',
			'asset-002__deck.pdf',
		]);
		expect(files.map(file => file.type)).toEqual([
			'image/png',
			'application/pdf',
		]);
		expect(await files[0].text()).toBe('image-bytes');
		expect(await files[1].text()).toBe('pdf-bytes');
	});

	test('throws a clear error when an asset download fails', async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
			ok: false,
			status: 403,
			headers: new Headers(),
			arrayBuffer: async () => new ArrayBuffer(0),
		} as Response);

		await expect(buildLarkImportPayload({
			docId: 'doc-123',
			title: 'Quarterly Plan',
			sourceUrl: 'https://example.com/doc/123',
			noteFolder: 'Lark Docs',
			assetFolder: 'assets/larkdoc',
			markdown: '__LARK_ASSET_asset-001__',
			assets: [larkAssets[0]],
			fetchImpl: fetchMock,
		})).rejects.toThrow('Failed to download Lark asset "hero.png" (403).');
	});

	test('normalizes extensionless image asset names from the downloaded content type', async () => {
		const fetchMock = vi.fn<typeof fetch>()
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers({ 'content-type': 'image/jpeg' }),
				arrayBuffer: async () => new TextEncoder().encode('jpeg-bytes').buffer,
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers({ 'content-type': 'image/png' }),
				arrayBuffer: async () => new TextEncoder().encode('png-bytes').buffer,
			} as Response);

		const formData = await buildLarkImportPayload({
			docId: 'doc-123',
			title: 'Quarterly Plan',
			sourceUrl: 'https://example.com/doc/123',
			noteFolder: 'Lark Docs',
			assetFolder: 'assets/larkdoc',
			markdown: '__LARK_ASSET_asset-001__\n__LARK_ASSET_asset-002__',
			assets: [
				{
					assetId: 'asset-001',
					type: 'image',
					blockId: 'image-a',
					originalUrl: 'https://example.com/assets/v3_00qi_67c809ef-c474-4010-b0a8-d2670752ff0g~',
					preferredName: 'v3_00qi_67c809ef-c474-4010-b0a8-d2670752ff0g~',
					mimeType: 'image/png',
					placeholder: '__LARK_ASSET_asset-001__',
				},
				{
					assetId: 'asset-002',
					type: 'image',
					blockId: 'image-b',
					originalUrl: 'https://example.com/assets/07433e68-5ce8-43e6-97a0-2d1c5f76bd5f',
					preferredName: '07433e68-5ce8-43e6-97a0-2d1c5f76bd5f',
					mimeType: 'image/png',
					placeholder: '__LARK_ASSET_asset-002__',
				},
			],
			fetchImpl: fetchMock,
		});

		expect(JSON.parse(formData.get('manifest') as string).assets).toEqual([
			expect.objectContaining({
				assetId: 'asset-001',
				preferredName: 'v3_00qi_67c809ef-c474-4010-b0a8-d2670752ff0g~.jpg',
				mimeType: 'image/jpeg',
			}),
			expect.objectContaining({
				assetId: 'asset-002',
				preferredName: '07433e68-5ce8-43e6-97a0-2d1c5f76bd5f.png',
				mimeType: 'image/png',
			}),
		]);

		const files = formData.getAll('file') as File[];
		expect(files.map(file => file.name)).toEqual([
			'asset-001__v3_00qi_67c809ef-c474-4010-b0a8-d2670752ff0g~.jpg',
			'asset-002__07433e68-5ce8-43e6-97a0-2d1c5f76bd5f.png',
		]);
		expect(files.map(file => file.type)).toEqual([
			'image/jpeg',
			'image/png',
		]);
	});
});
