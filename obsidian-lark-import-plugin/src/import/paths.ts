function normalizeHyphens(value: string): string {
	return value.replace(/-+/g, '-');
}

const WINDOWS_RESERVED_BASENAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function trimTrailingDotsAndSpaces(value: string): string {
	return value.replace(/[. ]+$/g, '');
}

export function sanitizePathPart(input: string): string {
	const sanitized = normalizeHyphens(
		input
			.trim()
			.replace(/\.\.+/g, '-')
			.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-'),
	).trim();
	const withoutTrailingDotsAndSpaces = trimTrailingDotsAndSpaces(sanitized);
	if (!withoutTrailingDotsAndSpaces) {
		return 'untitled';
	}

	const extensionIndex = withoutTrailingDotsAndSpaces.lastIndexOf('.');
	if (extensionIndex <= 0) {
		return WINDOWS_RESERVED_BASENAME.test(withoutTrailingDotsAndSpaces)
			? `${withoutTrailingDotsAndSpaces}-`
			: withoutTrailingDotsAndSpaces;
	}

	const basename = trimTrailingDotsAndSpaces(withoutTrailingDotsAndSpaces.slice(0, extensionIndex));
	const extension = withoutTrailingDotsAndSpaces.slice(extensionIndex);
	const safeBasename = basename || 'untitled';

	return WINDOWS_RESERVED_BASENAME.test(safeBasename)
		? `${safeBasename}-${extension}`
		: `${safeBasename}${extension}`;
}

export function sanitizeFolderPath(input: string): string {
	const parts = input
		.split(/[\\/]+/)
		.map(part => part.trim())
		.filter(part => part.length > 0 && part !== '.' && part !== '..')
		.map(sanitizePathPart);

	return parts.join('/') || 'untitled';
}

export function buildAssetPath(assetFolder: string, docId: string, preferredName: string): string {
	return [
		sanitizeFolderPath(assetFolder),
		sanitizePathPart(docId),
		sanitizePathPart(preferredName),
	].join('/');
}

export function buildNotePath(noteFolder: string, title: string): string {
	const sanitizedTitle = sanitizePathPart(title).replace(/\.md$/i, '');
	return `${sanitizeFolderPath(noteFolder)}/${sanitizedTitle || 'untitled'}.md`;
}
