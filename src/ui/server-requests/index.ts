// The browser's one way of speaking JSON to the canvas server.
//
// Every endpoint the shell calls goes through here, so a refusal is read the
// same way everywhere and no module invents a second reading of `success:
// false`. The server validated the wire; the browser has no second schema for
// its own endpoints, so this is the one place a reply is trusted.

/** A JSON body as far as the browser can see before trusting its shape. */
type JsonRecord = Readonly<Record<string, unknown>>;

/**
 * Whether a decoded JSON value is a plain object.
 * @param value Any decoded JSON value.
 * @returns True for an object that is not an array or null.
 */
function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Trust a reply body as the endpoint's contract.
 *
 * The one place a plain reply is trusted, so every endpoint's trust is spelled
 * here and nowhere else.
 * @param body The decoded body.
 * @returns The same value, typed as the endpoint's reply.
 */
// The endpoint contract is the server's; no compliant spelling can express
// "this JSON is that contract" without asserting, and the type parameter is
// the caller's statement of which contract it is.
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
function trustReply<T>(body: unknown): T {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	return body as T;
}

/**
 * Decode a response body as JSON, treating an unreadable body as empty.
 * @param response The fetch response.
 * @returns The decoded body, or an empty record.
 */
async function readBody(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return {};
	}
}

/**
 * The message a failed reply carries, or a fallback naming the request.
 * @param record The decoded body.
 * @param method The request method.
 * @param url The request URL.
 * @param status The HTTP status.
 * @returns A plain error.
 */
function plainFailure(
	record: JsonRecord | null,
	method: string,
	url: string,
	status: number,
): Error {
	const message = record?.["error"];
	return new Error(typeof message === "string" ? message : `${method} ${url} failed (${status})`);
}

/**
 * Fetch a JSON reply, throwing when the server refuses.
 * @param url The endpoint.
 * @param init Request options; GET when absent.
 * @returns The decoded reply, trusted to be the endpoint's contract.
 */
async function json<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	const body = await readBody(response);
	const record = isRecord(body) ? body : null;
	if (refused(response, record)) {
		throw plainFailure(record, init?.method ?? "GET", url, response.status);
	}
	return trustReply<T>(body);
}

/**
 * Whether a reply is a refusal: a non-2xx, or a body that says so itself.
 * @param response The fetch response.
 * @param record Its decoded body, when it decoded to an object.
 * @returns True when the server refused.
 */
function refused(response: Response, record: JsonRecord | null): boolean {
	return !response.ok || record?.["success"] === false;
}

/**
 * Request options for a JSON mutation.
 * @param method POST, PUT or DELETE.
 * @param payload The body, serialised as JSON.
 * @returns The fetch options.
 */
function mutation(method: "POST" | "PUT" | "DELETE", payload: unknown): RequestInit {
	return {
		method,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	};
}

/**
 * POST a JSON payload and decode the reply.
 * @param url The endpoint.
 * @param payload The body.
 * @returns The decoded reply.
 */
function post<T>(url: string, payload: unknown): Promise<T> {
	return json<T>(url, mutation("POST", payload));
}

/** A Zod-shaped parser for one reply schema. */
interface ReplySchema<T> {
	safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/**
 * Fetch a reply that must match a schema exactly: a success schema on a 2xx,
 * the failure schema otherwise. Anything else is reported as invalid.
 * @param url The endpoint.
 * @param init Request options.
 * @param successSchema The schema a 2xx body must satisfy.
 * @param failureSchema The schema a non-2xx body must satisfy.
 * @param invalid Builds the failure reported for an unparseable reply.
 * @returns The parsed success or failure.
 */
async function strictReply<T, F>(
	url: string,
	init: RequestInit | undefined,
	successSchema: ReplySchema<T>,
	failureSchema: ReplySchema<F>,
	invalid: (error?: unknown) => F,
): Promise<T | F> {
	try {
		const response = await fetch(url, init);
		const body: unknown = await response.json();
		const parsed = response.ok ? successSchema.safeParse(body) : failureSchema.safeParse(body);
		return parsed.success ? parsed.data : invalid();
	} catch (error) {
		return invalid(error);
	}
}

/**
 * Request options carrying a caller's cancellation, when it has one.
 * @param signal Cancels the request, when the caller has a signal.
 * @returns The fetch options for a GET.
 */
function cancellable(signal?: AbortSignal): RequestInit {
	return signal === undefined ? {} : { signal };
}

/**
 * The `?board=` query for a board-scoped endpoint.
 * @param board The board key, or null for none.
 * @returns The query string, empty when no board is named.
 */
function boardQuery(board: string | null): string {
	return board === null || board === "" ? "" : `?board=${encodeURIComponent(board)}`;
}

export {
	boardQuery,
	cancellable,
	isRecord,
	json,
	mutation,
	post,
	strictReply,
	trustReply,
	type ReplySchema,
};
