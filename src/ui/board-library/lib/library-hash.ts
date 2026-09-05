// The `#addLibrary=` request in the address bar: reading it, naming what it
// asks for, and taking it out again so a reload never re-runs an install.

import { parseLibraryTokensFromUrl } from "@excalidraw/excalidraw";

/**
 * What the hash is asking us to install.
 * @returns The library URL, or null when it is asking nothing.
 */
function pendingLibraryUrl(): string | null {
	return parseLibraryTokensFromUrl()?.libraryUrl ?? null;
}

/**
 * Take the request out of the address bar. Called whether the install
 * succeeded, failed or was declined: the URL is not a record of what happened.
 */
function clearLibraryHash(): void {
	const params = new URLSearchParams(window.location.hash.slice(1));
	if (!params.has("addLibrary")) {
		return;
	}
	params.delete("addLibrary");
	params.delete("token");
	const rest = params.toString();
	window.history.replaceState({}, "", rest === "" ? window.location.pathname : `#${rest}`);
}

/**
 * A readable name for a library, from its file name.
 * @param url The library's URL.
 * @returns The file name without its extension, dashes and underscores as spaces.
 */
function libraryName(url: URL): string {
	const file = url.pathname.split("/").findLast((segment) => segment !== "") ?? "library";
	return file.replace(/\.excalidrawlib$/, "").replaceAll(/[-_]/g, " ");
}

export { clearLibraryHash, libraryName, pendingLibraryUrl };
