import { afterEach, describe, expect, test, vi } from 'vitest';
import { checkLarkPluginHealth, importLarkDocument } from './lark-plugin-client';
import browser from '../utils/browser-polyfill';
import { defaultLarkPluginSettings, generalSettings, saveSettings } from '../utils/storage-utils';
import type { Settings } from '../types/types';

const settings: Settings = {
	vaults: [],
	showMoreActionsButton: false,
	betaFeatures: false,
	legacyMode: false,
	silentOpen: false,
	openBehavior: 'popup',
	highlighterEnabled: true,
	alwaysShowHighlights: false,
	highlightBehavior: 'highlight-inline',
	interpreterModel: '',
	models: [],
	providers: [],
	interpreterEnabled: false,
	interpreterAutoRun: false,
	defaultPromptContext: '',
	propertyTypes: [],
	readerSettings: {
		fontSize: 16,
		lineHeight: 1.6,
		maxWidth: 38,
		lightTheme: 'default',
		darkTheme: 'same',
		appearance: 'auto',
		fonts: [],
		defaultFont: '',
		blendImages: true,
		colorLinks: false,
		followLinks: true,
		pinPlayer: true,
		autoScroll: true,
		highlightActiveLine: true,
		customCss: ''
	},
	stats: {
		addToObsidian: 0,
		saveFile: 0,
		copyToClipboard: 0,
		share: 0
	},
	history: [],
	ratings: [],
	saveBehavior: 'addToObsidian',
	larkPlugin: {
		endpoint: 'http://127.0.0.1:27124',
		apiKey: 'test-api-key',
		defaultNoteFolder: 'Lark Docs',
		defaultAssetFolder: 'assets/larkdoc'
	}
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('saveSettings', () => {
	test('trims non-empty Lark plugin values before persisting them', async () => {
		const syncSet = vi.spyOn(browser.storage.sync, 'set').mockResolvedValue();

		await saveSettings({
			larkPlugin: {
				endpoint: '  http://localhost:4312/  ',
				apiKey: '  secret-token  ',
				defaultNoteFolder: '  Team Docs  ',
				defaultAssetFolder: '  assets/imports  '
			}
		});

		expect(generalSettings.larkPlugin).toEqual({
			endpoint: 'http://localhost:4312/',
			apiKey: 'secret-token',
			defaultNoteFolder: 'Team Docs',
			defaultAssetFolder: 'assets/imports'
		});
		expect(syncSet).toHaveBeenCalledWith(expect.objectContaining({
			lark_plugin_settings: {
				endpoint: 'http://localhost:4312/',
				apiKey: 'secret-token',
				defaultNoteFolder: 'Team Docs',
				defaultAssetFolder: 'assets/imports'
			}
		}));
	});

	test('falls back to defaults for blank endpoint and blank folders', async () => {
		const syncSet = vi.spyOn(browser.storage.sync, 'set').mockResolvedValue();

		await saveSettings({
			larkPlugin: {
				endpoint: '   ',
				apiKey: '   ',
				defaultNoteFolder: '   ',
				defaultAssetFolder: '\t'
			}
		});

		expect(generalSettings.larkPlugin).toEqual({
			endpoint: defaultLarkPluginSettings.endpoint,
			apiKey: '',
			defaultNoteFolder: defaultLarkPluginSettings.defaultNoteFolder,
			defaultAssetFolder: defaultLarkPluginSettings.defaultAssetFolder
		});
		expect(syncSet).toHaveBeenCalledWith(expect.objectContaining({
			lark_plugin_settings: {
				endpoint: defaultLarkPluginSettings.endpoint,
				apiKey: '',
				defaultNoteFolder: defaultLarkPluginSettings.defaultNoteFolder,
				defaultAssetFolder: defaultLarkPluginSettings.defaultAssetFolder
			}
		}));
	});
});

describe('checkLarkPluginHealth', () => {
	test('requests plugin health with bearer auth and returns JSON', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ status: 'ok' })
		});
		vi.stubGlobal('fetch', fetchMock);

		await expect(checkLarkPluginHealth(settings)).resolves.toEqual({ status: 'ok' });
		expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:27124/health', {
			headers: {
				Authorization: 'Bearer test-api-key'
			}
		});
	});

	test('omits authorization header when the api key is blank', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ status: 'ok' })
		});
		vi.stubGlobal('fetch', fetchMock);

		await expect(checkLarkPluginHealth({
			...settings,
			larkPlugin: {
				...settings.larkPlugin!,
				apiKey: ''
			}
		})).resolves.toEqual({ status: 'ok' });
		expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:27124/health', {
			headers: {}
		});
	});

	test('throws a useful error when the health request fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: false,
			status: 503,
			text: async () => 'Service unavailable'
		}));

		await expect(checkLarkPluginHealth(settings)).rejects.toThrow(
			'Lark plugin health check failed (503): Service unavailable'
		);
	});
});

describe('importLarkDocument', () => {
	test('posts form data with bearer auth and returns JSON', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ importId: 'abc123' })
		});
		vi.stubGlobal('fetch', fetchMock);
		const formData = new FormData();
		formData.append('documentId', 'doc123');

		await expect(importLarkDocument(settings, formData)).resolves.toEqual({ importId: 'abc123' });
		expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:27124/imports/lark', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer test-api-key'
			},
			body: formData
		});
	});

	test('posts form data without auth when the api key is blank', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ importId: 'abc123' })
		});
		vi.stubGlobal('fetch', fetchMock);
		const formData = new FormData();

		await expect(importLarkDocument({
			...settings,
			larkPlugin: {
				...settings.larkPlugin!,
				apiKey: ''
			}
		}, formData)).resolves.toEqual({ importId: 'abc123' });
		expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:27124/imports/lark', {
			method: 'POST',
			headers: {},
			body: formData
		});
	});

	test('throws a useful error when the import request fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
			text: async () => 'Unauthorized'
		}));

		await expect(importLarkDocument(settings, new FormData())).rejects.toThrow(
			'Lark plugin import failed (401): Unauthorized'
		);
	});
});
