import type { OwnedCanvas } from "../../support/owned-canvas.ts";

export interface JsonResponse<T> {
	status: number;
	body: T;
}

export interface JsonRequestOptions {
	method?: string;
	body?: unknown;
	doing?: string;
}

export async function readOwnedJsonResponse<T>(
	canvas: OwnedCanvas,
	responsePromise: Promise<Response>,
): Promise<JsonResponse<T>> {
	await canvas.assertRunning();
	try {
		const response = await responsePromise;
		await canvas.assertRunning();
		const body = (await response.json()) as T;
		await canvas.assertRunning();
		return { status: response.status, body };
	} catch (error) {
		await canvas.assertRunning(error);
		throw error;
	}
}

export function createJsonRequester(canvas: OwnedCanvas) {
	return async <T>(path: string, options: JsonRequestOptions = {}): Promise<JsonResponse<T>> => {
		const method = (options.method ?? "GET").toUpperCase();
		const url = new URL(path, canvas.base);
		if (method !== "GET" && method !== "HEAD" && !url.searchParams.has("doing")) {
			url.searchParams.set("doing", options.doing ?? "checking the board contract");
		}
		return readOwnedJsonResponse<T>(
			canvas,
			fetch(url, {
				method,
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
