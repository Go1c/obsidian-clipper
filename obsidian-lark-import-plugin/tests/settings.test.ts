import { describe, expect, test } from 'vitest';
import {
	applySettingsEdit,
	createDefaultSettings,
	normalizeSettings,
} from '../src/settings';

describe('plugin settings', () => {
	test('creates a localhost-enabled default config', () => {
		const settings = createDefaultSettings();
		expect(settings.port).toBe(27124);
		expect(settings.host).toBe('127.0.0.1');
		expect(settings.apiKey).toMatch(/^[A-Za-z0-9_-]{32,}$/);
		expect(settings.defaultNoteFolder).toBe('Lark Docs');
		expect(settings.defaultAssetFolder).toBe('assets/larkdoc');
	});

	test('normalizes unsafe values', () => {
		const unsafeApiKey = 'invalid key with spaces !!! invalid key';
		const settings = normalizeSettings({
			port: 0,
			host: '0.0.0.0',
			apiKey: unsafeApiKey,
			defaultNoteFolder: '../bad',
			defaultAssetFolder: '',
		});
		expect(settings.port).toBe(27124);
		expect(settings.host).toBe('127.0.0.1');
		expect(settings.apiKey).not.toBe(unsafeApiKey);
		expect(settings.apiKey).toMatch(/^[A-Za-z0-9_-]{32,}$/);
		expect(settings.defaultNoteFolder).toBe('Lark Docs');
		expect(settings.defaultAssetFolder).toBe('assets/larkdoc');
	});

	test('preserves valid user-provided values during normalization', () => {
		const apiKey = 'Valid_User-ProvidedApiKey_1234567890';
		const settings = normalizeSettings({
			port: 43123,
			host: '127.0.0.1',
			apiKey,
			defaultNoteFolder: 'Imported/Lark',
			defaultAssetFolder: 'assets/lark/custom',
		});
		expect(settings.port).toBe(43123);
		expect(settings.host).toBe('127.0.0.1');
		expect(settings.apiKey).toBe(apiKey);
		expect(settings.defaultNoteFolder).toBe('Imported/Lark');
		expect(settings.defaultAssetFolder).toBe('assets/lark/custom');
	});

	test('rejects invalid api key edits without rotating credentials', () => {
		const currentSettings = normalizeSettings({
			apiKey: 'Valid_User-ProvidedApiKey_1234567890',
			port: 27124,
			defaultNoteFolder: 'Lark Docs',
			defaultAssetFolder: 'assets/larkdoc',
		});

		expect(() =>
			applySettingsEdit(currentSettings, {
				apiKey: '',
			}),
		).toThrow('API key must be at least 32 characters using letters, numbers, "_" or "-".');

		expect(currentSettings.apiKey).toBe('Valid_User-ProvidedApiKey_1234567890');
	});
});
