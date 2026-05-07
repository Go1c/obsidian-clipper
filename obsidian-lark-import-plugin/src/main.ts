import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

import { handleRequest } from './http/router';
import { startServer, type ServerHandle } from './http/server';
import {
	applySettingsEdit,
	createApiKey,
	normalizeSettings,
	type LarkImportPluginSettings,
} from './settings';

class LarkImportSettingTab extends PluginSettingTab {
	plugin: LarkLocalImportPlugin;

	constructor(app: App, plugin: LarkLocalImportPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Lark Local Import' });

		new Setting(containerEl)
			.setName('Host')
			.setDesc('Desktop plugin only listens on localhost.')
			.addText(text =>
				text.setValue(this.plugin.settings.host).setDisabled(true),
			);

		new Setting(containerEl)
			.setName('Port')
			.setDesc('Local HTTP port used by the browser extension.')
			.addText(text => {
				let draftValue = String(this.plugin.settings.port);
				const commit = async () => {
					if (draftValue === String(this.plugin.settings.port)) {
						return;
					}
					await this.commitSetting({ port: Number.parseInt(draftValue, 10) });
				};

				text
					.setPlaceholder('27124')
					.setValue(draftValue)
					.onChange(value => {
						draftValue = value.trim();
					});

				text.inputEl.addEventListener('blur', () => {
					void commit();
				});
				text.inputEl.addEventListener('keydown', event => {
					if (event.key === 'Enter') {
						event.preventDefault();
						void commit();
					}
				});
			});

		new Setting(containerEl)
			.setName('API key')
			.setDesc('Bearer token required for protected import requests.')
			.addText(text => {
				let draftValue = this.plugin.settings.apiKey;
				const commit = async () => {
					if (draftValue === this.plugin.settings.apiKey) {
						return;
					}
					await this.commitSetting({ apiKey: draftValue.trim() });
				};

				text
					.setPlaceholder('Generated automatically')
					.setValue(draftValue)
					.onChange(value => {
						draftValue = value;
					});

				text.inputEl.addEventListener('blur', () => {
					void commit();
				});
				text.inputEl.addEventListener('keydown', event => {
					if (event.key === 'Enter') {
						event.preventDefault();
						void commit();
					}
				});
			})
			.addButton(button =>
				button.setButtonText('Regenerate').onClick(async () => {
					await this.commitSetting({ apiKey: createApiKey() });
					this.display();
					new Notice('Generated a new Lark import API key.');
				}),
			);

		new Setting(containerEl)
			.setName('Default note folder')
			.setDesc('Vault folder used for imported notes.')
			.addText(text => {
				let draftValue = this.plugin.settings.defaultNoteFolder;
				const commit = async () => {
					if (draftValue === this.plugin.settings.defaultNoteFolder) {
						return;
					}
					await this.commitSetting({ defaultNoteFolder: draftValue.trim() });
				};

				text
					.setPlaceholder('Lark Docs')
					.setValue(draftValue)
					.onChange(value => {
						draftValue = value;
					});

				text.inputEl.addEventListener('blur', () => {
					void commit();
				});
				text.inputEl.addEventListener('keydown', event => {
					if (event.key === 'Enter') {
						event.preventDefault();
						void commit();
					}
				});
			});

		new Setting(containerEl)
			.setName('Default asset folder')
			.setDesc('Vault folder used for imported attachments.')
			.addText(text => {
				let draftValue = this.plugin.settings.defaultAssetFolder;
				const commit = async () => {
					if (draftValue === this.plugin.settings.defaultAssetFolder) {
						return;
					}
					await this.commitSetting({ defaultAssetFolder: draftValue.trim() });
				};

				text
					.setPlaceholder('assets/larkdoc')
					.setValue(draftValue)
					.onChange(value => {
						draftValue = value;
					});

				text.inputEl.addEventListener('blur', () => {
					void commit();
				});
				text.inputEl.addEventListener('keydown', event => {
					if (event.key === 'Enter') {
						event.preventDefault();
						void commit();
					}
				});
			});
	}

	private async commitSetting(partial: Partial<LarkImportPluginSettings>): Promise<void> {
		try {
			await this.plugin.updateSettings(partial);
			this.display();
		} catch (error) {
			this.display();
			const message = error instanceof Error ? error.message : 'Failed to save plugin settings.';
			new Notice(message);
		}
	}
}

export default class LarkLocalImportPlugin extends Plugin {
	settings!: LarkImportPluginSettings;
	server?: ServerHandle;
	private settingsUpdateQueue: Promise<void> = Promise.resolve();

	async onload(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
		this.addSettingTab(new LarkImportSettingTab(this.app, this));
		this.server = await startServer(this.settings, req =>
			handleRequest(req, {
				apiKey: this.settings.apiKey,
				version: this.manifest.version,
				vaultName: this.app.vault.getName(),
			}),
		);
	}

	async onunload(): Promise<void> {
		await this.server?.close();
	}

	async updateSettings(partial: Partial<LarkImportPluginSettings>): Promise<void> {
		const operation = this.settingsUpdateQueue.then(() => this.applySettings(partial));
		this.settingsUpdateQueue = operation.catch(() => undefined);
		return operation;
	}

	private async applySettings(partial: Partial<LarkImportPluginSettings>): Promise<void> {
		const nextSettings = applySettingsEdit(this.settings, partial);
		const portChanged =
			!this.server ||
			nextSettings.host !== this.settings.host ||
			nextSettings.port !== this.settings.port;

		if (portChanged) {
			await this.restartServer(nextSettings);
		}

		this.settings = nextSettings;
		await this.saveData(this.settings);
	}

	private async restartServer(nextSettings: LarkImportPluginSettings): Promise<void> {
		const previousSettings = this.settings;
		const previousServer = this.server;

		if (previousServer) {
			await previousServer.close();
			this.server = undefined;
		}

		this.settings = nextSettings;

		try {
			this.server = await startServer(this.settings, req =>
				handleRequest(req, {
					apiKey: this.settings.apiKey,
					version: this.manifest.version,
					vaultName: this.app.vault.getName(),
				}),
			);
		} catch (error) {
			this.settings = previousSettings;
			if (previousServer) {
				this.server = await startServer(this.settings, req =>
					handleRequest(req, {
						apiKey: this.settings.apiKey,
						version: this.manifest.version,
						vaultName: this.app.vault.getName(),
					}),
				);
			}
			throw error;
		}
	}
}
