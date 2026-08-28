import type { OwnedCanvas } from "../../support/owned-canvas.ts";

type RequestCanvas = Pick<OwnedCanvas, "base" | "assertRunning">;

export interface CapturedResponse<T = unknown> {
	status: number;
	text: string;
	body: T;
}

export interface RequestOptions {
	method?: string;
	body?: unknown;
	doing?: string | false;
	headers?: Record<string, string>;
}

export const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

export function createRequester(canvas: RequestCanvas) {
	return async <T = unknown>(
		path: string,
		options: RequestOptions = {},
	): Promise<CapturedResponse<T>> => {
		const method = (options.method ?? "GET").toUpperCase();
		const url = new URL(path, canvas.base);
		if (
			method !== "GET" &&
			method !== "HEAD" &&
			options.doing !== false &&
			!url.searchParams.has("doing")
		) {
			url.searchParams.set("doing", options.doing ?? "checking canvas state");
		}
		try {
			const response = await fetch(url, {
				method,
				...(options.body === undefined
					? { headers: options.headers }
					: {
							headers: { "Content-Type": "application/json", ...options.headers },
							body: JSON.stringify(options.body),
						}),
			});
			await canvas.assertRunning();
			const text = await response.text();
			let body: T;
			try {
				body = JSON.parse(text) as T;
			} catch {
				body = text as T;
			}
			return { status: response.status, text, body };
		} catch (error) {
			await canvas.assertRunning(error);
			throw error;
		}
	};
}

export async function waitFor<T>(
	probe: () => T | Promise<T>,
	description: string,
	options: { timeoutMs?: number; pollMs?: number } = {},
): Promise<T> {
	const timeoutMs = options.timeoutMs ?? 15_000;
	const pollMs = options.pollMs ?? 50;
	const deadline = Date.now() + timeoutMs;
	let last: T;
	do {
		last = await probe();
		if (last) return last;
		await sleep(pollMs);
	} while (Date.now() < deadline);
	throw new Error(`Timed out after ${timeoutMs}ms waiting for ${description}.`);
}
