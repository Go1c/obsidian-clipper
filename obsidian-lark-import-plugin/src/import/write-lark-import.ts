import { basename, dirname, parse } from 'node:path/posix';

import { buildAssetPath, buildNotePath } from './paths';
import type {
	LarkImportAsset,
	LarkImportManifest,
	LarkImportResult,
	LarkImportVaultAdapter,
} from './types';

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
	return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

async function ensureFolder(vault: LarkImportVaultAdapter, folderPath: string): Promise<void> {
	if (!folderPath || folderPath === '.') {
		return;
	}

	let currentPath = '';
	for (const part of folderPath.split('/').filter(Boolean)) {
		currentPath = currentPath ? `${currentPath}/${part}` : part;
		if (!(await vault.exists(currentPath))) {
			await vault.mkdir(currentPath);
		}
	}
}

function assetReplacement(asset: LarkImportAsset, assetPath: string): string {
	if (asset.type === 'image' || asset.type === 'video') {
		return `![[${assetPath}]]`;
	}

	return `[${basename(assetPath)}](${assetPath})`;
}

function resolveUniqueAssetPath(assetPath: string, usedAssetPaths: Set<string>): string {
	if (!usedAssetPaths.has(assetPath)) {
		usedAssetPaths.add(assetPath);
		return assetPath;
	}

	const parsedPath = parse(assetPath);
	let sequence = 2;
	while (true) {
		const candidatePath = parsedPath.dir
			? `${parsedPath.dir}/${parsedPath.name}-${sequence}${parsedPath.ext}`
			: `${parsedPath.name}-${sequence}${parsedPath.ext}`;
		if (!usedAssetPaths.has(candidatePath)) {
			usedAssetPaths.add(candidatePath);
			return candidatePath;
		}
		sequence += 1;
	}
}

export async function writeLarkImport(
	vault: LarkImportVaultAdapter,
	manifest: LarkImportManifest,
	files: Map<string, Buffer>,
): Promise<LarkImportResult> {
	const assetPaths: string[] = [];
	const usedAssetPaths = new Set<string>();
	let markdown = manifest.markdown;

	for (const asset of manifest.assets) {
		const file = files.get(asset.assetId);
		if (!file) {
			throw new Error(`missing file for ${asset.assetId}`);
		}

		const assetPath = resolveUniqueAssetPath(
			buildAssetPath(manifest.assetFolder, manifest.docId, asset.preferredName),
			usedAssetPaths,
		);
		await ensureFolder(vault, dirname(assetPath));
		await vault.writeBinary(assetPath, toArrayBuffer(file));
		assetPaths.push(assetPath);
		markdown = markdown.split(asset.placeholder).join(assetReplacement(asset, assetPath));
	}

	const notePath = buildNotePath(manifest.noteFolder, manifest.title);
	await ensureFolder(vault, dirname(notePath));
	await vault.write(notePath, markdown);

	return {
		notePath,
		assetPaths,
		markdown,
	};
}
