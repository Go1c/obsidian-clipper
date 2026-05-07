import type { LarkAssetDescriptor } from './lark-assets';

export interface BuildLarkImportPayloadInput {
	docId: string;
	title: string;
	sourceUrl: string;
	noteFolder: string;
	assetFolder: string;
	markdown: string;
	assets: LarkAssetDescriptor[];
	fetchImpl?: typeof fetch;
}

interface LarkImportManifest {
	docId: string;
	title: string;
	sourceUrl: string;
	noteFolder: string;
	assetFolder: string;
	importMode: 'create-or-update';
	markdown: string;
	assets: LarkAssetDescriptor[];
}

const INVALID_ASSET_METADATA_MESSAGE = 'Invalid Lark asset metadata. Refresh the page and try again.';

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

function isLarkAssetDescriptor(asset: unknown): asset is LarkAssetDescriptor {
	if (!asset || typeof asset !== 'object') {
		return false;
	}

	const candidate = asset as Partial<LarkAssetDescriptor>;
	return (
		isNonEmptyString(candidate.assetId)
		&& (candidate.type === 'image' || candidate.type === 'video' || candidate.type === 'attachment')
		&& isNonEmptyString(candidate.blockId)
		&& isNonEmptyString(candidate.originalUrl)
		&& isNonEmptyString(candidate.preferredName)
		&& isNonEmptyString(candidate.mimeType)
		&& isNonEmptyString(candidate.placeholder)
	);
}

function normalizeContentType(contentType: string | null, fallbackType: string): string {
	const normalizedType = contentType?.split(';', 1)[0]?.trim();
	return normalizedType || fallbackType;
}

function hasKnownExtension(filename: string): boolean {
	return /\.[a-z0-9]{1,8}$/i.test(filename);
}

function extensionForContentType(contentType: string): string {
	switch (contentType.toLowerCase()) {
		case 'image/jpeg':
			return '.jpg';
		case 'image/png':
			return '.png';
		case 'image/gif':
			return '.gif';
		case 'image/webp':
			return '.webp';
		case 'image/svg+xml':
			return '.svg';
		case 'video/mp4':
			return '.mp4';
		case 'video/webm':
			return '.webm';
		case 'video/quicktime':
			return '.mov';
		case 'video/x-msvideo':
			return '.avi';
		case 'application/pdf':
			return '.pdf';
		case 'application/zip':
			return '.zip';
		case 'text/plain':
			return '.txt';
		default:
			return '';
	}
}

function normalizePreferredName(asset: LarkAssetDescriptor, contentType: string): string {
	if (hasKnownExtension(asset.preferredName)) {
		return asset.preferredName;
	}

	const extension = extensionForContentType(contentType);
	return extension ? `${asset.preferredName}${extension}` : asset.preferredName;
}

function buildManifest(input: BuildLarkImportPayloadInput): LarkImportManifest {
	return {
		docId: input.docId,
		title: input.title,
		sourceUrl: input.sourceUrl,
		noteFolder: input.noteFolder,
		assetFolder: input.assetFolder,
		importMode: 'create-or-update',
		markdown: input.markdown,
		assets: input.assets,
	};
}

export function parseLarkAssets(serializedAssets: string | undefined): LarkAssetDescriptor[] {
	if (!serializedAssets) {
		return [];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(serializedAssets);
	} catch {
		throw new Error(INVALID_ASSET_METADATA_MESSAGE);
	}

	if (!Array.isArray(parsed) || !parsed.every(isLarkAssetDescriptor)) {
		throw new Error(INVALID_ASSET_METADATA_MESSAGE);
	}

	return parsed;
}

export async function buildLarkImportPayload(input: BuildLarkImportPayloadInput): Promise<FormData> {
	const fetchImpl = input.fetchImpl ?? fetch;
	const downloads = await Promise.all(input.assets.map(async asset => {
		const response = await fetchImpl(asset.originalUrl, {
			credentials: 'include',
		});

		if (!response.ok) {
			throw new Error(`Failed to download Lark asset "${asset.preferredName}" (${response.status}).`);
		}

		return {
			asset: {
				...asset,
				mimeType: normalizeContentType(response.headers.get('content-type'), asset.mimeType),
			},
			buffer: await response.arrayBuffer(),
		};
	}));

	const resolvedAssets = downloads.map(download => ({
		...download.asset,
		preferredName: normalizePreferredName(download.asset, download.asset.mimeType),
	}));
	const manifest = buildManifest({
		...input,
		assets: resolvedAssets,
	});
	const formData = new FormData();
	formData.append('manifest', JSON.stringify(manifest));

	for (const [index, download] of downloads.entries()) {
		const resolvedAsset = resolvedAssets[index];
		formData.append(
			'file',
			new Blob([download.buffer], { type: resolvedAsset.mimeType }),
			`${resolvedAsset.assetId}__${resolvedAsset.preferredName}`,
		);
	}

	return formData;
}
