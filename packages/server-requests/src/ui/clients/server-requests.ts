// The browser's one way of speaking JSON to the Archboard server.
//
// Every endpoint the shell calls goes through here, so a refusal is read the
// same way everywhere and no module invents a second reading of `success:
// false`. The server validated the wire; the browser has no second schema for
// its own endpoints, so this is the one place a reply is trusted.

/** A JSON body as far as the browser can see before trusting its shape. */
type JsonRecord = Readonly<Record<string, unknown>>;

/**
 * The vault a page opens in (ADR 0049), learned once before the page draws
 * anything. A pane opens in it until somebody shows it a board of another
 * repository; it is one opaque string here, what the server calls the vault,
 * and nothing the page shows or keeps in an address.
 */
let served: string | null = null;

/** What the page says when the server knows no repository with a vault to open. */
const NO_OPENING_VAULT =
	"This machine knows no repository with a vault yet. Run an archboard command in a checkout that has a .archboard/vault, or add one with archboard repo add <directory>, and then reload this page.";

/**
 * Ask the server which vault a page opens in.
 * @returns When the vault is known.
 * @throws {Error} When the server does not say, or knows no vault to open.
 */
async function learnServedVault(): Promise<void> {
	const response = await fetch("/api/served-vault");
	const body: unknown = await response.json().catch(() => null);
	served = openingVaultIn(response.ok ? body : null);
}

/**
 * The vault an answer of `/api/served-vault` names.
 * @param body The answer, or null when the server refused.
 * @returns The vault.
 * @throws {Error} When the answer names no vault, or names none to open.
 */
function openingVaultIn(body: unknown): string {
	const vault = isRecord(body) ? body["vault"] : undefined;
	if (vault === null) {
		throw new Error(NO_OPENING_VAULT);
	}
	if (typeof vault !== "string" || vault === "") {
		throw new Error("The Archboard server did not say which vault a page opens in.");
	}
	return vault;
}

/**
 * The vault a page opens in, where a pane opens by default.
 * @returns The vault.
 * @throws {Error} Before the page has learned it, which page start does first.
 */
function servedVault(): string {
	if (served === null) {
		throw new Error("The page asked for the served vault before it learned it.");
	}
	return served;
}

/**
 * A request URL that names a vault, as every call does that reads or writes a
 * board (ADR 0049). Each pane names its own: two panes can show two repositories.
 * @param url The endpoint, with or without a query.
 * @param vault The vault the call is about.
 * @returns The URL with `vault=` on its query.
 */
function inVault(url: string, vault: string): string {
	return `${url}${url.includes("?") ? "&" : "?"}vault=${encodeURIComponent(vault)}`;
}

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

/** One JSON request: GET unless it names a method, with a JSON body when it carries a payload. */
interface JsonRequest {
	readonly method?: "GET" | "POST" | "PUT" | "DELETE";
	/** The body, serialised as JSON. */
	readonly payload?: unknown;
	/** Cancels the request. */
	readonly signal?: AbortSignal | undefined;
}

/**
 * The fetch options of one JSON request.
 * @param asked The request.
 * @returns The fetch options.
 */
function fetchOptions(asked: JsonRequest): RequestInit {
	return {
		...(asked.method === undefined ? {} : { method: asked.method }),
		...(asked.payload === undefined
			? {}
			: {
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(asked.payload),
				}),
		...(asked.signal === undefined ? {} : { signal: asked.signal }),
	};
}

/**
 * Make one JSON request, throwing when the server refuses.
 * @param url The endpoint.
 * @param asked The method, payload and cancellation; a plain GET when absent.
 * @returns The decoded reply, trusted to be the endpoint's contract.
 */
async function requestJson<T>(url: string, asked: JsonRequest = {}): Promise<T> {
	const response = await fetch(url, fetchOptions(asked));
	const body = await readBody(response);
	const record = isRecord(body) ? body : null;
	if (refused(response, record)) {
		throw plainFailure(record, asked.method ?? "GET", url, response.status);
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

/** A Zod-shaped parser for one reply schema. */
interface ReplySchema<T> {
	safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/**
 * Fetch a reply that must match a schema exactly: a success schema on a 2xx,
 * the failure schema otherwise. Anything else is reported as invalid.
 * @param url The endpoint.
 * @param asked The method, payload and cancellation; a plain GET when absent.
 * @param successSchema The schema a 2xx body must satisfy.
 * @param failureSchema The schema a non-2xx body must satisfy.
 * @param invalid Builds the failure reported for an unparseable reply.
 * @returns The parsed success or failure.
 */
async function strictReply<T, F>(
	url: string,
	asked: JsonRequest | undefined,
	successSchema: ReplySchema<T>,
	failureSchema: ReplySchema<F>,
	invalid: (error?: unknown) => F,
): Promise<T | F> {
	try {
		const response = await fetch(url, asked === undefined ? undefined : fetchOptions(asked));
		const body: unknown = await response.json();
		const parsed = response.ok ? successSchema.safeParse(body) : failureSchema.safeParse(body);
		return parsed.success ? parsed.data : invalid();
	} catch (error) {
		return invalid(error);
	}
}

export { inVault, learnServedVault, requestJson, servedVault, strictReply, type ReplySchema };
