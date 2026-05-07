import { describe, expect, test } from 'vitest';

import type { LarkImportManifest } from '../src/import/types';
import { buildAssetPath, buildNotePath, sanitizePathPart } from '../src/import/paths';
import { writeLarkImport } from '../src/import/write-lark-import';

class FakeAdapter {
	operations: string[] = [];
	folders = new Set<string>();
	textWrites = new Map<string, string>();
	binaryWrites = new Map<string, Buffer>();

	async exists(path: string): Promise<boolean> {
		return this.folders.has(path) || this.textWrites.has(path) || this.binaryWrites.has(path);
	}

	async mkdir(path: string): Promise<void> {
		this.operations.push(`mkdir:${path}`);
		this.folders.add(path);
	}

	async write(path: string, data: string): Promise<void> {
		this.operations.push(`write:${path}`);
		this.textWrites.set(path, data);
	}

	async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
		this.operations.push(`writeBinary:${path}`);
		this.binaryWrites.set(path, Buffer.from(data));
	}
}

describe('writeLarkImport', () => {
	test('writes sanitized assets first, rewrites placeholders, and then writes the note', async () => {
		const adapter = new FakeAdapter();
		const manifest: LarkImportManifest = {
			docId: 'doc:123',
			title: 'Quarterly ../Plan',
			sourceUrl: 'https://example.com/doc/123',
			noteFolder: 'Lark Docs/../Imported',
			assetFolder: 'assets/../lark:doc',
			importMode: 'create-or-update',
			markdown: [
				'# Quarterly plan',
				'',
				'Hero: __LARK_ASSET_asset-001__',
				'Deck: __LARK_ASSET_asset-002__',
			].join('\n'),
			assets: [
				{
					assetId: 'asset-001',
					type: 'image',
					preferredName: 'hero?.png',
					mimeType: 'image/png',
					placeholder: '__LARK_ASSET_asset-001__',
					originalUrl: 'https://example.com/hero.png',
				},
				{
					assetId: 'asset-002',
					type: 'attachment',
					preferredName: 'deck../Q2.pdf',
					mimeType: 'application/pdf',
					placeholder: '__LARK_ASSET_asset-002__',
					originalUrl: 'https://example.com/deck.pdf',
				},
			],
		};

		const result = await writeLarkImport(
			adapter,
			manifest,
			new Map([
				['asset-001', Buffer.from('image-bytes')],
				['asset-002', Buffer.from('pdf-bytes')],
			]),
		);

		expect(result).toEqual({
			notePath: 'Lark Docs/Imported/Quarterly -Plan.md',
			assetPaths: [
				'assets/lark-doc/doc-123/hero-.png',
				'assets/lark-doc/doc-123/deck-Q2.pdf',
			],
			markdown: [
				'# Quarterly plan',
				'',
				'Hero: ![[assets/lark-doc/doc-123/hero-.png]]',
				'Deck: [deck-Q2.pdf](assets/lark-doc/doc-123/deck-Q2.pdf)',
			].join('\n'),
		});
		expect(Array.from(adapter.binaryWrites.keys())).toEqual([
			'assets/lark-doc/doc-123/hero-.png',
			'assets/lark-doc/doc-123/deck-Q2.pdf',
		]);
		expect(adapter.textWrites.get('Lark Docs/Imported/Quarterly -Plan.md')).toBe(result.markdown);
		expect(adapter.operations).toEqual([
			'mkdir:assets',
			'mkdir:assets/lark-doc',
			'mkdir:assets/lark-doc/doc-123',
			'writeBinary:assets/lark-doc/doc-123/hero-.png',
			'writeBinary:assets/lark-doc/doc-123/deck-Q2.pdf',
			'mkdir:Lark Docs',
			'mkdir:Lark Docs/Imported',
			'write:Lark Docs/Imported/Quarterly -Plan.md',
		]);
	});

	test('throws before writing the note when a declared asset file is missing', async () => {
		const adapter = new FakeAdapter();
		const manifest: LarkImportManifest = {
			docId: 'doc-123',
			title: 'Quarterly Plan',
			sourceUrl: 'https://example.com/doc/123',
			noteFolder: 'Lark Docs',
			assetFolder: 'assets/larkdoc',
			importMode: 'create-or-update',
			markdown: '__LARK_ASSET_asset-001__',
			assets: [
				{
					assetId: 'asset-001',
					type: 'image',
					preferredName: 'hero.png',
					mimeType: 'image/png',
					placeholder: '__LARK_ASSET_asset-001__',
					originalUrl: 'https://example.com/hero.png',
				},
			],
		};

		await expect(writeLarkImport(adapter, manifest, new Map())).rejects.toThrow(
			'missing file for asset-001',
		);
		expect(adapter.textWrites.size).toBe(0);
	});

	test('renames colliding sanitized asset filenames within one import', async () => {
		const adapter = new FakeAdapter();
		const manifest: LarkImportManifest = {
			docId: 'doc-123',
			title: 'Collision Demo',
			sourceUrl: 'https://example.com/doc/123',
			noteFolder: 'Lark Docs',
			assetFolder: 'assets/larkdoc',
			importMode: 'create-or-update',
			markdown: '__LARK_ASSET_asset-001__\n__LARK_ASSET_asset-002__',
			assets: [
				{
					assetId: 'asset-001',
					type: 'attachment',
					preferredName: 'same?.png',
					mimeType: 'image/png',
					placeholder: '__LARK_ASSET_asset-001__',
					originalUrl: 'https://example.com/a.png',
				},
				{
					assetId: 'asset-002',
					type: 'attachment',
					preferredName: 'same*.png',
					mimeType: 'image/png',
					placeholder: '__LARK_ASSET_asset-002__',
					originalUrl: 'https://example.com/b.png',
				},
			],
		};

		const result = await writeLarkImport(
			adapter,
			manifest,
			new Map([
				['asset-001', Buffer.from('first')],
				['asset-002', Buffer.from('second')],
			]),
		);

		expect(result.assetPaths).toEqual([
			'assets/larkdoc/doc-123/same-.png',
			'assets/larkdoc/doc-123/same--2.png',
		]);
		expect(result.markdown).toBe(
			'[same-.png](assets/larkdoc/doc-123/same-.png)\n[same--2.png](assets/larkdoc/doc-123/same--2.png)',
		);
		expect(adapter.binaryWrites.get('assets/larkdoc/doc-123/same-.png')).toEqual(
			Buffer.from('first'),
		);
		expect(adapter.binaryWrites.get('assets/larkdoc/doc-123/same--2.png')).toEqual(
			Buffer.from('second'),
		);
	});

	test('embeds imported videos with Obsidian wikilinks', async () => {
		const adapter = new FakeAdapter();
		const manifest: LarkImportManifest = {
			docId: 'doc-123',
			title: 'Video Demo',
			sourceUrl: 'https://example.com/doc/123',
			noteFolder: 'Lark Docs',
			assetFolder: 'assets/larkdoc',
			importMode: 'create-or-update',
			markdown: '__LARK_ASSET_asset-001__',
			assets: [
				{
					assetId: 'asset-001',
					type: 'video',
					preferredName: 'demo.mp4',
					mimeType: 'video/mp4',
					placeholder: '__LARK_ASSET_asset-001__',
					originalUrl: 'https://example.com/demo.mp4',
				},
			],
		};

		const result = await writeLarkImport(
			adapter,
			manifest,
			new Map([
				['asset-001', Buffer.from('video-bytes')],
			]),
		);

		expect(result.markdown).toBe('![[assets/larkdoc/doc-123/demo.mp4]]');
		expect(adapter.binaryWrites.get('assets/larkdoc/doc-123/demo.mp4')).toEqual(
			Buffer.from('video-bytes'),
		);
	});
});

describe('import path sanitization', () => {
	test('drops trailing dots and spaces from Windows path parts', () => {
		expect(sanitizePathPart('folder. ')).toBe('folder');
		expect(buildNotePath('Docs. /Imported ', 'Quarterly Plan. ')).toBe(
			'Docs/Imported/Quarterly Plan.md',
		);
	});

	test('renames Windows reserved basenames deterministically', () => {
		expect(sanitizePathPart('CON')).toBe('CON-');
		expect(buildAssetPath('assets/AUX', 'doc-123', 'PRN .png ')).toBe(
			'assets/AUX-/doc-123/PRN-.png',
		);
		expect(buildNotePath('Lark Docs', 'NUL')).toBe('Lark Docs/NUL-.md');
	});
});
