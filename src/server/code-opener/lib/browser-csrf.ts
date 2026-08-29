export type BrowserCsrfKind = "settings-read" | "mutation";

export interface BrowserCsrfHeaders {
	host?: string;
	origin?: string;
	referer?: string;
	secFetchSite?: string;
}

export type BrowserCsrfResult =
	| { ok: true }
	| { ok: false; code: "CROSS_ORIGIN_REFUSED"; error: string };

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeHostname(hostname: string): string {
	const lowered = hostname.toLowerCase();
	return lowered.startsWith("[") && lowered.endsWith("]") ? lowered.slice(1, -1) : lowered;
}

function authorityHostname(value: string | undefined): string | null {
	if (!value) return null;
	try {
		const url = new URL(`http://${value}`);
		if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
		return normalizeHostname(url.hostname);
	} catch {
		return null;
	}
}

function urlHostname(value: string | undefined, allowLocation: boolean): string | null {
	if (!value || value === "null") return null;
	try {
		const url = new URL(value);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		if (url.username || url.password) return null;
		if (!allowLocation && (url.pathname !== "/" || url.search || url.hash)) return null;
		return normalizeHostname(url.hostname);
	} catch {
		return null;
	}
}

function refused(error: string): BrowserCsrfResult {
	return { ok: false, code: "CROSS_ORIGIN_REFUSED", error };
}

export function checkBrowserCsrf(
	kind: BrowserCsrfKind,
	headers: BrowserCsrfHeaders,
): BrowserCsrfResult {
	const host = authorityHostname(headers.host);
	if (!host || !LOOPBACK_HOSTS.has(host)) return refused("The request Host is not loopback.");
	if (headers.secFetchSite !== "same-origin") {
		return refused("Sec-Fetch-Site must be same-origin.");
	}
	const origin = urlHostname(headers.origin, false);
	if (kind === "mutation") {
		return origin && LOOPBACK_HOSTS.has(origin)
			? { ok: true }
			: refused("A mutation requires a loopback Origin.");
	}
	if (headers.origin !== undefined) {
		return origin && LOOPBACK_HOSTS.has(origin)
			? { ok: true }
			: refused("The settings Origin is not loopback.");
	}
	const referer = urlHostname(headers.referer, true);
	return referer && LOOPBACK_HOSTS.has(referer)
		? { ok: true }
		: refused("A settings read requires a loopback Origin or Referer.");
}
