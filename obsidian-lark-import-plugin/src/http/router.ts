import type { LarkImportAsset, LarkImportManifest, LarkImportVaultAdapter } from '../import/types';
import { writeLarkImport } from '../import/write-lark-import';

export interface IncomingHttpRequest {
	method: string;
	url: string;
	headers: Record<string, string | undefined>;
	body?: Buffer;
	readBody?: () => Promise<Buffer>;
}

export interface RouterContext {
	apiKey: string;
	version: string;
	vaultName: string;
	vault?: LarkImportVaultAdapter;
}

export interface RouterResponse {
	status: number;
	headers: Record<string, string>;
	body: Buffer;
}

function json(status: number, payload: unknown): RouterResponse {
	return {
		status,
		headers: {
			'content-type': 'application/json; charset=utf-8',
		},
		body: Buffer.from(JSON.stringify(payload)),
	};
}

class InvalidImportRequestError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InvalidImportRequestError';
	}
}

interface ParsedMultipartImport {
	manifest: LarkImportManifest;
	files: Map<string, Buffer>;
}

const HEADER_SEPARATOR = Buffer.from('\r\n\r\n');
const CRLF = Buffer.from('\r\n');

function getHeader(
	headers: Record<string, string | undefined>,
	name: string,
): string | undefined {
	const expectedName = name.toLowerCase();
	return Object.entries(headers).find(([key]) => key.toLowerCase() === expectedName)?.[1];
}

async function readRequestBody(req: IncomingHttpRequest): Promise<Buffer> {
	if (req.body) {
		return req.body;
	}

	if (req.readBody) {
		return req.readBody();
	}

	return Buffer.alloc(0);
}

function getMultipartBoundary(contentType: string | undefined): string {
	const match = contentType?.match(/multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^;]+))/i);
	const boundary = match?.[1] || match?.[2];
	if (!boundary) {
		throw new InvalidImportRequestError('missing multipart boundary');
	}

	return boundary;
}

function getDispositionParam(disposition: string, name: string): string | undefined {
	const match = disposition.match(new RegExp(`${name}="([^"]*)"`, 'i'));
	return match?.[1];
}

function getAssetIdFromFilename(filename: string | undefined): string {
	if (!filename) {
		throw new InvalidImportRequestError('missing file filename');
	}

	return filename.split('__', 2)[0] || filename;
}

