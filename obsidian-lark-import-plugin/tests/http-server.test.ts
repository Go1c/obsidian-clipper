import { createServer as createNodeServer, request as httpRequest } from 'node:http';

import { afterEach, describe, expect, test } from 'vitest';

import { handleRequest } from '../src/http/router';
import { startServer, type ServerHandle } from '../src/http/server';
import type { LarkImportPluginSettings } from '../src/settings';

const baseSettings: LarkImportPluginSettings = {
	host: '127.0.0.1',
	port: 27124,
	apiKey: 'secret',
	defaultNoteFolder: 'Lark Docs',
	defaultAssetFolder: 'assets/larkdoc',
};

const activeServers: ServerHandle[] = [];

afterEach(async () => {
	while (activeServers.length > 0) {
		await activeServers.pop()?.close();
	}
});

async function reservePort(): Promise<{ port: number; close: () => Promise<void> }> {
	const server = createNodeServer();

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => resolve());
	});

	const address = server.address();
	if (!address || typeof address === 'string') {
		throw new Error('Failed to reserve a TCP port for the test.');
	}

	return {
		port: address.port,
		close: () =>
			new Promise(resolve => {
				server.close(() => resolve());
			}),
	};
}

describe('http server', () => {
	test('surfaces listen failures when the port is unavailable', async () => {
		const occupied = await reservePort();

		await expect(
			startServer(
				{
					...baseSettings,
					port: occupied.port,
				},
				req =>
					handleRequest(req, {
						apiKey: baseSettings.apiKey,
						version: '0.1.0',
						vaultName: 'Test Vault',
					}),
			),
		).rejects.toMatchObject({
			code: 'EADDRINUSE',
		});

		await occupied.close();
	});

	test('responds to unauthorized imports before the request body finishes streaming', async () => {
		const server = await startServer(baseSettings, req =>
			handleRequest(req, {
				apiKey: baseSettings.apiKey,
				version: '0.1.0',
				vaultName: 'Test Vault',
			}),
		);
		activeServers.push(server);

		const responsePromise = new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
			const req = httpRequest(
				{
					host: baseSettings.host,
					port: baseSettings.port,
					method: 'POST',
					path: '/imports/lark',
					headers: {
						'content-length': String(1024 * 1024),
					},
				},
				res => {
					let body = '';
					res.setEncoding('utf8');
					res.on('data', chunk => {
						body += chunk;
					});
					res.on('end', () => {
						resolve({
							statusCode: res.statusCode || 0,
							body,
						});
					});
				},
			);

			req.on('error', reject);
			req.write('partial-body');
		});

		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => reject(new Error('Server waited for the full request body.')), 250);
		});

		await expect(Promise.race([responsePromise, timeoutPromise])).resolves.toMatchObject({
			statusCode: 401,
		});
	});
});
