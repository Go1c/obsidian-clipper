import type { Settings } from '../types/types';

const DEFAULT_LARK_PLUGIN_SETTINGS = {
	endpoint: 'http://127.0.0.1:27124',
	apiKey: ''
};

type JsonObject = Record<string, unknown>;

function getLarkPluginConnection(settings: Settings) {
	const endpoint = settings.larkPlugin?.endpoint?.trim();
	const apiKey = settings.larkPlugin?.apiKey?.trim();

	return {
		endpoint: endpoint || DEFAULT_LARK_PLUGIN_SETTINGS.endpoint,
		apiKey: apiKey ?? DEFAULT_LARK_PLUGIN_SETTINGS.apiKey
	};
}

function buildLarkPluginUrl(settings: Settings, path: string): string {
	const { endpoint } = getLarkPluginConnection(settings);
	return `${endpoint.replace(/\/+$/, '')}${path}`;
}

function getAuthorizationHeader(settings: Settings): HeadersInit {
	const { apiKey } = getLarkPluginConnection(settings);
	if (!apiKey) {
		return {};
	}

	return {
		Authorization: `Bearer ${apiKey}`
	};
}

async function parseJsonResponse(response: Response): Promise<JsonObject> {
	return await response.json() as JsonObject;
}

async function throwResponseError(response: Response, action: string): Promise<never> {
	const responseText = typeof response.text === 'function' ? (await response.text()).trim() : '';
	const message = responseText || response.statusText || 'Request failed';
	throw new Error(`Lark plugin ${action} failed (${response.status}): ${message}`);
}

export async function checkLarkPluginHealth(settings: Settings): Promise<JsonObject> {
	const response = await fetch(buildLarkPluginUrl(settings, '/health'), {
		headers: getAuthorizationHeader(settings)
	});

	if (!response.ok) {
		await throwResponseError(response, 'health check');
	}

	return parseJsonResponse(response);
}

export async function importLarkDocument(settings: Settings, formData: FormData): Promise<JsonObject> {
	const response = await fetch(buildLarkPluginUrl(settings, '/imports/lark'), {
		method: 'POST',
		headers: getAuthorizationHeader(settings),
		body: formData
	});

	if (!response.ok) {
		await throwResponseError(response, 'import');
	}

	return parseJsonResponse(response);
}