function parseManifest(input: string): LarkImportManifest {
	let manifest: Partial<LarkImportManifest>;
	try {
		manifest = JSON.parse(input) as Partial<LarkImportManifest>;
	} catch {
		throw new InvalidImportRequestError('invalid manifest json');
	}

	if (
		typeof manifest.docId !== 'string' ||
		typeof manifest.title !== 'string' ||
		typeof manifest.sourceUrl !== 'string' ||
		typeof manifest.noteFolder !== 'string' ||
		typeof manifest.assetFolder !== 'string' ||
		typeof manifest.importMode !== 'string' ||
		typeof manifest.markdown !== 'string' ||
		!Array.isArray(manifest.assets) ||
		!manifest.assets.every(isValidManifestAsset) ||
		hasDuplicateAssetIds(manifest.assets as LarkImportAsset[])
	) {
		throw new InvalidImportRequestError('invalid manifest');
	}

	return manifest as LarkImportManifest;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

function isValidManifestAsset(asset: unknown): asset is LarkImportAsset {
	if (!asset || typeof asset !== 'object') {
		return false;
	}

	const candidate = asset as Partial<LarkImportAsset>;
	return (
		isNonEmptyString(candidate.assetId) &&
		(candidate.type === 'image' || candidate.type === 'attachment' || candidate.type === 'video') &&
		isNonEmptyString(candidate.preferredName) &&
		isNonEmptyString(candidate.mimeType) &&
		isNonEmptyString(candidate.placeholder) &&
		isNonEmptyString(candidate.originalUrl)
	);
}

function hasDuplicateAssetIds(assets: LarkImportAsset[]): boolean {
	const assetIds = new Set<string>();
	for (const asset of assets) {
		if (assetIds.has(asset.assetId)) {
			return true;
		}
		assetIds.add(asset.assetId);
	}

	return false;
}

function indexOfValidBoundary(
	body: Buffer,
	boundaryBuffer: Buffer,
	startIndex: number,
): number {
	let searchIndex = startIndex;
	while (searchIndex < body.length) {
		const boundaryIndex = body.indexOf(boundaryBuffer, searchIndex);
		if (boundaryIndex < 0) {
			return -1;
		}

		const prefixIndex = boundaryIndex - CRLF.length;
		if (
			prefixIndex >= 0 &&
			body.subarray(prefixIndex, boundaryIndex).equals(CRLF)
		) {
			const suffixIndex = boundaryIndex + boundaryBuffer.length;
			const suffix = body.subarray(suffixIndex, suffixIndex + 2);
			if (suffix.equals(CRLF) || suffix.toString('latin1') === '--') {
				return boundaryIndex;
			}
		}

		searchIndex = boundaryIndex + boundaryBuffer.length;
	}

	return -1;
}

function parseMultipartHeaders(headerBlock: string): Record<string, string> {
	return Object.fromEntries(
		headerBlock.split('\r\n').map(line => {
			const separator = line.indexOf(':');
			if (separator < 0) {
				throw new InvalidImportRequestError('invalid multipart header');
			}

			return [
				line.slice(0, separator).trim().toLowerCase(),
				line.slice(separator + 1).trim(),
			];
		}),
	);
}

async function parseMultipartImport(req: IncomingHttpRequest): Promise<ParsedMultipartImport> {
	const boundary = getMultipartBoundary(getHeader(req.headers, 'content-type'));
	const body = await readRequestBody(req);
	const boundaryBuffer = Buffer.from(`--${boundary}`);
	const files = new Map<string, Buffer>();
	let manifest: LarkImportManifest | undefined;

	if (!body.subarray(0, boundaryBuffer.length).equals(boundaryBuffer)) {
		throw new InvalidImportRequestError('invalid multipart body');
	}

	let cursor = boundaryBuffer.length;
	while (cursor < body.length) {
		const nextMarker = body.subarray(cursor, cursor + 2).toString('latin1');
		if (nextMarker === '--') {
			return finalizeMultipartImport(manifest, files);
		}
		if (!body.subarray(cursor, cursor + CRLF.length).equals(CRLF)) {
			throw new InvalidImportRequestError('invalid multipart boundary');
		}
		cursor += CRLF.length;

		const headerEnd = body.indexOf(HEADER_SEPARATOR, cursor);
		if (headerEnd < 0) {
			throw new InvalidImportRequestError('invalid multipart section');
		}

		const headers = parseMultipartHeaders(body.toString('utf8', cursor, headerEnd));
		const disposition = headers['content-disposition'];
		if (!disposition) {
			throw new InvalidImportRequestError('missing content-disposition');
		}

		const contentStart = headerEnd + HEADER_SEPARATOR.length;
		const nextBoundaryIndex = indexOfValidBoundary(body, boundaryBuffer, contentStart);
		if (nextBoundaryIndex < 0) {
			throw new InvalidImportRequestError('invalid multipart body');
		}

		const fieldName = getDispositionParam(disposition, 'name');
		const contentBuffer = body.subarray(contentStart, nextBoundaryIndex - CRLF.length);

		if (fieldName === 'manifest') {
			manifest = parseManifest(contentBuffer.toString('utf8'));
		} else if (fieldName === 'file') {
			const filename = getDispositionParam(disposition, 'filename');
			files.set(getAssetIdFromFilename(filename), Buffer.from(contentBuffer));
		}

		cursor = nextBoundaryIndex + boundaryBuffer.length;
	}

	return finalizeMultipartImport(manifest, files);
}

function finalizeMultipartImport(
	manifest: LarkImportManifest | undefined,
	files: Map<string, Buffer>,
): ParsedMultipartImport {
	if (!manifest) {
		throw new InvalidImportRequestError('missing manifest');
	}

	return { manifest, files };
}

type GlobalAppWithVault = {
	app?: {
		vault?: {
			adapter?: LarkImportVaultAdapter;
		};
	};
};

function resolveVaultAdapter(ctx: RouterContext): LarkImportVaultAdapter | undefined {
	return ctx.vault ?? (globalThis as GlobalAppWithVault).app?.vault?.adapter;
}

export async function handleRequest(
	req: IncomingHttpRequest,
	ctx: RouterContext,
): Promise<RouterResponse> {
	if (req.method === 'GET' && req.url === '/health') {
		return json(200, { ok: true, version: ctx.version, vault: ctx.vaultName });
	}

	if (req.url === '/imports/lark') {
		const auth = req.headers.authorization || '';
		if (auth !== `Bearer ${ctx.apiKey}`) {
			return json(401, { ok: false, error: 'unauthorized' });
		}

		if (req.method === 'POST') {
			try {
				const vault = resolveVaultAdapter(ctx);
				if (!vault) {
					return json(500, { ok: false, error: 'vault_unavailable' });
				}

				const { manifest, files } = await parseMultipartImport(req);
				const result = await writeLarkImport(vault, manifest, files);
				return json(200, { ok: true, result });
			} catch (error) {
				if (error instanceof InvalidImportRequestError) {
					return json(400, { ok: false, error: error.message });
				}

				throw error;
			}
		}
	}

	return json(404, { ok: false, error: 'not_found' });
}
