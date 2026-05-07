export type LarkAssetType = 'image' | 'video' | 'attachment';

export interface LarkAssetDescriptor {
	assetId: string;
	type: LarkAssetType;
	blockId: string;
	originalUrl: string;
	preferredName: string;
	mimeType: string;
	placeholder: string;
}

export interface LarkAssetDiscoveryResult {
	assets: LarkAssetDescriptor[];
	htmlByBlockId: Map<string, string>;
}

interface AssetCandidate {
	type: LarkAssetType;
	url: string;
	linkText: string;
}

const ASSET_TYPE_PRIORITY: Record<LarkAssetType, number> = {
	image: 1,
	video: 2,
	attachment: 3,
};
const FILE_SIZE_TEXT = /\b\d+(?:\.\d+)?\s*(?:B|KB|MB|GB|TB)\b/i;
const FILE_LIKE_EXTENSION = /\.(?:pdf|docx?|xlsx?|pptx?|zip|rar|7z|csv|txt|png|jpe?g|gif|webp|svg|mp3|mp4|mov|webm|avi|exe|dmg|apk|json|md)$/i;

function isHidden(element: Element): boolean {
	const style = element.getAttribute('style') || '';
	return element.hasAttribute('hidden')
		|| element.getAttribute('aria-hidden') === 'true'
		|| /display\s*:\s*none/i.test(style)
		|| /visibility\s*:\s*hidden/i.test(style);
}

const COVER_OR_ICON_ANCESTOR_SELECTOR = [
	'.doc-cover',
	'.docs-cover',
	'.doc-cover-image',
	'.doc-cover-wrapper',
	'.bear-doc-cover-image-wrapper',
	'.bear-doc-cover',
	'.doc-icon',
	'.docs-icon',
	'.doc-icon-wrapper',
	'.icon-emoji',
	'.bear-doc-icon',
	'.bear-doc-icon-wrapper',
	'[class*="doc-cover"]',
	'[class*="docs-cover"]',
	'[class*="doc-icon"]',
	'[class*="docs-icon"]',
].join(',');

function isCoverOrIconBlock(element: Element): boolean {
	if (element.matches(COVER_OR_ICON_ANCESTOR_SELECTOR)) return true;
	return Boolean(element.closest(COVER_OR_ICON_ANCESTOR_SELECTOR));
}

const TITLE_SELECTORS_FOR_FILTER = [
	'[data-testid="doc-title"]',
	'[data-test-id="doc-title"]',
	'.doc-title',
];

function findTitleElement(doc: Document): Element | null {
	for (const selector of TITLE_SELECTORS_FOR_FILTER) {
		const element = doc.querySelector(selector);
		if (element) return element;
	}
	return null;
}

function isBeforeTitle(element: Element, titleElement: Element | null): boolean {
	if (!titleElement) return false;
	if (element === titleElement) return false;
	const relation = titleElement.compareDocumentPosition(element);
	return (relation & 0x02) !== 0;
}

function resolveAssetUrl(doc: Document, value: string | null): string | null {
	if (!value) return null;

	try {
		return new URL(value, doc.baseURI || 'about:blank').href;
	} catch {
		return value;
	}
}

function firstResolvedUrl(doc: Document, element: Element, attributeNames: string[]): string | null {
	for (const attributeName of attributeNames) {
		const resolved = resolveAssetUrl(doc, element.getAttribute(attributeName)?.trim() || null);
		if (resolved) {
			return resolved;
		}
	}

	return null;
}

function isInlineDataUrl(url: string): boolean {
	return /^data:/i.test(url.trim());
}

const COVER_OR_AVATAR_URL_PATTERNS = [
	// Lark cover/avatar CDN: e.g. v3_00qi_67c809ef-c474-4010-b0a8-d2670752ff0g~.jpg
	/\/v3_[0-9a-z]+_[0-9a-z-]{16,}~?\.(jpe?g|png|webp|gif|svg)/i,
	/\/avatar\//i,
	/\/cover\//i,
];

function isCoverOrAvatarUrl(url: string): boolean {
	return COVER_OR_AVATAR_URL_PATTERNS.some(pattern => pattern.test(url));
}

