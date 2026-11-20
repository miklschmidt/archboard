import { createHash } from "node:crypto";
import { parseTabSessionId, type TabSessionId } from "#server/tab-session/rules/tab-session.ts";

// The one admission rule of a socket whose identity comes from its upgrade request: which
// origins may open it, and the tab session, chat and browser id its URL names. `connect` applies
// it to a `{ request }` route, and the Bun adapter applies it before the upgrade, so a refusal is
// the same rule in both places.

const CHAT_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** The parts of an upgrade request that admission reads. */
export interface UpgradeRequest {
	/** The request URL, absolute, as the server received it. */
	readonly url: string;
	/** The request headers. `Host` and `Origin` are read. */
	readonly headers: Headers | Readonly<Record<string, string | string[] | undefined>>;
}

/** What an admitted upgrade names: its tab session, its chat and the browser id of both. */
export interface SocketSurface {
	readonly tabSessionId: TabSessionId;
	readonly chatId: string;
	readonly browserId: string;
}

/**
 * Refuse an origin that is not exactly an HTTP(S) origin: one with a path or a trailing slash
 * would refuse every browser.
 * @param origin An origin the agent admits.
 * @throws {TypeError} When it cannot match a browser socket.
 */
export function assertSocketOrigin(origin: string): void {
	const url = URL.canParse(origin) ? new URL(origin) : null;
	if (url === null || !["http:", "https:"].includes(url.protocol) || url.origin !== origin)
		throw new TypeError(
			`Name an origin exactly, such as https://voice.example.com, with no path, not ${origin}.`,
		);
}

/**
 * Refuse a socket path that is not absolute.
 * @param path The socket path.
 * @throws {TypeError} When it is not absolute.
 */
export function assertSocketPath(path: string): void {
	if (!path.startsWith("/"))
		throw new TypeError(`Name an absolute socket path, such as /voice, not ${path}.`);
}

/**
 * One header of a request, whichever way its headers are held.
 * @param headers The headers.
 * @param name The header, in lower case.
 * @returns Its value, or undefined when it is absent.
 */
function header(headers: UpgradeRequest["headers"], name: string): string | undefined {
	if (headers instanceof Headers) return headers.get(name) ?? undefined;
	const value = headers[name];
	return Array.isArray(value) ? value[0] : value;
}

/**
 * The hostname of a `Host` header value, with its port and brackets kept as written.
 * @param host The `Host` header.
 * @returns The hostname, or null when the value is no host.
 */
function hostnameOf(host: string): string | null {
	return URL.canParse(`http://${host}`) ? new URL(`http://${host}`).hostname : null;
}

/**
 * Whether an upgrade comes from a page this agent admits. A loopback `Host` admits its own
 * origin exactly, scheme and port included. Each listed origin admits itself and its host. An
 * upgrade without an `Origin` header, such as a local script's, passes when its `Host` does.
 * @param request The upgrade request.
 * @param origins The origins the agent admits beside its loopback default.
 * @returns True when the upgrade may open a socket.
 */
export function admitsOrigin(request: UpgradeRequest, origins: ReadonlySet<string>): boolean {
	const host = header(request.headers, "host");
	if (host === undefined || !URL.canParse(request.url)) return false;
	const loopback = isLoopback(host);
	if (!loopback && ![...origins].some((origin) => new URL(origin).host === host)) return false;
	const own = loopback ? `${new URL(request.url).protocol}//${host}` : null;
	return pageAdmitted(header(request.headers, "origin"), own, origins);
}

/**
 * Whether a `Host` header names a loopback address.
 * @param host The `Host` header.
 * @returns True for `127.0.0.1`, `localhost` and `[::1]`, on any port.
 */
function isLoopback(host: string): boolean {
	return LOOPBACK_HOSTNAMES.has(hostnameOf(host) ?? "");
}

/**
 * Whether an upgrade's `Origin` names a page the agent admits.
 * @param origin The `Origin` header, absent for a client that is no page.
 * @param own The request's own origin when its `Host` is a loopback address, else null.
 * @param origins The listed origins.
 * @returns True for no `Origin`, the own origin or a listed one.
 */
function pageAdmitted(
	origin: string | undefined,
	own: string | null,
	origins: ReadonlySet<string>,
): boolean {
	return origin === undefined || origin === own || origins.has(origin);
}

/**
 * Read the tab session and chat an upgrade's URL names, and derive the browser id from both, so a
 * chat that connects again replaces its earlier socket.
 * @param request The upgrade request.
 * @returns The surface, or null when either is missing or malformed.
 */
export function surfaceOf(request: UpgradeRequest): SocketSurface | null {
	if (!URL.canParse(request.url)) return null;
	const url = new URL(request.url);
	const tabSessionId = parseTabSessionId(url.searchParams.get("tabSessionId"));
	const chatId = url.searchParams.get("chatId");
	if (tabSessionId === null || chatId === null || !CHAT_ID.test(chatId)) return null;
	const browserId = createHash("sha256")
		.update(JSON.stringify([tabSessionId, chatId]))
		.digest("hex");
	return { tabSessionId, chatId, browserId };
}
