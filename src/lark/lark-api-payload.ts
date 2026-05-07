import type { LarkAssetDescriptor } from './lark-assets';

interface BuildApiPayloadInput {
	docId: string;
	title: string;
	sourceUrl: string;
	noteFolder: string;
	assetFolder: string;
	markdown: string;
	assets: LarkAssetDescriptor[];
	files: Map<string, ArrayBuffer>;
}

export function buildLarkApiImportPayload(input: BuildApiPayloadInput): FormData {
	const manifest = {
		docId: input.docId,
		title: input.title,
		sourceUrl: input.sourceUrl,
		noteFolder: input.noteFolder,
		assetFolder: input.assetFolder,
		importMode: 'create-or-update' as const,
		markdown: input.markdown,
		assets: input.assets,
	};

	const formData = new FormData();
	formData.append('manifest', JSON.stringify(manifest));

	for (const asset of input.assets) {
		const fileKey = `${asset.assetId}__${asset.preferredName}`;
		const buffer = input.files.get(fileKey);
		if (!buffer) {
			throw new Error(`Lark API import: missing file blob for ${fileKey}`);
		}
		formData.append('file', new Blob([buffer], { type: asset.mimeType }), fileKey);
	}

	return formData;
}
