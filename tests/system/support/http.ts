import type { OwnedServer } from "./owned-server.ts";

export interface JsonResponse<T> {
	status: number;
	body: T;
}

export interface JsonRequestOptions {
	method?: string;
	body?: unknown;
	doing?: string;
	signal?: AbortSignal;
}

export async function readOwnedJsonResponse<T>(
	server: OwnedServer,
	responsePromise: Promise<Response>,
): Promise<JsonResponse<T>> {
	await server.assertRunning();
	try {
		const response = await responsePromise;
		await server.assertRunning();
		const body = (await response.json()) as T;
		await server.assertRunning();
		return { status: response.status, body };
	} catch (error) {
		await server.assertRunning(error);
		throw error;
	}
}

export function createJsonRequester(server: OwnedServer) {
	return async <T>(path: string, options: JsonRequestOptions = {}): Promise<JsonResponse<T>> => {
		const method = (options.method ?? "GET").toUpperCase();
		const url = new URL(path, server.base);
		if (method !== "GET" && method !== "HEAD" && !url.searchParams.has("doing")) {
			url.searchParams.set("doing", options.doing ?? "checking the board contract");
		}
		return readOwnedJsonResponse<T>(
			server,
			fetch(url, {
				method,
				...(options.signal === undefined ? {} : { signal: options.signal }),
				...(options.body === undefined
					? {}
					: {
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify(options.body),
						}),
			}),
		);
	};
}
