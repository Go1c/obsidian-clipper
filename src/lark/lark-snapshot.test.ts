import { describe, expect, test } from 'vitest';
import { parseHTML } from 'linkedom';
import { extractLarkPage } from './lark-dom';
import { createLarkSnapshotDocument } from './lark-snapshot';

function parse(html: string): { document: Document; window: Window & typeof globalThis } {
	const { document, window } = parseHTML(html);
	Object.defineProperty(document, 'defaultView', {
		configurable: true,
		value: window,
	});
	return {
		document: document as unknown as Document,
		window: window as unknown as Window & typeof globalThis,
	};
}

function installVirtualizedBlocks(
	doc: Document,
	scrollRoot: HTMLElement,
	blockTexts: string[],
	initialIndex = 1,
): void {
	const blockHeight = 100;
	const viewportBlocks = 4;
	const maxStart = Math.max(0, blockTexts.length - viewportBlocks);
	let currentTop = Math.min(initialIndex, maxStart) * blockHeight;

	const render = () => {
		const start = Math.min(maxStart, Math.max(0, Math.floor(currentTop / blockHeight)));
		scrollRoot.innerHTML = blockTexts
			.slice(start, start + viewportBlocks)
			.map((text, offset) => `<div data-block-id="step-${start + offset + 1}">${text}</div>`)
			.join('');
	};

	Object.defineProperty(scrollRoot, 'clientHeight', {
		configurable: true,
		value: viewportBlocks * blockHeight,
	});
	Object.defineProperty(scrollRoot, 'scrollHeight', {
		configurable: true,
		value: blockTexts.length * blockHeight,
	});
	Object.defineProperty(scrollRoot, 'scrollTop', {
		configurable: true,
		get: () => currentTop,
		set: (value: number) => {
			currentTop = value;
			render();
		},
	});

	(scrollRoot as HTMLElement & {
		scrollTo: (options: number | { top?: number }) => void;
	}).scrollTo = (options: number | { top?: number }) => {
		currentTop = typeof options === 'number' ? options : options.top ?? currentTop;
		render();
	};

	Object.defineProperty(doc, 'scrollingElement', {
		configurable: true,
		value: scrollRoot,
	});

	render();
}

function installVariantVirtualizedBlocks(
	doc: Document,
	scrollRoot: HTMLElement,
	renderForStart: (start: number) => string,
	blockCount: number,
	initialIndex = 0,
): void {
	const blockHeight = 100;
	const viewportBlocks = 4;
	const maxStart = Math.max(0, blockCount - viewportBlocks);
	let currentTop = Math.min(initialIndex, maxStart) * blockHeight;

	const render = () => {
		const start = Math.min(maxStart, Math.max(0, Math.floor(currentTop / blockHeight)));
		scrollRoot.innerHTML = renderForStart(start);
	};

	Object.defineProperty(scrollRoot, 'clientHeight', {
		configurable: true,
		value: viewportBlocks * blockHeight,
	});
	Object.defineProperty(scrollRoot, 'scrollHeight', {
		configurable: true,
		value: blockCount * blockHeight,
	});
	Object.defineProperty(scrollRoot, 'scrollTop', {
		configurable: true,
		get: () => currentTop,
		set: (value: number) => {
			currentTop = value;
			render();
		},
	});

	(scrollRoot as HTMLElement & {
		scrollTo: (options: number | { top?: number }) => void;
	}).scrollTo = (options: number | { top?: number }) => {
		currentTop = typeof options === 'number' ? options : options.top ?? currentTop;
		render();
	};

	Object.defineProperty(doc, 'scrollingElement', {
		configurable: true,
		value: scrollRoot,
	});

	render();
}

