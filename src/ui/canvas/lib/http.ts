// The browser's one way of speaking JSON to the canvas server. Every endpoint
// in `api.ts` goes through here, so a refusal is read the same way everywhere.

import type {
	BoardHold,
	BoardVersionConflict,
	BoardWriteConflict,
	ServerElement,
} from "@/ui/types";

/**
 * A refused board write. Distinct from a plain Error because the shell has to
 * offer the human a choice rather than show them a message: it is an outcome of
 * saving, not a fault (ADR 0006).
 */
class BoardConflictError extends Error {
	readonly conflict: BoardWriteConflict;
	/** The hold this refusal started or ran into, when the board has one. */
	readonly held: BoardHold | undefined;

	/**
	 * Wrap the server's conflict answer.
	 * @param conflict The conflict as the server described it.
	 * @param held The hold the board is under, when it has one.
	 */
	constructor(conflict: BoardWriteConflict, held?: BoardHold) {
		super(conflict.message);
		this.name = "BoardConflictError";
		this.conflict = conflict;
		this.held = held;
	}
}

/**
 * A write refused because the note moved past the version the pane stated
 * (ADR 0022). Not a fault and not a choice: the refusal carries the board as
 * the note holds it, and the pane reconciles to that.
 */
class BoardVersionConflictError extends Error {
	readonly conflict: BoardVersionConflict;
	/** The board as the note holds it now. */
	readonly document: readonly ServerElement[];
	/** The note version the document is at, or null when the note carries none. */
	readonly version: number | null;

	/**
	 * Wrap the server's version-conflict answer.
	 * @param conflict The conflict as the server described it.
	 * @param document The board as the note holds it.
	 * @param version The note version the document is at.
	 */
	constructor(
		conflict: BoardVersionConflict,
		document: readonly ServerElement[],
		version: number | null,
	) {
		super(conflict.message);
		this.name = "BoardVersionConflictError";
		this.conflict = conflict;
		this.document = document;
		this.version = version;
	}
}

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
 * The server validated the wire, and the browser has no second schema for its
 * own endpoints; this is the one place a plain reply is trusted, so every
 * endpoint's trust is spelled here and nowhere else.
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
 * The conflict a refusal carries, when it is a refused write.
 * @param record The decoded body.
 * @returns The conflict error, or null when the body names no conflict.
 */
function conflictFrom(record: JsonRecord | null): BoardConflictError | null {
	if (record === null || !isRecord(record["conflict"])) {
		return null;
	}
	const held = record["held"];
	return new BoardConflictError(
		trustReply<BoardWriteConflict>(record["conflict"]),
		held === undefined ? undefined : trustReply<BoardHold>(held),
	);
}

/**
 * The version conflict a refusal carries, when the note moved under the write.
 * @param record The decoded body.
 * @returns The error, or null when the body names no version conflict.
 */
function versionConflictFrom(record: JsonRecord | null): BoardVersionConflictError | null {
	if (record === null || !isRecord(record["versionConflict"])) {
		return null;
	}
	const document = record["document"];
	const version = record["version"];
	return new BoardVersionConflictError(
		trustReply<BoardVersionConflict>(record["versionConflict"]),
		Array.isArray(document) ? trustReply<ServerElement[]>(document) : [],
		typeof version === "number" ? version : null,
	);
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
 * The failure a reply carries, if any.
 * @param response The fetch response.
 * @param body Its decoded body.
 * @param method The request method, for the fallback message.
 * @param url The request URL, for the fallback message.
 * @returns The error to throw, or null when the reply succeeded.
 */
function replyFailure(
	response: Response,
	body: unknown,
	method: string,
	url: string,
): Error | null {
	const record = isRecord(body) ? body : null;
	if (response.ok && record?.["success"] !== false) {
		return null;
	}
	return refusalFrom(record) ?? plainFailure(record, method, url, response.status);
}

/**
 * The typed refusal a failed body carries, if it is one of the two.
 * @param record The decoded body.
 * @returns The version conflict, the hash conflict, or null.
 */
function refusalFrom(record: JsonRecord | null): Error | null {
	return versionConflictFrom(record) ?? conflictFrom(record);
}

/**
 * Fetch a JSON reply, throwing a `BoardVersionConflictError` when the note
 * moved under a write, a `BoardConflictError` for a refused write and a plain
 * Error for any other failure.
 * @param url The endpoint.
 * @param init Request options; GET when absent.
 * @returns The decoded reply, trusted to be the endpoint's contract.
 */
async function json<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	const body = await readBody(response);
	const failure = replyFailure(response, body, init?.method ?? "GET", url);
	if (failure !== null) {
		throw failure;
	}
	return trustReply<T>(body);
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
 *
 * A read whose caller can be superseded — a cache refetch, a pane that has
 * moved on — passes its signal through here, so an answer that arrives after
 * the caller stopped wanting it never reaches the network layer at all.
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
	BoardConflictError,
	BoardVersionConflictError,
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