function detectAssetCandidate(doc: Document, block: Element): AssetCandidate | null {
	const attachments = Array.from(block.querySelectorAll('a[href], a[data-href]'));
	for (const attachment of attachments) {
		const url = firstResolvedUrl(doc, attachment, ['data-href', 'href']);
		if (!url) continue;
		if (isInlineDataUrl(url)) continue;

		const linkText = (attachment.textContent || '').trim();
		if (looksLikeAttachmentCard(block, url, linkText)) {
			return {
				type: 'attachment',
				url,
				linkText,
			};
		}
	}

	if (isUrlPreviewCard(block)) {
		return null;
	}

	const videoUrl = findVideoUrl(doc, block);
	if (videoUrl) {
		return { type: 'video', url: videoUrl, linkText: '' };
	}

	const image = block.querySelector('img');
	if (!image) return null;

	const url = firstResolvedUrl(doc, image, [
		'data-src',
		'data-origin-src',
		'data-lazy-src',
		'data-original',
		'src',
	]);
	if (!url) return null;
	if (isInlineDataUrl(url)) return null;
	if (isCoverOrAvatarUrl(url)) return null;

	return { type: 'image', url, linkText: '' };
}

function findVideoUrl(doc: Document, block: Element): string | null {
	const video = block.querySelector('video');
	const directUrl = video ? firstResolvedUrl(doc, video, [
		'data-src',
		'data-origin-src',
		'data-lazy-src',
		'src',
	]) : null;
	if (directUrl && !isInlineDataUrl(directUrl)) {
		return directUrl;
	}

	const source = block.querySelector('video source, source[type^="video/"], source[src]');
	const sourceUrl = source ? firstResolvedUrl(doc, source, [
		'data-src',
		'data-origin-src',
		'data-lazy-src',
		'src',
	]) : null;
	return sourceUrl && !isInlineDataUrl(sourceUrl) ? sourceUrl : null;
}

function createAssetId(index: number): string {
	return `asset-${String(index + 1).padStart(3, '0')}`;
}

function createPlaceholder(assetId: string): string {
	return `__LARK_ASSET_${assetId}__`;
}

