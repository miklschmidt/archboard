// Installing a library somebody found on the web.
//
// The flow is Excalidraw's, not ours: the "Browse libraries" button opens
// libraries.excalidraw.com with a referrer pointing back here, and "Add to
// Excalidraw" returns to that referrer with `#addLibrary=<url>&token=<id>`.
// The host app is expected to fetch that URL and put what comes back in the
// library. Until now archboard did nothing with the hash, so the button looked
// broken; this module is the missing half.
//
// It is also the one place where the app fetches a URL a web page handed it,
// so the policy is here rather than spread across callers:
//
//   * https only. Excalidraw's own validator compares host and path and never
//     looks at the scheme, so http://excalidraw.com/… passes it.
//   * The host must be excalidraw.com (or a subdomain of it), or the
//     excalidraw-libraries repository on raw.githubusercontent.com. That is the
//     same allowlist Excalidraw ships, and it is what the Browse button can
//     actually send us back to. A URL from anywhere else is refused with the
//     host named, rather than fetched and then judged.
//   * The allowlist is checked again against the URL the response actually came
//     from, so a redirect cannot walk out of it.
//   * No credentials, and a size cap, because "it is only JSON" stops being
//     reassuring at a gigabyte.
//   * What comes back is parsed as JSON and handed to Excalidraw's own
//     `restoreLibraryItems`, which is what normalises the elements and runs
//     every element link through its URL sanitiser. It is never evaluated and
//     never stored in the shape it arrived in.
//
// And then the human is asked. Excalidraw skips its own confirm when the token
// in the hash matches the Excalidraw instance that opened the library site —
// the argument being that you clicked the button yourself. We prompt anyway:
// the token is a value from the same untrusted hash as the URL, the round trip
// goes through a third-party site, and one dialog is a small price for never
// silently installing 800 shapes from a link.

import { parseLibraryTokensFromUrl, restoreLibraryItems } from "@excalidraw/excalidraw";
import type { LibraryItems } from "@excalidraw/excalidraw/types";

/** Host, plus an optional path prefix it is confined to. */
const ALLOWED_SOURCES: Array<{ host: string; prefix?: string }> = [
	{ host: "excalidraw.com" },
	{ host: "raw.githubusercontent.com", prefix: "/excalidraw/excalidraw-libraries/" },
];

const MAX_LIBRARY_BYTES = 8 * 1024 * 1024;

function hostMatches(hostname: string, allowed: string): boolean {
	return hostname === allowed || hostname.endsWith(`.${allowed}`);
}

/**
 * The URL to fetch, or a thrown explanation of why we will not fetch it.
 * Exported so the refusal can be tested without a network.
 */
export function validateLibrarySource(candidate: string): URL {
	let url: URL;
	try {
		url = new URL(candidate);
	} catch {
		throw new Error(`That library link is not a URL: ${candidate}`);
	}
	if (url.protocol !== "https:") {
		throw new Error(
			`Refusing to install a library over ${url.protocol.replace(":", "")} — https only.`,
		);
	}
	const allowed = ALLOWED_SOURCES.some(
		(source) =>
			hostMatches(url.hostname, source.host) &&
			(!source.prefix || url.pathname.startsWith(source.prefix)),
	);
	if (!allowed) {
		throw new Error(
			`Refusing to install a library from ${url.hostname}. archboard fetches libraries only from ` +
				"excalidraw.com and the excalidraw-libraries repository. Download the .excalidrawlib and " +
				"drop it on the canvas if you trust it.",
		);
	}
	return url;
}

/** What the hash is asking us to install, or null when it is asking nothing. */
export function pendingLibraryUrl(): string | null {
	return parseLibraryTokensFromUrl()?.libraryUrl ?? null;
}

/**
 * Take the request out of the address bar.
 *
 * Called whether the install succeeded, failed or was declined: a hash that
 * stays put would reinstall on the next reload, and the URL is not a record of
 * what happened.
 */
export function clearLibraryHash(): void {
	const params = new URLSearchParams(window.location.hash.slice(1));
	if (!params.has("addLibrary")) return;
	params.delete("addLibrary");
	params.delete("token");
	const rest = params.toString();
	window.history.replaceState({}, "", rest ? `#${rest}` : window.location.pathname);
}

export interface FetchedLibrary {
	url: URL;
	items: LibraryItems;
}

/** Fetch and normalise a library. Throws with something sayable out loud. */
export async function fetchLibraryFrom(candidate: string): Promise<FetchedLibrary> {
	const url = validateLibrarySource(decodeURIComponent(candidate));

	const response = await fetch(url.href, {
		credentials: "omit",
		referrerPolicy: "no-referrer",
		headers: { Accept: "application/json, text/plain, */*" },
	});
	if (!response.ok) {
		throw new Error(`${url.hostname} answered ${response.status} for that library.`);
	}
	// A redirect is allowed to move us, but not out of the allowlist.
	if (response.url) validateLibrarySource(response.url);

	const declared = Number(response.headers.get("content-length") ?? "0");
	if (declared > MAX_LIBRARY_BYTES) {
		throw new Error(
			`That library is ${Math.round(declared / 1024 / 1024)}MB. Refusing to load it.`,
		);
	}
	const text = await response.text();
	if (text.length > MAX_LIBRARY_BYTES) {
		throw new Error("That library is larger than 8MB. Refusing to load it.");
	}

	let parsed: any;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error(`${url.hostname} did not return a library file.`);
	}
	if (parsed?.type !== "excalidrawlib") {
		throw new Error(`${url.pathname.split("/").pop()} is not an .excalidrawlib file.`);
	}

	// Both published formats reach this point: version 1 is a bare array of
	// element arrays, version 2 wraps each in an item. restoreLibraryItems reads
	// both and is the only thing that touches the elements themselves.
	const items = restoreLibraryItems(parsed.libraryItems ?? parsed.library ?? [], "published");
	if (items.length === 0) {
		throw new Error("That library has nothing in it.");
	}
	return { url, items };
}
