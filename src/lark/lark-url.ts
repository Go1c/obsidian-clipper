const LARK_HOST_RE = /.+\.((feishu\.cn)|(larksuite\.com))$/i;
const DOCUMENT_PATH_RE = /^\/(docx|docs|wiki)\/([^/?#]+)/i;

export function isLarkDocumentUrl(rawUrl: string): boolean {
	try {
		const url = new URL(rawUrl);
		if (url.protocol !== 'https:') return false;
		if (!LARK_HOST_RE.test(url.hostname)) return false;
		return DOCUMENT_PATH_RE.test(url.pathname);
	} catch {
		return false;
	}
}

export function extractLarkDocumentId(rawUrl: string): string {
	try {
		const url = new URL(rawUrl);
		if (url.protocol !== 'https:') return '';
		if (!LARK_HOST_RE.test(url.hostname)) return '';
		const match = url.pathname.match(DOCUMENT_PATH_RE);
		return match?.[2] || '';
	} catch {
		return '';
	}
}