function getUrlBasename(url: string): string {
	try {
		const pathname = new URL(url).pathname;
		return pathname.split('/').pop() || '';
	} catch {
		const sanitized = url.split(/[?#]/, 1)[0];
		return sanitized.split('/').pop() || '';
	}
}

function looksLikeFilename(value: string): boolean {
	return /^[^\\/:*?"<>|\r\n]+\.[A-Za-z0-9]{1,8}$/.test(value.trim());
}

function looksLikeFileUrl(url: string): boolean {
	const basename = getUrlBasename(url);
	return FILE_LIKE_EXTENSION.test(basename);
}

function tryDecodeUriComponent(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function looksLikeUrlText(value: string): boolean {
	const normalized = value.trim().toLowerCase();
	if (!normalized) return false;
	if (/^https?:\/\//.test(normalized) || /^www\./.test(normalized)) {
		return true;
	}

	const decoded = tryDecodeUriComponent(normalized);
	return /^https?:\/\//.test(decoded) || /^www\./.test(decoded);
}

function looksLikeAttachmentCard(block: Element, url: string, linkText: string): boolean {
	if (looksLikeUrlText(linkText) || looksLikeUrlText(getUrlBasename(url))) {
		return false;
	}

	const hasFileCue = looksLikeFilename(linkText) || looksLikeFileUrl(url);
	const blockText = normalizeInlineText(block.textContent || '');
	const hasFileSize = FILE_SIZE_TEXT.test(blockText);
	if (!hasFileCue && !hasFileSize) {
		return false;
	}

	const remainder = normalizeInlineText(
		blockText
			.replace(linkText, ' ')
			.replace(FILE_SIZE_TEXT, ' ')
			.replace(/[\s()|,:;._\-–—]+/g, ' '),
	);
	const remainderWords = remainder ? remainder.split(' ').length : 0;
	const hasVisualCardCue = Boolean(block.querySelector('img[src], svg, [role="img"]'));
	const isMostlyMetadata = remainderWords <= 2;

	return hasVisualCardCue || isMostlyMetadata;
}

function isUrlPreviewCard(block: Element): boolean {
	const anchors = Array.from(block.querySelectorAll('a[href], a[data-href]'));
	if (anchors.length === 0) return false;

	const hasVisualCardCue = Boolean(block.querySelector('img, svg, [role="img"]'));
	if (!hasVisualCardCue) return false;

	return anchors.some(anchor => {
		const linkText = (anchor.textContent || '').trim();
		const href = anchor.getAttribute('data-href')?.trim() || anchor.getAttribute('href')?.trim() || '';
		return looksLikeUrlText(linkText) || looksLikeUrlText(getUrlBasename(href));
	});
}

function normalizeInlineText(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function preferredNameForAsset(candidate: AssetCandidate): string {
	const basename = getUrlBasename(candidate.url);

	if (candidate.type === 'attachment') {
		if (looksLikeFilename(candidate.linkText)) {
			return candidate.linkText.trim();
		}
		if (basename) {
			return basename;
		}
		return 'attachment.bin';
	}

	if (candidate.type === 'video') {
		return basename || 'video.mp4';
	}

	return basename || 'image.png';
}

function extensionOf(filename: string): string {
	const match = filename.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
	return match ? match[1] : '';
}

function mimeTypeForAsset(type: LarkAssetType, preferredName: string): string {
	const extension = extensionOf(preferredName);

	if (type === 'image') {
		switch (extension) {
			case 'jpg':
			case 'jpeg':
				return 'image/jpeg';
			case 'gif':
				return 'image/gif';
			case 'webp':
				return 'image/webp';
			case 'svg':
				return 'image/svg+xml';
			case 'png':
			default:
				return 'image/png';
		}
	}

	if (type === 'video') {
		switch (extension) {
			case 'mov':
				return 'video/quicktime';
			case 'webm':
				return 'video/webm';
			case 'avi':
				return 'video/x-msvideo';
			case 'mp4':
			default:
				return 'video/mp4';
		}
	}

	switch (extension) {
		case 'pdf':
			return 'application/pdf';
		case 'zip':
			return 'application/zip';
		case 'png':
			return 'image/png';
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		case 'txt':
			return 'text/plain';
		default:
			return 'application/octet-stream';
	}
}

export function discoverLarkAssets(doc: Document): LarkAssetDiscoveryResult {
	const candidates: Array<AssetCandidate & { blockId: string }> = [];
	const candidateIndexes = new Map<string, number>();
	const titleElement = findTitleElement(doc);

	for (const block of Array.from(doc.querySelectorAll('[data-block-id]'))) {
		if (isHidden(block)) continue;
		if (isCoverOrIconBlock(block)) continue;
		if (isBeforeTitle(block, titleElement)) continue;

		const blockId = block.getAttribute('data-block-id');
		if (!blockId) continue;

		const candidate = detectAssetCandidate(doc, block);
		if (!candidate) continue;

		const existingIndex = candidateIndexes.get(blockId);
		if (existingIndex === undefined) {
			candidateIndexes.set(blockId, candidates.length);
			candidates.push({ blockId, ...candidate });
			continue;
		}

		const existingCandidate = candidates[existingIndex];
		if (ASSET_TYPE_PRIORITY[candidate.type] > ASSET_TYPE_PRIORITY[existingCandidate.type]) {
			candidates[existingIndex] = { blockId, ...candidate };
		}
	}

	const assets = candidates.map((candidate, index) => {
		const assetId = createAssetId(index);
		const preferredName = preferredNameForAsset(candidate);
		return {
			assetId,
			type: candidate.type,
			blockId: candidate.blockId,
			originalUrl: candidate.url,
			preferredName,
			mimeType: mimeTypeForAsset(candidate.type, preferredName),
			placeholder: createPlaceholder(assetId),
		};
	});

	const htmlByBlockId = new Map<string, string>();
	for (const asset of assets) {
		htmlByBlockId.set(asset.blockId, `<p>${asset.placeholder}</p>`);
	}

	return { assets, htmlByBlockId };
}
