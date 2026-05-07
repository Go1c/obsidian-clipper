export interface LarkImportPluginSettings {
	host: '127.0.0.1';
	port: number;
	apiKey: string;
	defaultNoteFolder: string;
	defaultAssetFolder: string;
}

export interface LarkImportPluginSettingsInput {
	host?: string;
	port?: number;
	apiKey?: string;
	defaultNoteFolder?: string;
	defaultAssetFolder?: string;
}

const API_KEY_PATTERN = /^[A-Za-z0-9_-]{32,}$/;
const API_KEY_ERROR =
	'API key must be at least 32 characters using letters, numbers, "_" or "-".';

function randomBytes(length: number): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(length));
}

export function createApiKey(): string {
	return Array.from(randomBytes(24))
		.map(value => value.toString(16).padStart(2, '0'))
		.join('');
}

export function createDefaultSettings(): LarkImportPluginSettings {
	return {
		host: '127.0.0.1',
		port: 27124,
		apiKey: createApiKey(),
		defaultNoteFolder: 'Lark Docs',
		defaultAssetFolder: 'assets/larkdoc',
	};
}

function isSafeApiKey(apiKey: string | undefined): apiKey is string {
	return typeof apiKey === 'string' && API_KEY_PATTERN.test(apiKey);
}

export function validateApiKeyEdit(apiKey: string): string {
	if (!isSafeApiKey(apiKey)) {
		throw new Error(API_KEY_ERROR);
	}

	return apiKey;
}

export function normalizeSettings(
	input: LarkImportPluginSettingsInput | null | undefined,
): LarkImportPluginSettings {
	const defaults = createDefaultSettings();
	const port = input?.port && input.port > 0 && input.port < 65536 ? input.port : defaults.port;

	return {
		host: '127.0.0.1',
		port,
		apiKey: isSafeApiKey(input?.apiKey) ? input.apiKey : defaults.apiKey,
		defaultNoteFolder:
			input?.defaultNoteFolder && !input.defaultNoteFolder.includes('..')
				? input.defaultNoteFolder
				: defaults.defaultNoteFolder,
		defaultAssetFolder:
			input?.defaultAssetFolder && !input.defaultAssetFolder.includes('..')
				? input.defaultAssetFolder
				: defaults.defaultAssetFolder,
	};
}

export function applySettingsEdit(
	current: LarkImportPluginSettings,
	partial: Partial<LarkImportPluginSettings>,
): LarkImportPluginSettings {
	const nextInput: LarkImportPluginSettingsInput = { ...current, ...partial };

	if (Object.hasOwn(partial, 'apiKey') && partial.apiKey !== undefined) {
		nextInput.apiKey = validateApiKeyEdit(partial.apiKey.trim());
	}

	return normalizeSettings(nextInput);
}