function installNestedVirtualizedBlocks(
	doc: Document,
	outerScrollRoot: HTMLElement,
	innerScrollRoot: HTMLElement,
	blockTexts: string[],
	initialIndex = 4,
	initialHtml?: string,
): void {
	const blockHeight = 100;
	const viewportBlocks = 4;
	const maxStart = Math.max(0, blockTexts.length - viewportBlocks);
	let currentTop = Math.min(initialIndex, maxStart) * blockHeight;
	let innerTop = 0;

	const renderClean = () => {
		const start = Math.min(maxStart, Math.max(0, Math.floor(currentTop / blockHeight)));
		innerScrollRoot.innerHTML = blockTexts
			.slice(start, start + viewportBlocks)
			.map((text, offset) => `<div data-block-id="step-${start + offset + 1}">${text}</div>`)
			.join('');
	};

	Object.defineProperty(outerScrollRoot, 'clientHeight', {
		configurable: true,
		value: viewportBlocks * blockHeight,
	});
	Object.defineProperty(outerScrollRoot, 'scrollHeight', {
		configurable: true,
		value: blockTexts.length * blockHeight,
	});
	Object.defineProperty(outerScrollRoot, 'scrollTop', {
		configurable: true,
		get: () => currentTop,
		set: (value: number) => {
			currentTop = value;
			renderClean();
		},
	});

	(outerScrollRoot as HTMLElement & {
		scrollTo: (options: number | { top?: number }) => void;
	}).scrollTo = (options: number | { top?: number }) => {
		currentTop = typeof options === 'number' ? options : options.top ?? currentTop;
		renderClean();
	};

	Object.defineProperty(innerScrollRoot, 'clientHeight', {
		configurable: true,
		value: viewportBlocks * blockHeight,
	});
	Object.defineProperty(innerScrollRoot, 'scrollHeight', {
		configurable: true,
		value: blockTexts.length * blockHeight,
	});
	Object.defineProperty(innerScrollRoot, 'scrollTop', {
		configurable: true,
		get: () => innerTop,
		set: (value: number) => {
			innerTop = value;
		},
	});

	(innerScrollRoot as HTMLElement & {
		scrollTo: (options: number | { top?: number }) => void;
	}).scrollTo = (options: number | { top?: number }) => {
		innerTop = typeof options === 'number' ? options : options.top ?? innerTop;
	};

	Object.defineProperty(doc, 'scrollingElement', {
		configurable: true,
		value: outerScrollRoot,
	});

	if (initialHtml) {
		innerScrollRoot.innerHTML = initialHtml;
	} else {
		renderClean();
	}
}

