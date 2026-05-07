import { createServer } from 'node:http';

import type { LarkImportPluginSettings } from '../settings';
import type { IncomingHttpRequest, RouterResponse } from './router';

export type RequestRouter = (req: IncomingHttpRequest) => Promise<RouterResponse>;

export interface ServerHandle {
	close: () => Promise<void>;
}

const MAX_REQUEST_BODY_BYTES = 25 * 1024 * 1024;

class RequestBodyTooLargeError extends Error {
	constructor(limit: number) {
		super(`Request body exceeds the ${limit}-byte limit.`);
		this.name = 'RequestBodyTooLargeError';
	}
}

async function readBody(req: NodeJS.ReadableStream, limit = MAX_REQUEST_BODY_BYTES): Promise<Buffer> {
	const chunks: Buffer[] = [];
	let totalBytes = 0;

	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		totalBytes += buffer.length;
		if (totalBytes > limit) {
			throw new RequestBodyTooLargeError(limit);
		}
		chunks.push(buffer);
	}

	return Buffer.concat(chunks);
}

function normalizeHeaders(
	headers: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
	return Object.fromEntries(
		Object.entries(headers).map(([key, value]) => [
			key,
			Array.isArray(value) ? value.join(', ') : value,
		]),
	);
}

export function startServer(
	settings: LarkImportPluginSettings,
	router: RequestRouter,
) : Promise<ServerHandle> {
	const server = createServer(async (req, res) => {
		try {
			let cachedBody: Promise<Buffer> | undefined;
			const response = await router({
				method: req.method || 'GET',
				url: req.url || '/',
				headers: normalizeHeaders(req.headers),
				readBody: () => {
					cachedBody ||= readBody(req);
					return cachedBody;
				},
			});
			res.writeHead(response.status, response.headers);
			res.end(response.body);
		} catch (error) {
			if (error instanceof RequestBodyTooLargeError) {
				res.writeHead(413, {
					'content-type': 'application/json; charset=utf-8',
				});
				res.end(Buffer.from(JSON.stringify({ ok: false, error: 'payload_too_large' })));
				return;
			}

			res.writeHead(500, {
				'content-type': 'application/json; charset=utf-8',
			});
			res.end(Buffer.from(JSON.stringify({ ok: false, error: 'internal_error' })));
		}
	});

	return new Promise<ServerHandle>((resolve, reject) => {
		const onError = (error: Error) => {
			server.off('listening', onListening);
			reject(error);
		};
		const onListening = () => {
			server.off('error', onError);
			resolve({
				close: () =>
					new Promise(closeResolve => {
						server.close(() => closeResolve());
					}),
			});
		};

		server.once('error', onError);
		server.once('listening', onListening);
		server.listen(settings.port, settings.host);
	});
}
