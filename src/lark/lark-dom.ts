import { discoverLarkAssets, type LarkAssetDescriptor } from './lark-assets';
import { extractLarkDocumentId } from './lark-url';

export interface LarkPageExtraction {
	title: string;
	contentHtml: string;
	plainText: string;
	hasDocumentBlocks: boolean;
	assets: LarkAssetDescriptor[];
	extractedContent: Record<string, string>;
}

const ZERO_WIDTH_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;
const NUMBERED_STEP_MARKER = /(.)(\s*)(\d+[.．]\s*(?!\d))/g;
const ATTACHMENT_TEXT = /\.[a-z0-9]{1,8}\s*\d+(?:\.\d+)?\s*(?:B|KB|MB|GB|TB)$/i;
const ATTACHMENT_SUFFIX = /\s+.+?\.[a-z0-9]{1,8}\s*\d+(?:\.\d+)?\s*(?:B|KB|MB|GB|TB)$/i;
const LARK_BROWSER_TITLE_SUFFIX = /\s*[-|]\s*(?:飞书云文档|Feishu|Lark(?:\s+Docs?)?)\s*$/i;
const INLINE_EDITOR_CHROME_PATTERNS = [
	/输入[“"]\/[”"]快速插入内容/gi,
	/添加图标/gi,
	/添加封面/gi,
	/AI\s*速览(?:试用)?/gi,
	/本文暂未被其它?文档引用/gi,
];
const TRAILING_EDIT_META = /(?:^|\s)[A-Za-z0-9_\-\u4e00-\u9fff]{1,20}(?:(?:今天|昨天|前天|刚刚)|(?:\d{1,2}月\d{1,2}日))修改(?=$|\s)/g;
const GENERIC_LARK_TITLES = new Set([
	'飞书云文档',
	'feishu',
	'lark',
	'lark docs',
	'lark doc',
	'untitled lark document',
]);

interface TextContentBlock {
	kind: 'text';
	text: string;
}

interface HtmlContentBlock {
	kind: 'html';
	html: string;
}

type ContentBlock = TextContentBlock | HtmlContentBlock;

interface RawContentBlock {
	blockId: string | null;
	text: string;
	html: string | null;
	parentElement: Element | null;
	assetType: LarkAssetDescriptor['type'] | null;
}

interface BlockTextResult {
	blocks: ContentBlock[];
	plainTextBlocks: string[];
	hasDocumentBlocks: boolean;
}

interface NumberedStep {
	number: number;
	marker: string;
	body: string;
}

