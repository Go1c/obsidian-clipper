import { describe, expect, test } from 'vitest';
import { handleRequest } from '../src/http/router';

class FakeAdapter {
	folders = new Set<string>();
	textWrites = new Map<string, string>();
	binaryWrites = new Map<string, Buffer>();

	async exists(path: string): Promise<boolean> {
		return this.folders.has(path) || this.textWrites.has(path) || this.binaryWrites.has(path);
	}

	async mkdir(path: string): Promise<void> {
		this.folders.add(path);
	}

	async write(path: string, data: string): Promise<void> {
		this.textWrites.set(path, data);
	}

	async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
		this.binaryWrites.set(path, Buffer.from(data));
	}
}

function buildMultipartRequest(
	boundary: string,
	manifest: object | string,
	files: Array<{ filename: string; type: string; data: Buffer }>,
): Buffer {
	const chunks: Buffer[] = [
		Buffer.from(
			[
				`--${boundary}`,
				'Content-Disposition: form-data; name="manifest"',
				'Content-Type: application/json; charset=utf-8',
				'',
				typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
			].join('\r\n') + '\r\n',
		),
	];

	for (const file of files) {
		chunks.push(
			Buffer.from(
				[
					`--${boundary}`,
					`Content-Disposition: form-data; name="file"; filename="${file.filename}"`,
					`Content-Type: ${file.type}`,
					'',
				].join('\r\n') + '\r\n',
			),
		);
		chunks.push(file.data);
		chunks.push(Buffer.from('\r\n'));
	}

	chunks.push(Buffer.from(`--${boundary}--\r\n`));
	return Buffer.concat(chunks);
}

async function postImport(boundary: string, manifest: object | string): Promise<Awaited<ReturnType<typeof handleRequest>>> {
	return handleRequest(
		{
			method: 'POST',
			url: '/imports/lark',
			headers: {
				authorization: 'Bearer secret',
				'content-type': `multipart/form-data; boundary=${boundary}`,
			},
			readBody: async () => buildMultipartRequest(boundary, manifest, []),
		},
		{
			apiKey: 'secret',
			version: '0.1.0',
			vaultName: 'Test Vault',
			vault: new FakeAdapter(),
		} as any,
	);
}

