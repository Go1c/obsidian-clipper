import { describe, expect, test } from 'vitest';
import { parseHTML } from 'linkedom';
import { discoverLarkAssets } from './lark-assets';

function parse(html: string): Document {
	const { document } = parseHTML(html);
	return document as unknown as Document;
}

describe('discoverLarkAssets', () => {
	test('ignores ordinary text paragraphs that contain inline hyperlinks', () => {
		const doc = parse(`
			<html>
				<body>
					<div data-block-id="paragraph">
						Read the <a href="https://example.com/guide">setup guide</a> before continuing.
					</div>
				</body>
			</html>
		`);

		const result = discoverLarkAssets(doc);

		expect(result.assets).toEqual([]);
		expect(result.htmlByBlockId.size).toBe(0);
	});

	test('ignores prose paragraphs that mention filename-like links and file sizes inline', () => {
		const doc = parse(`
			<html>
				<body>
					<div data-block-id="paragraph">
						Please review <a href="https://example.com/files/Quarterly_Report.pdf">Quarterly_Report.pdf</a>
						and send comments before the 12 MB upload is archived tomorrow.
					</div>
				</body>
			</html>
		`);

		const result = discoverLarkAssets(doc);

		expect(result.assets).toEqual([]);
		expect(result.htmlByBlockId.size).toBe(0);
	});

	test('finds image, video, and attachment blocks in document order', () => {
		const doc = parse(`
			<html>
				<body>
					<div data-block-id="intro">Intro text</div>
					<div data-block-id="image-block">
						<img src="https://example.com/image.png" alt="Diagram" />
					</div>
					<div data-block-id="video-block">
						<video controls src="https://example.com/demo.mp4"></video>
					</div>
					<div data-block-id="attachment-block">
						<a href="https://example.com/file.pdf">Quarterly Report.pdf</a>
					</div>
				</body>
			</html>
		`);

		const result = discoverLarkAssets(doc);

		expect(result.assets).toEqual([
			{
				assetId: 'asset-001',
				type: 'image',
				blockId: 'image-block',
				originalUrl: 'https://example.com/image.png',
				preferredName: 'image.png',
				mimeType: 'image/png',
				placeholder: '__LARK_ASSET_asset-001__',
			},
			{
				assetId: 'asset-002',
				type: 'video',
				blockId: 'video-block',
				originalUrl: 'https://example.com/demo.mp4',
				preferredName: 'demo.mp4',
				mimeType: 'video/mp4',
				placeholder: '__LARK_ASSET_asset-002__',
			},
			{
				assetId: 'asset-003',
				type: 'attachment',
				blockId: 'attachment-block',
				originalUrl: 'https://example.com/file.pdf',
				preferredName: 'Quarterly Report.pdf',
				mimeType: 'application/pdf',
				placeholder: '__LARK_ASSET_asset-003__',
			},
		]);
		expect(result.htmlByBlockId.get('image-block')).toBe('<p>__LARK_ASSET_asset-001__</p>');
		expect(result.htmlByBlockId.get('video-block')).toBe('<p>__LARK_ASSET_asset-002__</p>');
		expect(result.htmlByBlockId.get('attachment-block')).toBe('<p>__LARK_ASSET_asset-003__</p>');
	});

	test('derives deterministic fallback names and mime types', () => {
		const doc = parse(`
			<html>
				<body>
					<div data-block-id="image-block">
						<img src="https://example.com/assets/" alt="Diagram" />
					</div>
					<div data-block-id="video-block">
						<video controls>
							<source src="https://example.com/media/demo.webm?download=1" type="video/webm" />
						</video>
					</div>
					<div data-block-id="attachment-block">
						<a href="https://example.com/downloads/archive.zip?dl=1">Download file</a>
					</div>
				</body>
			</html>
		`);

		const result = discoverLarkAssets(doc);

		expect(result.assets).toEqual([
			{
				assetId: 'asset-001',
				type: 'image',
				blockId: 'image-block',
				originalUrl: 'https://example.com/assets/',
				preferredName: 'image.png',
				mimeType: 'image/png',
				placeholder: '__LARK_ASSET_asset-001__',
			},
			{
				assetId: 'asset-002',
				type: 'video',
				blockId: 'video-block',
				originalUrl: 'https://example.com/media/demo.webm?download=1',
				preferredName: 'demo.webm',
				mimeType: 'video/webm',
				placeholder: '__LARK_ASSET_asset-002__',
			},
			{
				assetId: 'asset-003',
				type: 'attachment',
				blockId: 'attachment-block',
				originalUrl: 'https://example.com/downloads/archive.zip?dl=1',
				preferredName: 'archive.zip',
				mimeType: 'application/zip',
				placeholder: '__LARK_ASSET_asset-003__',
			},
		]);
	});

	test('prefers lazy-loaded image URLs and resolves them against the document base URI', () => {
		const doc = parse(`
			<html>
				<head>
					<base href="https://example.feishu.cn/wiki/wikcnExampleToken" />
				</head>
				<body>
					<div data-block-id="image-block">
						<img
							src="api"
							data-src="/space/api/box/stream/download/asynccode/?code=step-6"
							alt="Step 6 screenshot"
						/>
					</div>
				</body>
			</html>
		`);

		const result = discoverLarkAssets(doc);

		expect(result.assets).toEqual([
			{
				assetId: 'asset-001',
				type: 'image',
				blockId: 'image-block',
				originalUrl: 'https://example.feishu.cn/space/api/box/stream/download/asynccode/?code=step-6',
				preferredName: 'image.png',
				mimeType: 'image/png',
				placeholder: '__LARK_ASSET_asset-001__',
			},
		]);
	});

	test('ignores inline data-url images that are not downloadable assets', () => {
		const doc = parse(`
			<html>
				<body>
					<div data-block-id="inline-svg">
						<img
							src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCI+PC9zdmc+"
							alt="inline icon"
						/>
					</div>
				</body>
			</html>
		`);

		const result = discoverLarkAssets(doc);

		expect(result.assets).toEqual([]);
		expect(result.htmlByBlockId.size).toBe(0);
	});

	test('prefers a video over its poster image in the same block', () => {
		const doc = parse(`
			<html>
				<body>
					<div data-block-id="video-card">
						<video poster="https://example.com/poster.png">
							<source src="https://example.com/demo.mov" type="video/quicktime" />
						</video>
						<img src="https://example.com/poster.png" alt="poster" />
					</div>
				</body>
			</html>
		`);

		const result = discoverLarkAssets(doc);

		expect(result.assets).toEqual([
			{
				assetId: 'asset-001',
				type: 'video',
				blockId: 'video-card',
				originalUrl: 'https://example.com/demo.mov',
				preferredName: 'demo.mov',
				mimeType: 'video/quicktime',
				placeholder: '__LARK_ASSET_asset-001__',
			},
		]);
	});

	test('prefers attachment-card semantics over thumbnail images in the same block', () => {
		const doc = parse(`
			<html>
				<body>
					<div data-block-id="attachment-card">
						<img src="https://example.com/thumb.png" alt="thumbnail" />
						<a href="https://example.com/files/Quarterly_Report.pdf">Quarterly Report.pdf</a>
						<span>12 MB</span>
					</div>
				</body>
			</html>
		`);

		const result = discoverLarkAssets(doc);

		expect(result.assets).toEqual([
			{
				assetId: 'asset-001',
				type: 'attachment',
				blockId: 'attachment-card',
				originalUrl: 'https://example.com/files/Quarterly_Report.pdf',
				preferredName: 'Quarterly Report.pdf',
				mimeType: 'application/pdf',
				placeholder: '__LARK_ASSET_asset-001__',
			},
		]);
	});

	test('ignores URL preview cards that are not real file attachments', () => {
		const doc = parse(`
			<html>
				<body>
					<div data-block-id="url-preview">
						<img src="https://example.com/thumb.png" alt="thumbnail" />
						<a href="https://example.com/redirect/https%3A%2F%2Fexample.invalid%2Fapi">
							https://example.invalid/api
						</a>
						<span>167 KB</span>
					</div>
				</body>
			</html>
		`);

		const result = discoverLarkAssets(doc);

		expect(result.assets).toEqual([]);
		expect(result.htmlByBlockId.size).toBe(0);
	});

	test('prefers a later attachment-card mirror over an earlier image mirror for the same block id', () => {
		const doc = parse(`
			<html>
				<body>
					<div data-block-id="shared-block">
						<img src="https://example.com/thumb.png" alt="thumbnail" />
					</div>
					<div data-block-id="shared-block">
						<img src="https://example.com/thumb.png" alt="thumbnail" />
						<a href="https://example.com/files/Quarterly_Report.pdf">Quarterly Report.pdf</a>
						<span>12 MB</span>
					</div>
				</body>
			</html>
		`);

		const result = discoverLarkAssets(doc);

		expect(result.assets).toEqual([
			{
				assetId: 'asset-001',
				type: 'attachment',
				blockId: 'shared-block',
				originalUrl: 'https://example.com/files/Quarterly_Report.pdf',
				preferredName: 'Quarterly Report.pdf',
				mimeType: 'application/pdf',
				placeholder: '__LARK_ASSET_asset-001__',
			},
		]);
	});

	test('skips Lark cover/avatar CDN images by URL pattern', () => {
		const doc = parse(`
			<html>
				<body>
					<h1 data-testid="doc-title">Real title</h1>
					<div data-block-id="cover">
						<img src="https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/v3_00qi_67c809ef-c474-4010-b0a8-d2670752ff0g~.jpg" />
					</div>
					<div data-block-id="real-img">
						<img src="https://example.com/screenshot.png" />
					</div>
				</body>
			</html>
		`);

		const result = discoverLarkAssets(doc);

		expect(result.assets.map(a => a.blockId)).toEqual(['real-img']);
	});
});
