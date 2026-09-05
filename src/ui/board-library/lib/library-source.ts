// Fetching a library somebody found on the web. The one place the app
// fetches a URL a web page handed it, so the policy is here: https only, an
// allowlist checked before the fetch and again on the response URL so a
// redirect cannot walk out of it, no credentials, a size cap, and what comes
// back handed to Excalidraw's own `restoreLibraryItems`, never evaluated.

import { restoreLibraryItems } from "@excalidraw/excalidraw";
import type { LibraryItems } from "@excalidraw/excalidraw/types";

/** Host, plus an optional path prefix it is confined to. */
interface AllowedSource {
	host: string;
	prefix?: string;
}

/** The same allowlist Excalidraw ships, and what its Browse button can send back. */
const ALLOWED_SOURCES: readonly AllowedSource[] = [
	{ host: "excalidraw.com" },
	{ host: "raw.githubusercontent.com", prefix: "/excalidraw/excalidraw-libraries/" },
];

const MAX_LIBRARY_BYTES = 8 * 1024 * 1024;

/** A fetched, normalised library and where it came from. */
interface FetchedLibrary {
	url: URL;
	items: LibraryItems;
}

/**
 * Whether a hostname is an allowed host or a subdomain of it.
 * @param hostname The URL's host.
 * @param allowed The allowed host.
 * @returns True when it matches.
 */
function hostMatches(hostname: string, allowed: string): boolean {
	return hostname === allowed || hostname.endsWith(`.${allowed}`);
}

/**
 * Whether a URL is inside the allowlist.
 * @param url The URL.
 * @returns True when its host and path are allowed.
 */
function isAllowed(url: URL): boolean {
	return ALLOWED_SOURCES.some(
		(source) =>
			hostMatches(url.hostname, source.host) &&
			(source.prefix === undefined || url.pathname.startsWith(source.prefix)),
	);
}

/**
 * The URL to fetch, or a thrown explanation of why it will not be fetched.
 * @param candidate The library link as the hash supplied it.
 * @returns The validated URL.
 * @throws {Error} When the link is not a URL, not https, or not on the allowlist.
 */
function validateLibrarySource(candidate: string): URL {
	if (!URL.canParse(candidate)) {
		throw new Error(`That library link is not a URL: ${candidate}`);
	}
	const url = new URL(candidate);
	if (url.protocol !== "https:") {
		throw new Error(
			`Refusing to install a library over ${url.protocol.replace(":", "")} — https only.`,
		);
	}
	if (!isAllowed(url)) {
		throw new Error(
			`Refusing to install a library from ${url.hostname}. archboard fetches libraries only from ` +
				"excalidraw.com and the excalidraw-libraries repository. Download the .excalidrawlib and " +
				"drop it on the canvas if you trust it.",
		);
	}
	return url;
}

/**
 * Fetch the library's text, refusing a failed answer or an oversized one.
 * @param url The validated URL.
 * @returns The response text.
 * @throws {Error} When the answer is not ok, redirects out of the allowlist, or is too large.
 */
async function fetchLibraryText(url: URL): Promise<string> {
	const response = await fetch(url.href, {
		credentials: "omit",
		referrerPolicy: "no-referrer",
		headers: { Accept: "application/json, text/plain, */*" },
	});
	if (!response.ok) {
		throw new Error(`${url.hostname} answered ${response.status} for that library.`);
	}
	// A redirect is allowed to move us, but not out of the allowlist.
	if (response.url !== "") {
		validateLibrarySource(response.url);
	}
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
	return text;
}

/**
 * The library document's items, in either published format. Version 1 is a
 * bare array of element arrays; version 2 wraps each in an item.
 * @param url The library's URL, for the error.
 * @param text The response text.
 * @returns The raw items, for `restoreLibraryItems`.
 * @throws {Error} When the text is not an `.excalidrawlib` document.
 */
function libraryDocumentItems(url: URL, text: string): RawLibraryItems {
	const record = parseDocument(url, text);
	if (record["type"] !== "excalidrawlib") {
		throw new Error(`${url.pathname.split("/").pop() ?? ""} is not an .excalidrawlib file.`);
	}
	const items = record["libraryItems"] ?? record["library"];
	// The file is untrusted JSON; `restoreLibraryItems` is what normalises it,
	// and it is typed over the published formats rather than over unknown. The
	// assertion widens an `any[]` from `Array.isArray`, which is why no unsafe
	// assertion is reported here.
	return (Array.isArray(items) ? items : []) as RawLibraryItems;
}

/** What `restoreLibraryItems` accepts: either published library format. */
type RawLibraryItems = NonNullable<Parameters<typeof restoreLibraryItems>[0]>;

/**
 * The response as a JSON object.
 * @param url The library's URL, for the error.
 * @param text The response text.
 * @returns The document's fields, empty when the JSON is not an object.
 * @throws {Error} When the text is not JSON.
 */
function parseDocument(url: URL, text: string): Readonly<Record<string, unknown>> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error(`${url.hostname} did not return a library file.`);
	}
	const document = typeof parsed === "object" && parsed !== null ? parsed : {};
	return Object.fromEntries(Object.entries(document));
}

/**
 * Fetch and normalise a library. Throws with something sayable out loud.
 * @param candidate The library link as the hash supplied it.
 * @returns The library and its URL.
 * @throws {Error} When the library cannot be fetched, read, or is empty.
 */
async function fetchLibraryFrom(candidate: string): Promise<FetchedLibrary> {
	const url = validateLibrarySource(decodeURIComponent(candidate));
	const text = await fetchLibraryText(url);
	// `restoreLibraryItems` reads both formats and is the only thing that
	// touches the elements, running every link through Excalidraw's sanitiser.
	const items = restoreLibraryItems(libraryDocumentItems(url, text), "published");
	if (items.length === 0) {
		throw new Error("That library has nothing in it.");
	}
	return { url, items };
}

export { fetchLibraryFrom, validateLibrarySource, type FetchedLibrary };