function normalizeLarkText(value: string): string {
	return value
		.replace(ZERO_WIDTH_CHARS, ' ')
		.replace(/\u00a0/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function textOf(element: Element | null | undefined): string {
	return normalizeLarkText(element?.textContent || '');
}

function normalizeTitleCandidate(value: string): string {
	return normalizeLarkText(value).replace(LARK_BROWSER_TITLE_SUFFIX, '').trim();
}

function isGenericLarkTitle(value: string): boolean {
	return GENERIC_LARK_TITLES.has(normalizeLarkText(value).toLowerCase());
}

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
	return (relation & 0x02) !== 0; // DOCUMENT_POSITION_PRECEDING
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function findTitle(doc: Document): string {
	const candidates = [
		'[data-testid="doc-title"]',
		'[data-test-id="doc-title"]',
		'.doc-title',
		'h1',
	];

	let elementTitle = '';
	for (const selector of candidates) {
		const title = textOf(doc.querySelector(selector));
		if (title) {
			elementTitle = title;
			break;
		}
	}

	const browserTitle = normalizeTitleCandidate(doc.title || '');
	if (elementTitle && !isGenericLarkTitle(elementTitle)) return elementTitle;
	if (browserTitle && !isGenericLarkTitle(browserTitle)) return browserTitle;
	return elementTitle || browserTitle || 'Untitled Lark Document';
}

function isEditorChromeText(text: string): boolean {
	return text === '输入“/”快速插入内容'
		|| text === '输入"/"快速插入内容'
		|| (/AI\s*速览/.test(text) && /(?:今天|昨天|前天|刚刚)?修改/.test(text));
}

function removeInlineEditorChrome(text: string): string {
	let cleaned = text;

	for (const pattern of INLINE_EDITOR_CHROME_PATTERNS) {
		cleaned = cleaned.replace(pattern, ' ');
	}

	cleaned = cleaned.replace(TRAILING_EDIT_META, ' ');
	return normalizeLarkText(cleaned);
}

function splitDenseNumberedSteps(text: string): string[] {
	const withBreaks = text.replace(NUMBERED_STEP_MARKER, (match, before: string, _space: string, marker: string, offset: number) => {
		if (offset === 0) return match;
		return `${before}\n${marker}`;
	});

	return withBreaks
		.split('\n')
		.map(part => normalizeLarkText(part))
		.filter(Boolean);
}

function isAttachmentText(text: string): boolean {
	return ATTACHMENT_TEXT.test(text);
}

function parseNumberedStep(text: string): NumberedStep | null {
	const match = text.match(/^(\d+)[.．]\s*(.+)$/);
	if (!match) return null;

	const body = normalizeLarkText(match[2]);
	if (!body) return null;

	return {
		number: Number(match[1]),
		marker: `${match[1]}.`,
		body,
	};
}

function canonicalizeNumberedStep(text: string): string | null {
	const step = parseNumberedStep(text);
	if (!step) return null;

	const stepBody = normalizeLarkText(step.body.replace(ATTACHMENT_SUFFIX, ''));
	return stepBody ? `${step.marker} ${stepBody}` : step.marker;
}

function alreadyContainsAttachment(text: string, existingTexts: string[]): boolean {
	return isAttachmentText(text) && existingTexts.some(existing => existing.includes(text));
}

function cleanupBlockTexts(blocks: RawContentBlock[]): { blocks: ContentBlock[]; plainTextBlocks: string[] } {
	const cleanedBlocks: ContentBlock[] = [];
	const cleanedTexts: string[] = [];
	const seenNumberedSteps = new Set<string>();

	for (const block of blocks) {
		if (block.html) {
			cleanedBlocks.push({ kind: 'html', html: block.html });
			continue;
		}

		const cleanedBlock = removeInlineEditorChrome(block.text);
		if (!cleanedBlock || isEditorChromeText(cleanedBlock)) continue;

		for (const part of splitDenseNumberedSteps(cleanedBlock)) {
			const cleanedPart = removeInlineEditorChrome(part);
			if (!cleanedPart || isEditorChromeText(cleanedPart)) continue;

			const numberedStepKey = canonicalizeNumberedStep(cleanedPart);
			if (numberedStepKey) {
				if (seenNumberedSteps.has(numberedStepKey)) continue;
				seenNumberedSteps.add(numberedStepKey);
			}

			if (alreadyContainsAttachment(cleanedPart, cleanedTexts)) continue;
			cleanedTexts.push(cleanedPart);
			cleanedBlocks.push({ kind: 'text', text: cleanedPart });
		}
	}

	return {
		blocks: cleanedBlocks,
		plainTextBlocks: cleanedTexts,
	};
}

function renderContentHtml(blocks: ContentBlock[]): string {
	const htmlParts: string[] = [];
	let orderedListItems: string[] = [];
	let orderedListStart: number | null = null;

	const flushOrderedList = () => {
		if (orderedListItems.length === 0) return;
		const startAttribute = orderedListStart && orderedListStart > 1 ? ` start="${orderedListStart}"` : '';
		htmlParts.push(`<ol${startAttribute}>${orderedListItems.join('')}</ol>`);
		orderedListItems = [];
		orderedListStart = null;
	};

	for (const block of blocks) {
		if (block.kind === 'html') {
			flushOrderedList();
			htmlParts.push(block.html);
			continue;
		}

		const step = parseNumberedStep(block.text);
		if (step) {
			if (orderedListItems.length === 0) {
				orderedListStart = step.number;
			}
			orderedListItems.push(`<li>${escapeHtml(step.body)}</li>`);
			continue;
		}

		flushOrderedList();
		htmlParts.push(`<p>${escapeHtml(block.text)}</p>`);
	}

	flushOrderedList();
	return htmlParts.join('\n');
}

function isLikelyImageOcrText(text: string): boolean {
	const cleaned = normalizeLarkText(text);
	if (!cleaned || parseNumberedStep(cleaned)) return false;

	const hasUrl = /https?:\/\/|www\./i.test(cleaned);
	const hasLabelCue = /(?:^|\s)(?:URL|API|Key)(?:\s|$)/i.test(cleaned);
	return cleaned.length <= 160 && (hasUrl || hasLabelCue);
}

function stripLikelyImageOcrSuffix(text: string): string {
	const markerMatch = text.match(/\s+URL\s+https?:\/\/\S+/i);
	if (!markerMatch || markerMatch.index === undefined) {
		return text;
	}

	return normalizeLarkText(text.slice(0, markerMatch.index));
}

function pruneSiblingImageOcrBlocks(rawBlocks: RawContentBlock[]): RawContentBlock[] {
	const indexesToDrop = new Set<number>();
	const normalizedBlocks = rawBlocks.map(block => ({ ...block }));

	for (let index = 0; index < normalizedBlocks.length - 1; index += 1) {
		const block = normalizedBlocks[index];
		const next = normalizedBlocks[index + 1];
		if (block.html || !next?.html) continue;
		if (next.assetType !== 'image' && next.assetType !== 'video') continue;
		if (block.parentElement !== next.parentElement) continue;

		const stripped = stripLikelyImageOcrSuffix(block.text);
		if (stripped && stripped !== block.text) {
			block.text = stripped;
		}
	}

	for (let index = 0; index < normalizedBlocks.length; index += 1) {
		const block = normalizedBlocks[index];
		if (!block.html) continue;
		if (block.assetType !== 'image' && block.assetType !== 'video') continue;
		if (!block.parentElement) continue;

		for (let scan = index - 1; scan >= 0; scan -= 1) {
			const previous = normalizedBlocks[scan];
			if (previous.html) break;
			if (previous.parentElement !== block.parentElement) break;
			if (parseNumberedStep(previous.text)) break;
			if (!isLikelyImageOcrText(previous.text)) break;
			indexesToDrop.add(scan);
		}
	}

	return normalizedBlocks.filter((_block, index) => !indexesToDrop.has(index));
}

function hasAncestorBlock(element: Element, blockSelector: string): boolean {
	let current = element.parentElement;
	while (current) {
		if (current.matches(blockSelector)) {
			return true;
		}
		current = current.parentElement;
	}

	return false;
}

function findBlockTexts(
	doc: Document,
	htmlByBlockId: Map<string, string>,
	assetTypeByBlockId: Map<string, LarkAssetDescriptor['type']>,
): BlockTextResult {
	const blockSelectors = [
		'[data-block-id]',
		'[data-qa="doc-block"]',
		'.doc-block',
		'.text-block',
	];
	const blockSelector = blockSelectors.join(',');

	const titleElement = findTitleElement(doc);
	const rawBlocks: RawContentBlock[] = [];
	const blockIndexes = new Map<string, number>();

	for (const element of Array.from(doc.querySelectorAll(blockSelector))) {
		if (isHidden(element)) continue;
		if (isCoverOrIconBlock(element)) continue;
		if (isBeforeTitle(element, titleElement)) continue;
		if (hasAncestorBlock(element, blockSelector)) continue;

		const blockId = element.getAttribute('data-block-id');
		const placeholderHtml = blockId ? htmlByBlockId.get(blockId) || null : null;
		const text = placeholderHtml ? '' : textOf(element);
		if (!placeholderHtml && !text) continue;

		if (!blockId) {
			rawBlocks.push({
				blockId: null,
				text,
				html: placeholderHtml,
				parentElement: element.parentElement,
				assetType: null,
			});
			continue;
		}

		const existingIndex = blockIndexes.get(blockId);
		if (existingIndex === undefined) {
			blockIndexes.set(blockId, rawBlocks.length);
			rawBlocks.push({
				blockId,
				text,
				html: placeholderHtml,
				parentElement: element.parentElement,
				assetType: assetTypeByBlockId.get(blockId) || null,
			});
			continue;
		}

		if (placeholderHtml) {
			rawBlocks[existingIndex] = {
				blockId,
				text: '',
				html: placeholderHtml,
				parentElement: element.parentElement,
				assetType: assetTypeByBlockId.get(blockId) || null,
			};
			continue;
		}

		if (!rawBlocks[existingIndex].html && text.length > rawBlocks[existingIndex].text.length) {
			rawBlocks[existingIndex] = {
				...rawBlocks[existingIndex],
				text,
				html: null,
				parentElement: element.parentElement,
			};
		}
	}

	if (rawBlocks.length > 0) {
		const cleaned = cleanupBlockTexts(pruneSiblingImageOcrBlocks(rawBlocks));
		return {
			blocks: cleaned.blocks,
			plainTextBlocks: cleaned.plainTextBlocks,
			hasDocumentBlocks: true,
		};
	}

	const fallbackRegions = [
		doc.querySelector('main'),
		doc.querySelector('article'),
		doc.body,
	];

	for (const region of fallbackRegions) {
		const fallbackText = textOf(region);
		if (fallbackText) {
			const cleaned = cleanupBlockTexts([{
				blockId: null,
				text: fallbackText,
				html: null,
				parentElement: region?.parentElement || null,
				assetType: null,
			}]);
			return {
				blocks: cleaned.blocks,
				plainTextBlocks: cleaned.plainTextBlocks,
				hasDocumentBlocks: false,
			};
		}
	}

	return { blocks: [], plainTextBlocks: [], hasDocumentBlocks: false };
}

export function extractLarkPage(doc: Document, url: string): LarkPageExtraction {
	const title = findTitle(doc);
	const assetExtraction = discoverLarkAssets(doc);
	const assetTypeByBlockId = new Map(
		assetExtraction.assets.map(asset => [asset.blockId, asset.type] as const),
	);
	const blocks = findBlockTexts(doc, assetExtraction.htmlByBlockId, assetTypeByBlockId);
	const plainText = blocks.plainTextBlocks.join('\n');
	const contentHtml = renderContentHtml(blocks.blocks);

	return {
		title,
		contentHtml,
		plainText,
		hasDocumentBlocks: blocks.hasDocumentBlocks,
		assets: assetExtraction.assets,
		extractedContent: {
			larkDocumentId: extractLarkDocumentId(url),
			larkSourceUrl: url,
		},
	};
}
