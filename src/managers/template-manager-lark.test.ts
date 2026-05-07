import { beforeEach, describe, expect, test, vi } from 'vitest';

const syncStorage: Record<string, any> = {};

vi.mock('../utils/storage-utils', () => ({
	generalSettings: { propertyTypes: [] },
}));

vi.mock('./property-types-manager', () => ({
	addPropertyType: vi.fn(),
}));

vi.mock('../utils/i18n', () => ({
	getMessage: (key: string) => key,
}));

vi.mock('../utils/browser-polyfill', () => ({
	default: {
		storage: {
			sync: {
				get: vi.fn(async (keys?: string | string[] | null) => {
					if (keys === null || keys === undefined) return { ...syncStorage };
					if (typeof keys === 'string') return { [keys]: syncStorage[keys] };
					return Object.fromEntries(keys.map(key => [key, syncStorage[key]]));
				}),
				set: vi.fn(async (items: Record<string, any>) => {
					Object.assign(syncStorage, items);
				}),
				remove: vi.fn(async (key: string) => {
					delete syncStorage[key];
				}),
			},
		},
	},
}));

import { createDefaultTemplate, createLarkTemplate, loadTemplates, saveTemplateSettings, templates } from './template-manager';

beforeEach(() => {
	for (const key of Object.keys(syncStorage)) {
		delete syncStorage[key];
	}
	templates.splice(0, templates.length);
});

describe('createLarkTemplate', () => {
	test('creates a Feishu/Lark-specific template with precise URL trigger', () => {
		const template = createLarkTemplate();

		expect(template.name).toBe('Feishu/Lark Document');
		expect(template.behavior).toBe('create');
		expect(template.noteNameFormat).toBe('{{title}}');
		expect(template.path).toBe('Lark Docs');
		expect(template.noteContentFormat).toBe('{{content}}');
		expect(template.triggers).toEqual([
			'/^https:\\/\\/[^/]+\\.(feishu\\.cn|larksuite\\.com)\\/(docx|docs|wiki)\\//',
		]);
	});

	test('omits frontmatter properties so the saved note has no Obsidian properties block', () => {
		const template = createLarkTemplate();

		expect(template.properties).toEqual([]);
	});

	test('loadTemplates appends the built-in Lark template without reordering existing templates', async () => {
		const existing = createDefaultTemplate();
		existing.id = 'existing-template';
		existing.name = 'Existing Template';
		templates.push(existing);
		await saveTemplateSettings();
		templates.splice(0, templates.length);

		await loadTemplates();

		expect(templates.map(template => template.id)).toEqual(['existing-template', 'builtin-lark-document']);
	});

	test('loadTemplates does not duplicate the built-in Lark template on repeated loads', async () => {
		templates.push(createDefaultTemplate());
		await saveTemplateSettings();
		templates.splice(0, templates.length);

		await loadTemplates();
		await loadTemplates();

		expect(templates.filter(template => template.id === 'builtin-lark-document')).toHaveLength(1);
	});

	test('loadTemplates installs built-in when same-name user template has wrong id', async () => {
		const userTemplate = createDefaultTemplate();
		userTemplate.id = 'user-lark-template';
		userTemplate.name = 'Feishu/Lark Document';
		templates.push(userTemplate);
		await saveTemplateSettings();
		templates.splice(0, templates.length);

		await loadTemplates();

		expect(templates.map(template => template.id)).toContain('user-lark-template');
		expect(templates.map(template => template.id)).toContain('builtin-lark-document');
	});

	test('loadTemplates resets stale in-memory templates when storage is empty', async () => {
		const stale = createDefaultTemplate();
		stale.id = 'stale-template';
		templates.push(stale);

		await loadTemplates();

		expect(templates.map(template => template.id)).not.toContain('stale-template');
		expect(templates.map(template => template.id)).toContain('builtin-lark-document');
	});
});
