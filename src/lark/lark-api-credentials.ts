import browser from '../utils/browser-polyfill';
import type { LarkApiCredentials } from '../types/types';

const STORAGE_KEY = 'larkApiCredentials';

export async function loadLarkApiCredentials(): Promise<LarkApiCredentials | null> {
	const result = await browser.storage.local.get(STORAGE_KEY) as Record<string, unknown>;
	const raw = result?.[STORAGE_KEY];
	if (!raw || typeof raw !== 'object') return null;
	const candidate = raw as Partial<LarkApiCredentials>;
	if (typeof candidate.appId !== 'string' || typeof candidate.appSecret !== 'string') {
		return null;
	}
	if (!candidate.appId.trim() || !candidate.appSecret.trim()) {
		return null;
	}
	return { appId: candidate.appId.trim(), appSecret: candidate.appSecret.trim() };
}

export async function saveLarkApiCredentials(creds: LarkApiCredentials | null): Promise<void> {
	if (!creds) {
		await browser.storage.local.remove(STORAGE_KEY);
		return;
	}
	await browser.storage.local.set({ [STORAGE_KEY]: creds });
}