describe('health route', () => {
	test('rejects missing auth on protected routes', async () => {
		const response = await handleRequest(
			{
				method: 'POST',
				url: '/imports/lark',
				headers: {},
				body: Buffer.from(''),
			},
			{
				apiKey: 'secret',
				version: '0.1.0',
				vaultName: 'Test Vault',
			},
		);

		expect(response.status).toBe(401);
	});

	test('returns plugin health for localhost clients', async () => {
		const response = await handleRequest(
			{
				method: 'GET',
				url: '/health',
				headers: {},
				body: Buffer.from(''),
			},
			{
				apiKey: 'secret',
				version: '0.1.0',
				vaultName: 'Test Vault',
			},
		);

		expect(response.status).toBe(200);
		expect(JSON.parse(response.body.toString())).toEqual({
			ok: true,
			version: '0.1.0',
			vault: 'Test Vault',
		});
	});

	test('imports multipart lark payloads after auth', async () => {
		const adapter = new FakeAdapter();
		const boundary = 'test-boundary';
		const manifest = {
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

		const response = await handleRequest(
			{
				method: 'POST',
				url: '/imports/lark',
				headers: {
					authorization: 'Bearer secret',
					'content-type': `multipart/form-data; boundary=${boundary}`,
				},
				readBody: async () =>
					buildMultipartRequest(boundary, manifest, [
						{
							filename: 'asset-001__hero.png',
							type: 'image/png',
							data: Buffer.from('image-bytes'),
						},
					]),
			},
			{
				apiKey: 'secret',
				version: '0.1.0',
				vaultName: 'Test Vault',
				vault: adapter,
			} as any,
		);

		expect(response.status).toBe(200);
		expect(JSON.parse(response.body.toString())).toEqual({
			ok: true,
			result: {
				notePath: 'Lark Docs/Quarterly Plan.md',
				assetPaths: ['assets/larkdoc/doc-123/hero.png'],
				markdown: '![[assets/larkdoc/doc-123/hero.png]]',
			},
		});
		expect(adapter.textWrites.get('Lark Docs/Quarterly Plan.md')).toBe(
			'![[assets/larkdoc/doc-123/hero.png]]',
		);
		expect(adapter.binaryWrites.get('assets/larkdoc/doc-123/hero.png')).toEqual(
			Buffer.from('image-bytes'),
		);
	});

	test('returns 400 for malformed manifest json', async () => {
		const boundary = 'bad-json-boundary';

		const response = await handleRequest(
			{
				method: 'POST',
				url: '/imports/lark',
				headers: {
					authorization: 'Bearer secret',
					'content-type': `multipart/form-data; boundary=${boundary}`,
				},
				readBody: async () => buildMultipartRequest(boundary, '{"docId":', []),
			},
			{
				apiKey: 'secret',
				version: '0.1.0',
				vaultName: 'Test Vault',
				vault: new FakeAdapter(),
			} as any,
		);

		expect(response.status).toBe(400);
		expect(JSON.parse(response.body.toString())).toEqual({
			ok: false,
			error: 'invalid manifest json',
		});
	});

	test('parses file bytes that contain the boundary text', async () => {
		const adapter = new FakeAdapter();
		const boundary = 'binary-boundary';
		const fileBytes = Buffer.from(`prefix--${boundary}--suffix`, 'utf8');
		const manifest = {
			docId: 'doc-123',
			title: 'Binary Boundary Demo',
			sourceUrl: 'https://example.com/doc/123',
			noteFolder: 'Lark Docs',
			assetFolder: 'assets/larkdoc',
			importMode: 'create-or-update',
			markdown: '__LARK_ASSET_asset-001__',
			assets: [
				{
					assetId: 'asset-001',
					type: 'attachment',
					preferredName: 'payload.bin',
					mimeType: 'application/octet-stream',
					placeholder: '__LARK_ASSET_asset-001__',
					originalUrl: 'https://example.com/payload.bin',
				},
			],
		};

		const response = await handleRequest(
			{
				method: 'POST',
				url: '/imports/lark',
				headers: {
					authorization: 'Bearer secret',
					'content-type': `multipart/form-data; boundary=${boundary}`,
				},
				readBody: async () =>
					buildMultipartRequest(boundary, manifest, [
						{
							filename: 'asset-001__payload.bin',
							type: 'application/octet-stream',
							data: fileBytes,
						},
					]),
			},
			{
				apiKey: 'secret',
				version: '0.1.0',
				vaultName: 'Test Vault',
				vault: adapter,
			} as any,
		);

		expect(response.status).toBe(200);
		expect(adapter.binaryWrites.get('assets/larkdoc/doc-123/payload.bin')).toEqual(fileBytes);
		expect(JSON.parse(response.body.toString())).toEqual({
			ok: true,
			result: {
				notePath: 'Lark Docs/Binary Boundary Demo.md',
				assetPaths: ['assets/larkdoc/doc-123/payload.bin'],
				markdown: '[payload.bin](assets/larkdoc/doc-123/payload.bin)',
			},
		});
	});

	test('returns 400 when an asset placeholder is empty', async () => {
		const response = await postImport('empty-placeholder-boundary', {
			docId: 'doc-123',
			title: 'Invalid Manifest',
			sourceUrl: 'https://example.com/doc/123',
			noteFolder: 'Lark Docs',
			assetFolder: 'assets/larkdoc',
			importMode: 'create-or-update',
			markdown: 'content',
			assets: [
				{
					assetId: 'asset-001',
					type: 'image',
					preferredName: 'hero.png',
					mimeType: 'image/png',
					placeholder: '',
					originalUrl: 'https://example.com/hero.png',
				},
			],
		});

		expect(response.status).toBe(400);
		expect(JSON.parse(response.body.toString())).toEqual({
			ok: false,
			error: 'invalid manifest',
		});
	});

	test('returns 400 when an assetId is blank', async () => {
		const response = await postImport('blank-assetid-boundary', {
			docId: 'doc-123',
			title: 'Invalid Manifest',
			sourceUrl: 'https://example.com/doc/123',
			noteFolder: 'Lark Docs',
			assetFolder: 'assets/larkdoc',
			importMode: 'create-or-update',
			markdown: 'content',
			assets: [
				{
					assetId: '   ',
					type: 'image',
					preferredName: 'hero.png',
					mimeType: 'image/png',
					placeholder: '__LARK_ASSET_asset-001__',
					originalUrl: 'https://example.com/hero.png',
				},
			],
		});

		expect(response.status).toBe(400);
		expect(JSON.parse(response.body.toString())).toEqual({
			ok: false,
			error: 'invalid manifest',
		});
	});

	test('returns 400 when assetIds are duplicated', async () => {
		const response = await postImport('duplicate-assetid-boundary', {
			docId: 'doc-123',
			title: 'Invalid Manifest',
			sourceUrl: 'https://example.com/doc/123',
			noteFolder: 'Lark Docs',
			assetFolder: 'assets/larkdoc',
			importMode: 'create-or-update',
			markdown: 'content',
			assets: [
				{
					assetId: 'asset-001',
					type: 'image',
					preferredName: 'hero.png',
					mimeType: 'image/png',
					placeholder: '__LARK_ASSET_asset-001__',
					originalUrl: 'https://example.com/hero.png',
				},
				{
					assetId: 'asset-001',
					type: 'attachment',
					preferredName: 'deck.pdf',
					mimeType: 'application/pdf',
					placeholder: '__LARK_ASSET_asset-002__',
					originalUrl: 'https://example.com/deck.pdf',
				},
			],
		});

		expect(response.status).toBe(400);
		expect(JSON.parse(response.body.toString())).toEqual({
			ok: false,
			error: 'invalid manifest',
		});
	});
});