describe('createLarkSnapshotDocument', () => {
	test('preserves the source base URI in the snapshot document', async () => {
		const { document } = parse(`
			<html>
				<head>
					<base href="https://example.feishu.cn/wiki/wikcnExampleToken" />
				</head>
				<body>
					<div data-block-id="image-block">
						<img src="api" data-src="/space/api/box/stream/download/asynccode/?code=step-6" />
					</div>
				</body>
			</html>
		`);

		const snapshot = await createLarkSnapshotDocument(document, { settleMs: 0 });

		expect(snapshot.querySelector('base')?.getAttribute('href')).toBe(
			'https://example.feishu.cn/wiki/wikcnExampleToken',
		);
	});

	test('collects all numbered steps from a virtualized Lark document', async () => {
		const { document, window } = parse(`
			<html>
				<head><title>示例工具本地导入安装说明 - 飞书云文档</title></head>
				<body>
					<h1 data-testid="doc-title">飞书云文档</h1>
					<div id="scroll-root"></div>
				</body>
			</html>
		`);
		const scrollRoot = document.getElementById('scroll-root') as HTMLElement;
		const steps = [
			'1. 初次安装需要打开示例配置',
			'2. 下载安装器',
			'3. 点击启动安装',
			'4. 安装成功后会出现示例设置界面',
			'5. 开启示例模式',
			'6. 点击配置第三方服务',
			'7. 配置公司的URL 和 API Key',
			'8. 新建一个项目然后选择本地目录',
		];

		window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		}) as typeof window.requestAnimationFrame;
		installVirtualizedBlocks(document, scrollRoot, steps, 1);

		const partial = extractLarkPage(document, 'https://example.feishu.cn/wiki/wikcnExampleToken');
		expect(partial.plainText).toContain('2. 下载安装器');
		expect(partial.plainText).toContain('5. 开启示例模式');
		expect(partial.plainText).not.toContain('1. 初次安装需要打开示例配置');
		expect(partial.plainText).not.toContain('8. 新建一个项目然后选择本地目录');

		const snapshot = await createLarkSnapshotDocument(document, { settleMs: 0 });
		const result = extractLarkPage(snapshot, 'https://example.feishu.cn/wiki/wikcnExampleToken');

		expect(result.title).toBe('示例工具本地导入安装说明');
		expect(result.plainText).toContain('1. 初次安装需要打开示例配置');
		expect(result.plainText).toContain('5. 开启示例模式');
		expect(result.plainText).toContain('8. 新建一个项目然后选择本地目录');
		expect(result.contentHtml).toContain('<li>初次安装需要打开示例配置</li>');
		expect(result.contentHtml).toContain('<li>点击配置第三方服务</li>');
		expect(result.contentHtml).toContain('<li>新建一个项目然后选择本地目录</li>');
	});

	test('orders blocks from the top of the document rather than the current viewport', async () => {
		const { document, window } = parse(`
			<html>
				<head><title>示例工具本地导入安装说明 - 飞书云文档</title></head>
				<body>
					<h1 data-testid="doc-title">飞书云文档</h1>
					<div id="scroll-root"></div>
				</body>
			</html>
		`);
		const scrollRoot = document.getElementById('scroll-root') as HTMLElement;
		const steps = [
			'1. 初次安装需要打开示例配置',
			'2. 下载安装器',
			'3. 点击启动安装',
			'4. 安装成功后会出现示例设置界面',
			'5. 开启示例模式',
			'6. 点击配置第三方服务',
			'7. 配置公司的URL 和 API Key',
			'8. 新建一个项目然后选择本地目录',
		];

		window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		}) as typeof window.requestAnimationFrame;
		installVirtualizedBlocks(document, scrollRoot, steps, 4);

		const snapshot = await createLarkSnapshotDocument(document, { settleMs: 0 });
		const result = extractLarkPage(snapshot, 'https://example.feishu.cn/wiki/wikcnExampleToken');

		const lines = result.plainText.split('\n');
		expect(lines.slice(0, 4)).toEqual([
			'1. 初次安装需要打开示例配置',
			'2. 下载安装器',
			'3. 点击启动安装',
			'4. 安装成功后会出现示例设置界面',
		]);
	});

	test('prefers cleaner block variants over OCR-polluted mirrors seen at other scroll positions', async () => {
		const { document, window } = parse(`
			<html>
				<head><title>示例工具本地导入安装说明 - 飞书云文档</title></head>
				<body>
					<h1 data-testid="doc-title">飞书云文档</h1>
					<div id="scroll-root"></div>
				</body>
			</html>
		`);
		const scrollRoot = document.getElementById('scroll-root') as HTMLElement;

		window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		}) as typeof window.requestAnimationFrame;

		installVariantVirtualizedBlocks(
			document,
			scrollRoot,
			start => {
				if (start === 3) {
					return [
						'<div data-block-id="step-4">4. 安装成功后会出现示例设置界面</div>',
						'<div data-block-id="step-5">5. 开启示例模式</div>',
						'<div data-block-id="step-6">6. 点击配置第三方服务</div>',
						'<div data-block-id="step-7">7. 配置示例 URL 和 API Key 后保存到本地 URL https://example.invalid/api Key 示例占位文本</div>',
					].join('');
				}

				if (start === 4) {
					return [
						'<div data-block-id="step-5">5. 开启示例模式</div>',
						'<div data-block-id="step-6">6. 点击配置第三方服务</div>',
						'<div data-block-id="step-7">7. 配置示例 URL 和 API Key 后保存到本地</div>',
						'<div data-block-id="step-8">8. 新建一个项目然后选择本地目录</div>',
					].join('');
				}

				const blocks = [
					'1. 初次安装需要打开示例配置',
					'2. 下载安装器',
					'3. 点击启动安装',
					'4. 安装成功后会出现示例设置界面',
					'5. 开启示例模式',
					'6. 点击配置第三方服务',
					'7. 配置示例 URL 和 API Key 后保存到本地',
					'8. 新建一个项目然后选择本地目录',
				];
				return blocks
					.slice(start, start + 4)
					.map((text, offset) => `<div data-block-id="step-${start + offset + 1}">${text}</div>`)
					.join('');
			},
			8,
			3,
		);

		const snapshot = await createLarkSnapshotDocument(document, { settleMs: 0 });
		const result = extractLarkPage(snapshot, 'https://example.feishu.cn/wiki/wikcnExampleToken');

		expect(result.plainText).toContain('7. 配置示例 URL 和 API Key 后保存到本地');
		expect(result.plainText).not.toContain('URL https://example.invalid/api Key 示例占位文本');
	});

	test('ignores deeper scroll containers that do not change the visible Lark blocks', async () => {
		const { document, window } = parse(`
			<html>
				<head><title>示例工具本地导入安装说明 - 飞书云文档</title></head>
				<body>
					<h1 data-testid="doc-title">飞书云文档</h1>
					<div id="outer-scroll">
						<div id="inner-scroll"></div>
					</div>
				</body>
			</html>
		`);
		const outerScrollRoot = document.getElementById('outer-scroll') as HTMLElement;
		const innerScrollRoot = document.getElementById('inner-scroll') as HTMLElement;
		const steps = [
			'1. 初次安装需要打开示例配置',
			'2. 下载安装器',
			'3. 点击启动安装',
			'4. 安装成功后会出现示例设置界面',
			'5. 开启示例模式',
			'6. 点击配置第三方服务',
			'7. 配置示例 URL 和 API Key 后保存到本地 （这里是示例说明文字，可以忽略）',
			'8. 新建一个项目然后选择本地目录',
		];

		window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		}) as typeof window.requestAnimationFrame;

		installNestedVirtualizedBlocks(
			document,
			outerScrollRoot,
			innerScrollRoot,
			steps,
			4,
			[
				'<div data-block-id="title-block">示例工具本地导入安装说明 Example Installer.exe6.67MB</div>',
				'<div data-block-id="step-6">6. 点击配置第三方服务</div>',
				'<div data-block-id="step-7">7. 配置示例 URL 和 API Key 后保存到本地 （这里是示例说明文字，可以忽略） URL https://example.invalid/api Key 示例占位文本</div>',
				'<div data-block-id="step-8">8. 初次安装需要打开示例配置并完成本地设置</div>',
			].join(''),
		);

		const snapshot = await createLarkSnapshotDocument(document, { settleMs: 0 });
		const result = extractLarkPage(snapshot, 'https://example.feishu.cn/wiki/wikcnExampleToken');
		const lines = result.plainText.split('\n');

		expect(lines.slice(0, 4)).toEqual([
			'1. 初次安装需要打开示例配置',
			'2. 下载安装器',
			'3. 点击启动安装',
			'4. 安装成功后会出现示例设置界面',
		]);
		expect(result.plainText).toContain('7. 配置示例 URL 和 API Key 后保存到本地 （这里是示例说明文字，可以忽略）');
		expect(result.plainText).toContain('8. 新建一个项目然后选择本地目录');
		expect(result.plainText).not.toContain('Example Installer.exe6.67MB');
		expect(result.plainText).not.toContain('URL https://example.invalid/api Key 示例占位文本');
		expect(result.plainText).not.toContain('8. 初次安装需要打开示例配置并完成本地设置');
	});
});
