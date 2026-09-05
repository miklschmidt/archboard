// The one check the library dialog makes before it offers to install: the
// source must be an https URL. It is never fetched here.

import type { LibrarySourceCheck } from "@/ui/board-dialogs/lib/contracts";

/**
 * Check a library source as the `#addLibrary` request supplied it.
 * @param source The raw source string.
 * @returns The normalised URL, or why it was refused.
 */
function checkLibrarySource(source: string): LibrarySourceCheck {
	const trimmed = source.trim();
	if (trimmed === "") {
		return { ok: false, message: "The request named no library source." };
	}
	if (!URL.canParse(trimmed)) {
		return { ok: false, message: "The library source is not a URL." };
	}
	const url = new URL(trimmed);
	if (url.protocol !== "https:") {
		return { ok: false, message: "Libraries are only installed from https URLs." };
	}
	if (url.username !== "" || url.password !== "") {
		return { ok: false, message: "A library source cannot carry credentials." };
	}
	return { ok: true, url: url.href };
}

export { checkLibrarySource };
