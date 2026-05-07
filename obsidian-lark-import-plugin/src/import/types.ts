export type LarkImportAssetType = 'image' | 'attachment' | 'video';

export interface LarkImportAsset {
	assetId: string;
	type: LarkImportAssetType;
	preferredName: string;
	mimeType: string;
	placeholder: string;
	originalUrl: string;
}

export interface LarkImportManifest {
	docId: string;
	title: string;
	sourceUrl: string;
	noteFolder: string;
	assetFolder: string;
	importMode: string;
	markdown: string;
	assets: LarkImportAsset[];
}

export interface LarkImportResult {
	notePath: string;
	assetPaths: string[];
	markdown: string;
}

export interface LarkImportVaultAdapter {
	exists(path: string): Promise<boolean>;
	mkdir(path: string): Promise<void>;
	write(path: string, data: string): Promise<void>;
	writeBinary(path: string, data: ArrayBuffer): Promise<void>;
}
