const LARK_BLOCK_SELECTOR = '[data-block-id]';
const TITLE_SELECTORS = [
	'[data-testid="doc-title"]',
	'[data-test-id="doc-title"]',
	'.doc-title',
	'h1',
];

interface BlockSnapshot {
	order: number;
	outerHtml: string;
	score: number;
}

interface CandidateCaptureResult {
	snapshots: Map<string, BlockSnapshot>;
	informative: boolean;
}

export interface LarkSnapshotOptions {
	settleMs?: number;
	stepRatio?: number;
	maxPositions?: number;
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
	return (relation & 0x02) !== 0;
}

function elementDepth(element: Element): number {
	let depth = 0;
	let current: Element | null = element;
	while (current?.parentElement) {
		depth += 1;
		current = current.parentElement;
	}
	return depth;
}

function getScrollRange(element: Element): number {
	const scrollHeight = Number((element as HTMLElement).scrollHeight || 0);
	const clientHeight = Number((element as HTMLElement).clientHeight || 0);
	return Math.max(0, scrollHeight - clientHeight);
}

function isScrollableElement(element: Element | null): element is HTMLElement {
	if (!element) return false;
	const scrollElement = element as Partial<HTMLElement>;
	if (typeof scrollElement.scrollTop !== 'number') return false;
	if (typeof scrollElement.scrollHeight !== 'number') return false;
	if (typeof scrollElement.clientHeight !== 'number') return false;
	return getScrollRange(element) > 64;
}

function collectScrollCandidates(doc: Document): HTMLElement[] {
	const blockElements = Array.from(doc.querySelectorAll(LARK_BLOCK_SELECTOR));
	const candidates = new Map<HTMLElement, Set<string>>();

	const addCandidate = (element: Element | null, blockId: string) => {
		if (!isScrollableElement(element)) return;
		const existing = candidates.get(element) || new Set<string>();
		existing.add(blockId);
		candidates.set(element, existing);
	};

	for (const block of blockElements) {
		const blockId = block.getAttribute('data-block-id');
		if (!blockId) continue;

		let current = block.parentElement;
		while (current) {
			addCandidate(current, blockId);
			current = current.parentElement;
		}

		addCandidate(doc.scrollingElement, blockId);
		addCandidate(doc.documentElement, blockId);
		addCandidate(doc.body, blockId);
	}

	return Array.from(candidates.entries())
		.map(([element, blockIds]) => ({
			element,
			blockCount: blockIds.size,
			depth: elementDepth(element),
			range: getScrollRange(element),
		}))
		.filter(candidate => candidate.range > 64)
		.sort((left, right) => (
			right.blockCount - left.blockCount
			|| right.depth - left.depth
			|| right.range - left.range
		))
		.slice(0, 4)
		.map(candidate => candidate.element);
}

function getScrollTop(doc: Document, element: HTMLElement): number {
	if (element === doc.scrollingElement || element === doc.documentElement || element === doc.body) {
		return doc.defaultView?.scrollY ?? element.scrollTop ?? 0;
	}

	return element.scrollTop ?? 0;
}

function setScrollTop(doc: Document, element: HTMLElement, top: number): void {
	const safeTop = Math.max(0, Math.round(top));
	if (element === doc.scrollingElement || element === doc.documentElement || element === doc.body) {
		doc.defaultView?.scrollTo?.(0, safeTop);
		if (typeof element.scrollTo === 'function') {
			element.scrollTo({ top: safeTop });
		}
		element.scrollTop = safeTop;
		return;
	}

	if (typeof element.scrollTo === 'function') {
		element.scrollTo({ top: safeTop });
		return;
	}

	element.scrollTop = safeTop;
}

async function waitForRender(doc: Document, settleMs: number): Promise<void> {
	const raf = doc.defaultView?.requestAnimationFrame?.bind(doc.defaultView);
	if (raf) {
		await new Promise<void>(resolve => raf(() => resolve()));
		await new Promise<void>(resolve => raf(() => resolve()));
	}

	if (settleMs > 0) {
		await new Promise(resolve => setTimeout(resolve, settleMs));
	}
}

function captureVisibleBlocks(doc: Document, snapshots: Map<string, BlockSnapshot>, orderState: { value: number }): void {
	const titleElement = findTitleElement(doc);
	for (const block of Array.from(doc.querySelectorAll(LARK_BLOCK_SELECTOR))) {
		if (isHidden(block)) continue;
		if (isCoverOrIconBlock(block)) continue;
		if (isBeforeTitle(block, titleElement)) continue;

		const blockId = block.getAttribute('data-block-id');
		if (!blockId) continue;

		const outerHtml = (block as HTMLElement).outerHTML || '';
		if (!outerHtml) continue;

		const score = outerHtml.length + (block.textContent || '').trim().length;
		const existing = snapshots.get(blockId);
		if (!existing) {
			snapshots.set(blockId, {
				order: orderState.value,
				outerHtml,
				score,
			});
			orderState.value += 1;
			continue;
		}

		if (score > existing.score) {
			snapshots.set(blockId, {
				...existing,
				outerHtml,
				score,
			});
		}
	}
}

function captureVisibleBlockSignature(doc: Document): string {
	return Array.from(doc.querySelectorAll(LARK_BLOCK_SELECTOR))
		.filter(block => !isHidden(block))
		.map(block => block.getAttribute('data-block-id') || '')
		.filter(Boolean)
		.join('\n');
}

