type BrowserCsrfKind = "settings-read" | "mutation";

interface BrowserCsrfHeaders {
	host?: string;
	origin?: string;
	referer?: string;
	secFetchSite?: string;
}

type BrowserCsrfResult = { ok: true } | { ok: false; code: "CROSS_ORIGIN_REFUSED"; error: string };

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Lower-cases a hostname and strips the brackets an IPv6 literal carries in a URL.
 * @param hostname A hostname as the URL parser reports it.
 * @returns The comparable hostname.
 */
function normalizeHostname(hostname: string): string {
	const lowered = hostname.toLowerCase();
	return lowered.startsWith("[") && lowered.endsWith("]") ? lowered.slice(1, -1) : lowered;
}

/**
 * Tells whether a URL carries user-info, which no browser-sent header may.
 * @param url A parsed header URL.
 * @returns True when a username or password is present.
 */
function hasCredentials(url: URL): boolean {
	return url.username !== "" || url.password !== "";
}

/**
 * Tells whether a URL is a bare origin: no path beyond "/", no query, no fragment.
 * @param url A parsed header URL.
 * @returns True when nothing but the origin is present.
 */
function isBareOrigin(url: URL): boolean {
	return url.pathname === "/" && url.search === "" && url.hash === "";
}

/**
 * Tells whether a hostname is one of the accepted loopback names.
 * @param hostname A normalized hostname, or null when a header was absent or malformed.
 * @returns True only for a loopback hostname.
 */
function isLoopback(hostname: string | null): boolean {
	return hostname !== null && LOOPBACK_HOSTS.has(hostname);
}

/**
 * Reads the hostname out of a Host header, refusing anything beyond an authority.
 * @param value The Host header value.
 * @returns The normalized hostname, or null when absent or not a plain authority.
 */
function authorityHostname(value: string | undefined): string | null {
	if (!value) {
		return null;
	}
	try {
		const url = new URL(`http://${value}`);
		if (hasCredentials(url) || !isBareOrigin(url)) {
			return null;
		}
		return normalizeHostname(url.hostname);
	} catch {
		return null;
	}
}

/**
 * Parses a browser-sent absolute URL, accepting only http(s) origins.
 * @param value The Origin or Referer header value.
 * @returns The parsed URL, or null when absent, opaque ("null") or not http(s).
 */
function parseHttpUrl(value: string | undefined): URL | null {
	if (!value || value === "null") {
		return null;
	}
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:" ? url : null;
	} catch {
		return null;
	}
}

/**
 * Reads the hostname out of an Origin or Referer header.
 * @param value The header value.
 * @param allowLocation Whether a path, query or fragment may follow the origin (a Referer does).
 * @returns The normalized hostname, or null when the header is unusable.
 */
function urlHostname(value: string | undefined, allowLocation: boolean): string | null {
	const url = parseHttpUrl(value);
	if (!url || hasCredentials(url)) {
		return null;
	}
	if (!allowLocation && !isBareOrigin(url)) {
		return null;
	}
	return normalizeHostname(url.hostname);
}

/**
 * Builds the refusal result the guard answers with.
 * @param error The reason the request is refused.
 * @returns A failed CSRF result.
 */
function refused(error: string): BrowserCsrfResult {
	return { ok: false, code: "CROSS_ORIGIN_REFUSED", error };
}

/**
 * Judges a settings read, which a browser may send with an Origin or only a Referer.
 * @param headers The browser-sent headers.
 * @param origin The already parsed Origin hostname.
 * @returns The CSRF verdict for the read.
 */
function checkSettingsRead(headers: BrowserCsrfHeaders, origin: string | null): BrowserCsrfResult {
	if (headers.origin !== undefined) {
		return isLoopback(origin) ? { ok: true } : refused("The settings Origin is not loopback.");
	}
	const referer = urlHostname(headers.referer, true);
	return isLoopback(referer)
		? { ok: true }
		: refused("A settings read requires a loopback Origin or Referer.");
}

/**
 * Judges whether a request's headers prove it came from a same-origin loopback page.
 * @param kind Whether the route reads settings or mutates state; mutations demand an Origin.
 * @param headers The browser-sent headers that matter to the verdict.
 * @returns The CSRF verdict.
 */
function checkBrowserCsrf(kind: BrowserCsrfKind, headers: BrowserCsrfHeaders): BrowserCsrfResult {
	// This protects browsers against CSRF. It does not authenticate a local process
	// that can forge the accepted loopback headers.
	const host = authorityHostname(headers.host);
	if (!isLoopback(host)) {
		return refused("The request Host is not loopback.");
	}
	if (headers.secFetchSite !== "same-origin") {
		return refused("Sec-Fetch-Site must be same-origin.");
	}
	const origin = urlHostname(headers.origin, false);
	if (kind === "mutation") {
		return isLoopback(origin) ? { ok: true } : refused("A mutation requires a loopback Origin.");
	}
	return checkSettingsRead(headers, origin);
}

export { type BrowserCsrfKind, type BrowserCsrfHeaders, type BrowserCsrfResult, checkBrowserCsrf };
