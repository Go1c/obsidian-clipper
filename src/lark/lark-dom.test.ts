import { describe, expect, test } from 'vitest';
import { parseHTML } from 'linkedom';
import { extractLarkPage } from './lark-dom';

function parse(html: string): Document {
	const { document } = parseHTML(html);
	return document as unknown as Document;
}

describe('extractLarkPage', () => {
	test('extracts title and text blocks from common document markup', () => {
		const doc = parse(`
			<html>
				<head><title>Fallback Title</title></head>
				<body>
					<h1 data-testid="doc-title">Project Plan</h1>
					<div data-block-id="a">First paragraph</div>
					<div data-block-id="b">Second paragraph</div>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/docx/ABC123');

		expect(result.title).toBe('Project Plan');
		expect(result.contentHtml).toBe('<p>First paragraph</p>\n<p>Second paragraph</p>');
		expect(result.hasDocumentBlocks).toBe(true);
		expect(result.plainText).toBe('First paragraph\nSecond paragraph');
		expect(result.extractedContent.larkDocumentId).toBe('ABC123');
		expect(result.extractedContent.larkSourceUrl).toBe('https://team.feishu.cn/docx/ABC123');
	});

	test('falls back to document title and main text', () => {
		const doc = parse(`
			<html>
				<head><title>Fallback Title</title></head>
				<body>
					<nav>Page chrome</nav>
					<main>Only visible body text</main>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/docx/ABC123');

		expect(result.title).toBe('Fallback Title');
		expect(result.contentHtml).toBe('<p>Only visible body text</p>');
		expect(result.hasDocumentBlocks).toBe(false);
	});

	test('prefers the cleaned browser title when the visible page title is generic chrome', () => {
		const doc = parse(`
			<html>
				<head><title>‌​﻿⁤⁣Claude Desktop  免登录 支持任意模型 安装说明 - 飞书云文档</title></head>
				<body>
					<h1 data-testid="doc-title">飞书云文档</h1>
					<div data-block-id="step-1">1. 初次安装需要 VPN 开启全局 + TUN 模式</div>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/wiki/UTCWwfyCiiXumGkBgGOchuLpnqc');

		expect(result.title).toBe('Claude Desktop 免登录 支持任意模型 安装说明');
	});

	test('preserves repeated text in different blocks', () => {
		const doc = parse(`
			<html>
				<body>
					<h1>Checklist</h1>
					<div data-block-id="a">Repeat me</div>
					<div data-block-id="b">Repeat me</div>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/docx/ABC123');

		expect(result.contentHtml).toBe('<p>Repeat me</p>\n<p>Repeat me</p>');
	});

	test('merges mixed block selector families in document order', () => {
		const doc = parse(`
			<html>
				<body>
					<h1>Mixed Blocks</h1>
					<div data-block-id="a">First block</div>
					<div class="doc-block">Second block</div>
					<div class="text-block">Third block</div>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/docx/ABC123');

		expect(result.contentHtml).toBe('<p>First block</p>\n<p>Second block</p>\n<p>Third block</p>');
	});

	test('ignores hidden document blocks', () => {
		const doc = parse(`
			<html>
				<body>
					<h1>Hidden Blocks</h1>
					<div data-block-id="a">Visible block</div>
					<div data-block-id="b" hidden>Hidden block</div>
					<div data-block-id="c" aria-hidden="true">Aria hidden block</div>
					<div data-block-id="d" style="display: none">Display none block</div>
					<div data-block-id="e" style="visibility: hidden">Visibility hidden block</div>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/docx/ABC123');

		expect(result.contentHtml).toBe('<p>Visible block</p>');
	});

	test('deduplicates mirrored elements with the same block id', () => {
		const doc = parse(`
			<html>
				<body>
					<h1>Mirrored</h1>
					<div data-block-id="a">Single block</div>
					<div data-block-id="a">Single block</div>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/docx/ABC123');

		expect(result.contentHtml).toBe('<p>Single block</p>');
	});

	test('keeps later nonblank mirror for the same block id', () => {
		const doc = parse(`
			<html>
				<body>
					<h1>Mirrored</h1>
					<div data-block-id="a">   </div>
					<div data-block-id="a">Recovered block</div>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/docx/ABC123');

		expect(result.contentHtml).toBe('<p>Recovered block</p>');
	});

	test('keeps richest text when same block id has conflicting mirrors', () => {
		const doc = parse(`
			<html>
				<body>
					<h1>Mirrored</h1>
					<div data-block-id="a">Short</div>
					<div data-block-id="a">Longer recovered block</div>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/docx/ABC123');

		expect(result.contentHtml).toBe('<p>Longer recovered block</p>');
	});

	test('escapes HTML and falls back when document title is blank', () => {
		const doc = parse(`
			<html>
				<head><title>   </title></head>
				<body><main>Use &lt;unsafe&gt; & "quoted"</main></body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/docx/ABC123');

		expect(result.title).toBe('Untitled Lark Document');
		expect(result.contentHtml).toBe('<p>Use &lt;unsafe&gt; &amp; &quot;quoted&quot;</p>');
	});

	test('uses first nonblank fallback region', () => {
		const doc = parse(`
			<html>
				<body>
					<main>   </main>
					<article>Article content</article>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/docx/ABC123');

		expect(result.contentHtml).toBe('<p>Article content</p>');
	});
	test('cleans Feishu editor chrome, dense numbered steps, and duplicate attachment text', () => {
		const doc = parse(`
			<html>
				<body>
					<h1 data-testid="doc-title">飞书云文档</h1>
					<div data-block-id="placeholder">输入“/”快速插入内容</div>
					<div data-block-id="meta">崔志强崔志强今天修改AI 速览试用</div>
					<div data-block-id="dense">
						1.初次安装需要 VPN 开启全局 + TUN 模式 节点最好选择美国 全局代理 Tun模式​2. 下载安装器 ​Claude Setup (1).exe6.67MB​3.点击启动安装​4.安装成功会有登陆界面 这里不需要登陆账号
					</div>
					<div data-block-id="attachment-card-a">Claude Setup (1).exe6.67MB</div>
					<div data-block-id="attachment-card-b">Claude Setup (1).exe6.67MB</div>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/wiki/UTCWwfyCiiXumGkBgGOchuLpnqc');

		expect(result.plainText).not.toContain('输入“/”快速插入内容');
		expect(result.plainText).not.toContain('AI 速览');
		expect(result.plainText).not.toContain('今天修改');
		expect(result.plainText).not.toContain('崔志强崔志强');
		expect(result.plainText).toContain('1.初次安装需要 VPN 开启全局 + TUN 模式');
		expect(result.plainText).toContain('2. 下载安装器');
		expect(result.plainText).toContain('3.点击启动安装');
		expect(result.plainText).toContain('4.安装成功会有登陆界面 这里不需要登陆账号');
		expect(result.plainText.split('\n').length).toBeGreaterThanOrEqual(4);
		expect(result.plainText.match(/Claude Setup \(1\)\.exe6\.67MB/g)).toHaveLength(1);
	});

	test('removes inline Feishu chrome and deduplicates repeated numbered steps', () => {
		const doc = parse(`
			<html>
				<body>
					<h1 data-testid="doc-title">飞书云文档</h1>
					<div data-block-id="header">输入“/”快速插入内容添加图标添加封面Claude Desktop 免登录 支持任意模型 安装说明 崔志强今天修改</div>
					<div data-block-id="dense">
						1.初次安装需要 VPN 开启全局 + TUN 模式 节点最好选择美国 全局代理 Tun模式 2. 下载安装器 Claude Setup (1).exe6.67MB 3.点击启动安装 4.安装成功会有登陆界面 这里不需要登陆账号 5.开启 Develop Mode 6.点击 Configure Third-Party
					</div>
					<div data-block-id="step-1">1.初次安装需要 VPN 开启全局 + TUN 模式 节点最好选择美国 全局代理 Tun模式</div>
					<div data-block-id="step-2">2. 下载安装器</div>
					<div data-block-id="step-3">3.点击启动安装</div>
					<div data-block-id="step-4">4.安装成功会有登陆界面 这里不需要登陆账号</div>
					<div data-block-id="step-5">5.开启 Develop Mode</div>
					<div data-block-id="step-6">6.点击 Configure Third-Party</div>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/wiki/UTCWwfyCiiXumGkBgGOchuLpnqc');

		expect(result.plainText).toContain('Claude Desktop 免登录 支持任意模型 安装说明');
		expect(result.plainText).not.toContain('输入“/”快速插入内容');
		expect(result.plainText).not.toContain('添加图标');
		expect(result.plainText).not.toContain('添加封面');
		expect(result.plainText).not.toContain('崔志强今天修改');
		expect(result.plainText.match(/1\.初次安装需要 VPN 开启全局 \+ TUN 模式/g)).toHaveLength(1);
		expect(result.plainText.match(/2\. 下载安装器/g)).toHaveLength(1);
		expect(result.plainText.match(/3\.点击启动安装/g)).toHaveLength(1);
		expect(result.plainText.match(/4\.安装成功会有登陆界面 这里不需要登陆账号/g)).toHaveLength(1);
		expect(result.plainText.match(/5\.开启 Develop Mode/g)).toHaveLength(1);
		expect(result.plainText.match(/6\.点击 Configure Third-Party/g)).toHaveLength(1);
		expect(result.plainText.match(/Claude Setup \(1\)\.exe6\.67MB/g)).toHaveLength(1);
	});

	test('removes Feishu reference status footer', () => {
		const doc = parse(`
			<html>
				<body>
					<h1 data-testid="doc-title">飞书云文档</h1>
					<div data-block-id="title">Claude Desktop 免登录 支持任意模型 安装说明</div>
					<div data-block-id="step-1">1.初次安装需要 VPN 开启全局 + TUN 模式</div>
					<div data-block-id="footer">本文暂未被其它文档引用</div>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/wiki/UTCWwfyCiiXumGkBgGOchuLpnqc');

		expect(result.plainText).toContain('Claude Desktop 免登录 支持任意模型 安装说明');
		expect(result.plainText).toContain('1.初次安装需要 VPN 开启全局 + TUN 模式');
		expect(result.plainText).not.toContain('本文暂未被其它文档引用');
	});

	test('renders consecutive numbered steps as ordered list html', () => {
		const doc = parse(`
			<html>
				<body>
					<h1 data-testid="doc-title">飞书云文档</h1>
					<div data-block-id="title">Claude Desktop 免登录 支持任意模型 安装说明</div>
					<div data-block-id="step-1">1.初次安装需要 VPN 开启全局 + TUN 模式</div>
					<div data-block-id="step-2">2. 下载安装器 Claude Setup (1).exe6.67MB</div>
					<div data-block-id="step-3">3.点击启动安装</div>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/wiki/UTCWwfyCiiXumGkBgGOchuLpnqc');

		expect(result.contentHtml).toContain('<ol>');
		expect(result.contentHtml).toContain('<li>初次安装需要 VPN 开启全局 + TUN 模式</li>');
		expect(result.contentHtml).toContain('<li>下载安装器 Claude Setup (1).exe6.67MB</li>');
		expect(result.contentHtml).not.toContain('<p>1.初次安装需要 VPN 开启全局 + TUN 模式</p>');
		expect(result.contentHtml).not.toContain('<p>2. 下载安装器 Claude Setup (1).exe6.67MB</p>');
	});

	test('preserves normal text blocks that contain inline hyperlinks', () => {
		const doc = parse(`
			<html>
				<body>
					<h1 data-testid="doc-title">Inline Link Doc</h1>
					<div data-block-id="paragraph">
						Read the <a href="https://example.com/guide">setup guide</a> before continuing.
					</div>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/docx/ABC123');

		expect(result.assets).toEqual([]);
		expect(result.contentHtml).toBe('<p>Read the setup guide before continuing.</p>');
		expect(result.plainText).toBe('Read the setup guide before continuing.');
	});

	test('preserves prose paragraphs that mention filename-like links and file sizes inline', () => {
		const doc = parse(`
			<html>
				<body>
					<h1 data-testid="doc-title">Inline File Mention Doc</h1>
					<div data-block-id="paragraph">
						Please review <a href="https://example.com/files/Quarterly_Report.pdf">Quarterly_Report.pdf</a>
						and send comments before the 12 MB upload is archived tomorrow.
					</div>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/docx/ABC123');

		expect(result.assets).toEqual([]);
		expect(result.contentHtml).toBe('<p>Please review Quarterly_Report.pdf and send comments before the 12 MB upload is archived tomorrow.</p>');
		expect(result.plainText).toBe('Please review Quarterly_Report.pdf and send comments before the 12 MB upload is archived tomorrow.');
	});

	test('renders asset placeholders in document order alongside ordered lists', () => {
		const doc = parse(`
			<html>
				<body>
					<h1 data-testid="doc-title">飞书云文档</h1>
					<div data-block-id="intro">Install flow</div>
					<div data-block-id="step-1">1. Download the installer</div>
					<div data-block-id="image-block">
						<img src="https://example.com/installer.png" alt="Installer screenshot" />
					</div>
					<div data-block-id="step-2">2. Open the installer</div>
					<div data-block-id="attachment-block">
						<a href="https://example.com/installer.zip">installer.zip</a>
					</div>
					<div data-block-id="closing">Done</div>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/wiki/UTCWwfyCiiXumGkBgGOchuLpnqc');

		expect(result.assets).toEqual([
			{
				assetId: 'asset-001',
				type: 'image',
				blockId: 'image-block',
				originalUrl: 'https://example.com/installer.png',
				preferredName: 'installer.png',
				mimeType: 'image/png',
				placeholder: '__LARK_ASSET_asset-001__',
			},
			{
				assetId: 'asset-002',
				type: 'attachment',
				blockId: 'attachment-block',
				originalUrl: 'https://example.com/installer.zip',
				preferredName: 'installer.zip',
				mimeType: 'application/zip',
				placeholder: '__LARK_ASSET_asset-002__',
			},
		]);
		expect(result.contentHtml).toBe(
			'<p>Install flow</p>\n'
			+ '<ol><li>Download the installer</li></ol>\n'
			+ '<p>__LARK_ASSET_asset-001__</p>\n'
			+ '<ol start="2"><li>Open the installer</li></ol>\n'
			+ '<p>__LARK_ASSET_asset-002__</p>\n'
			+ '<p>Done</p>',
		);
	});

	test('ignores nested OCR text blocks inside image asset containers', () => {
		const doc = parse(`
			<html>
				<body>
					<h1 data-testid="doc-title">飞书云文档</h1>
					<div data-block-id="step-7">7. 配置公司的URL 和 API Key 然后 Apple Locally</div>
					<div data-block-id="image-block">
						<div data-block-id="ocr-1">URL https://b.onerouter.com/api Key 公司为每人申请的Cladue Key</div>
						<div data-block-id="ocr-2">URL https://b.onerouter.com/api</div>
						<div data-block-id="ocr-3">Key 公司为每人申请的Cladue Key</div>
						<img src="https://example.com/step7.png" alt="Step 7 screenshot" />
					</div>
					<div data-block-id="step-8">8. 新建一个 Project 然后选择本地的目录工程</div>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/wiki/UTCWwfyCiiXumGkBgGOchuLpnqc');

		expect(result.plainText).toContain('7. 配置公司的URL 和 API Key 然后 Apple Locally');
		expect(result.plainText).toContain('8. 新建一个 Project 然后选择本地的目录工程');
		expect(result.plainText).not.toContain('URL https://b.onerouter.com/api');
		expect(result.plainText).not.toContain('Key 公司为每人申请的Cladue Key');
		expect(result.contentHtml).toContain('<p>__LARK_ASSET_asset-001__</p>');
	});

	test('ignores sibling OCR text blocks that immediately precede an image asset block', () => {
		const doc = parse(`
			<html>
				<body>
					<div class="wrapper">
						<div data-block-id="step-7">7. 配置公司的URL 和 API Key 然后 Apple Locally</div>
						<div data-block-id="ocr-1">URL https://b.onerouter.com/api Key 公司为每人申请的Cladue Key</div>
						<div data-block-id="ocr-2">URL https://b.onerouter.com/api</div>
						<div data-block-id="ocr-3">Key 公司为每人申请的Cladue Key</div>
						<div data-block-id="image-block">
							<img src="https://example.com/step7.png" alt="Step 7 screenshot" />
						</div>
						<div data-block-id="step-8">8. 新建一个 Project 然后选择本地的目录工程</div>
					</div>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/wiki/UTCWwfyCiiXumGkBgGOchuLpnqc');

		expect(result.plainText).toContain('7. 配置公司的URL 和 API Key 然后 Apple Locally');
		expect(result.plainText).toContain('8. 新建一个 Project 然后选择本地的目录工程');
		expect(result.plainText).not.toContain('URL https://b.onerouter.com/api');
		expect(result.plainText).not.toContain('Key 公司为每人申请的Cladue Key');
		expect(result.contentHtml).toContain('<p>__LARK_ASSET_asset-001__</p>');
	});

	test('strips OCR suffix text appended onto a numbered step before an image asset', () => {
		const doc = parse(`
			<html>
				<body>
					<div class="wrapper">
						<div data-block-id="step-7">
							7. 配置公司的URL 和 API Key 然后 Apple Locally （这里理论上也是支持 GPT5.5的模型 可以试试） URL https://b.onerouter.com/api Key 公司为每人申请的Cladue Key
						</div>
						<div data-block-id="image-block">
							<img src="https://example.com/step7.png" alt="Step 7 screenshot" />
						</div>
					</div>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/wiki/UTCWwfyCiiXumGkBgGOchuLpnqc');

		expect(result.plainText).toContain('7. 配置公司的URL 和 API Key 然后 Apple Locally （这里理论上也是支持 GPT5.5的模型 可以试试）');
		expect(result.plainText).not.toContain('URL https://b.onerouter.com/api Key 公司为每人申请的Cladue Key');
	});

	test('skips cover image and icon blocks that appear before the document title', () => {
		const doc = parse(`
			<html>
				<body>
					<div data-block-id="cover-img">
						<img src="https://example.com/cover-avatar.jpg" alt="Cover" />
					</div>
					<div data-block-id="icon-emoji">📘</div>
					<h1 data-testid="doc-title">Real Doc Title</h1>
					<div data-block-id="step-1">1. First real step</div>
					<div data-block-id="step-2">2. Second real step</div>
				</body>
			</html>
		`);

		const result = extractLarkPage(doc, 'https://team.feishu.cn/wiki/ABC123');

		expect(result.title).toBe('Real Doc Title');
		expect(result.plainText).toBe('1. First real step\n2. Second real step');
		expect(result.assets).toEqual([]);
	});
});