function mergeBlockSnapshots(
	target: Map<string, BlockSnapshot>,
	source: Map<string, BlockSnapshot>,
	orderState: { value: number },
): void {
	for (const [blockId, snapshot] of Array.from(source.entries()).sort((left, right) => left[1].order - right[1].order)) {
		const existing = target.get(blockId);
		if (!existing) {
			target.set(blockId, {
				...snapshot,
				order: orderState.value,
			});
			orderState.value += 1;
			continue;
		}

		if (snapshot.score > existing.score) {
			target.set(blockId, {
				...existing,
				outerHtml: snapshot.outerHtml,
				score: snapshot.score,
			});
		}
	}
}

async function captureCandidateSnapshots(
	doc: Document,
	candidate: HTMLElement,
	settleMs: number,
	stepRatio: number,
	maxPositions: number,
): Promise<CandidateCaptureResult> {
	const snapshots = new Map<string, BlockSnapshot>();
	const orderState = { value: 0 };
	const visibleSignatures = new Set<string>();
	const positions = buildScrollPositions(candidate, stepRatio, maxPositions);
	const originalTop = getScrollTop(doc, candidate);

	try {
		for (const top of positions) {
			setScrollTop(doc, candidate, top);
			await waitForRender(doc, settleMs);
			visibleSignatures.add(captureVisibleBlockSignature(doc));
			captureVisibleBlocks(doc, snapshots, orderState);
		}
	} finally {
		setScrollTop(doc, candidate, originalTop);
		await waitForRender(doc, 0);
	}

	return {
		snapshots,
		informative: positions.length <= 1 || visibleSignatures.size > 1,
	};
}

function createEmptyHtmlDocument(doc: Document): Document {
	const implementation = doc.implementation || doc.defaultView?.document?.implementation;
	if (implementation?.createHTMLDocument) {
		return implementation.createHTMLDocument(doc.title || '');
	}

	const DomParser = doc.defaultView?.DOMParser || DOMParser;
	return new DomParser().parseFromString(
		'<!doctype html><html><head></head><body></body></html>',
		'text/html',
	) as unknown as Document;
}

function buildSnapshotDocument(doc: Document, snapshots: Map<string, BlockSnapshot>): Document {
	const snapshot = createEmptyHtmlDocument(doc);
	snapshot.title = doc.title || '';
	snapshot.documentElement.lang = doc.documentElement.lang || '';
	const baseHref = doc.baseURI || doc.URL || '';
	if (baseHref) {
		const base = snapshot.createElement('base');
		base.setAttribute('href', baseHref);
		snapshot.head.appendChild(base);
	}

	const titleHtml = TITLE_SELECTORS
		.map(selector => doc.querySelector(selector))
		.find(Boolean)?.outerHTML || '';

	const blockHtml = Array.from(snapshots.values())
		.sort((left, right) => left.order - right.order)
		.map(snapshotBlock => snapshotBlock.outerHtml)
		.join('');

	snapshot.body.innerHTML = `${titleHtml}${blockHtml}`;
	return snapshot;
}

function buildScrollPositions(element: HTMLElement, stepRatio: number, maxPositions: number): number[] {
	const range = getScrollRange(element);
	if (range <= 0) return [0];

	const desiredStep = Math.max(1, Math.round(Math.max(160, element.clientHeight * stepRatio)));
	const segmentCount = Math.max(1, Math.ceil(range / desiredStep));
	const positionCount = Math.max(2, Math.min(maxPositions, segmentCount + 1));
	const positions: number[] = [];

	for (let index = 0; index < positionCount; index += 1) {
		const denominator = positionCount - 1;
		const top = denominator === 0 ? 0 : Math.round((range * index) / denominator);
		if (positions[positions.length - 1] !== top) {
			positions.push(top);
		}
	}

	return positions;
}

export async function createLarkSnapshotDocument(
	doc: Document,
	options: LarkSnapshotOptions = {},
): Promise<Document> {
	if (!doc.querySelector(LARK_BLOCK_SELECTOR)) {
		return doc;
	}

	const settleMs = options.settleMs ?? 80;
	const stepRatio = options.stepRatio ?? 0.6;
	const maxPositions = options.maxPositions ?? 24;
	const snapshots = new Map<string, BlockSnapshot>();
	const orderState = { value: 0 };
	const candidates = collectScrollCandidates(doc);

	if (candidates.length === 0) {
		captureVisibleBlocks(doc, snapshots, orderState);
	}

	const candidateResults: CandidateCaptureResult[] = [];
	for (const candidate of candidates) {
		candidateResults.push(await captureCandidateSnapshots(doc, candidate, settleMs, stepRatio, maxPositions));
	}

	const informativeResults = candidateResults.filter(result => result.informative && result.snapshots.size > 0);
	const resultsToMerge = informativeResults.length > 0
		? informativeResults
		: candidateResults.filter(result => result.snapshots.size > 0);

	// Merge largest-first so the most comprehensive candidate dictates block order.
	// Otherwise a partial mid-document capture can claim order slots 0..N before the
	// full top-to-bottom capture runs, scrambling the final sequence.
	const orderedResults = [...resultsToMerge].sort((left, right) => right.snapshots.size - left.snapshots.size);

	for (const result of orderedResults) {
		mergeBlockSnapshots(snapshots, result.snapshots, orderState);
	}

	return buildSnapshotDocument(doc, snapshots);
}
