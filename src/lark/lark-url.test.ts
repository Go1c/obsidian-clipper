import { describe, expect, test } from 'vitest';
import { extractLarkDocumentId, isLarkDocumentUrl } from './lark-url';

describe('isLarkDocumentUrl', () => {
	test.each([
		'https://example.feishu.cn/docx/ABCDEF123456',
		'https://example.feishu.cn/docs/doccnExampleToken',
		'https://example.feishu.cn/wiki/wikcnExampleToken',
		'https://example.larksuite.com/docx/ABCDEF123456',
	])('matches supported document URL %s', (url) => {
		expect(isLarkDocumentUrl(url)).toBe(true);
	});

	test.each([
		'https://example.feishu.cn/messenger/',
		'https://open.feishu.cn/document/home/',
		'https://feishu.cn/docx/ABCDEF123456',
		'https://larksuite.com/docx/ABCDEF123456',
		'https://obsidian.md/',
		'http://example.feishu.cn/docx/ABCDEF123456',
		'ftp://example.feishu.cn/docx/ABCDEF123456',
		'not a url',
	])('rejects non-document URL %s', (url) => {
		expect(isLarkDocumentUrl(url)).toBe(false);
	});
});

describe('extractLarkDocumentId', () => {
	test.each([
		['https://example.feishu.cn/docx/ABCDEF123456?from=from_copylink', 'ABCDEF123456'],
		['https://example.feishu.cn/docs/doccnExampleToken', 'doccnExampleToken'],
		['https://example.feishu.cn/wiki/wikcnExampleToken', 'wikcnExampleToken'],
	])('extracts ID from %s', (url, expected) => {
		expect(extractLarkDocumentId(url)).toBe(expected);
	});

	test('returns empty string for unsupported URLs', () => {
		expect(extractLarkDocumentId('https://obsidian.md/')).toBe('');
		expect(extractLarkDocumentId('http://example.feishu.cn/docx/ABCDEF123456')).toBe('');
		expect(extractLarkDocumentId('https://feishu.cn/docx/ABCDEF123456')).toBe('');
	});
});
