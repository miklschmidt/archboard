import type { OwnedServer } from "../../support/owned-server.ts";

type RequestServer = Pick<OwnedServer, "base" | "assertRunning"> &
	Partial<Pick<OwnedServer, "vault">>;

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
	signal?: AbortSignal;
	/** The vault the call names; the server's own unless stated. `false` names none, as a refusal test does. */
	vault?: string | false;
}

export const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

export function createRequester(server: RequestServer) {
	const request = async <T = unknown>(
		path: string,
		options: RequestOptions = {},
	): Promise<CapturedResponse<T>> => {
		const method = (options.method ?? "GET").toUpperCase();
		const url = new URL(path, server.base);
		const vault = options.vault ?? server.vault ?? false;
		if (vault !== false && url.pathname.startsWith("/api/") && !url.searchParams.has("vault")) {
			url.searchParams.set("vault", vault);
		}
		if (
			method !== "GET" &&
			method !== "HEAD" &&
			options.doing !== false &&
			!url.searchParams.has("doing")
		) {
			url.searchParams.set("doing", options.doing ?? "checking server state");
		}
		try {
			const response = await fetch(url, {
				method,
				...(options.signal === undefined ? {} : { signal: options.signal }),
				...(options.body === undefined
					? options.headers === undefined
						? {}
						: { headers: options.headers }
					: {
							headers: { "Content-Type": "application/json", ...options.headers },
							body: JSON.stringify(options.body),
						}),
			});
			await server.assertRunning();
			const text = await response.text();
			let body: T;
			try {
				body = JSON.parse(text) as T;
			} catch {
				body = text as T;
			}
			return { status: response.status, text, body };
		} catch (error) {
			await server.assertRunning(error);
			throw error;
		}
	};
	// Every call names its vault (ADR 0049); a pane the requester opens names the same one.
	return Object.assign(request, { vault: server.vault });
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
