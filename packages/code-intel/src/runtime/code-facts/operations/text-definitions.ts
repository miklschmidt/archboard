// The definitions of one file's text, as code facts read them (ADR 0046, ADR 0080).
//
// The code browser quotes a whole file, and shows each symbol a module binds. The definitions
// come from the text it quotes, never from a second read of the disk, so a line number always
// matches the text beside it. The file is read alone: its imports stay unresolved, which a
// definition never needs. A file no grammar reads has none.

import type { Definition } from "#runtime/code-facts/operations/facts.ts";
import { createSourceFacts } from "#runtime/code-facts/services/reader.ts";

/** One cache for the browser: a file is parsed again only when its text changes. */
const sourceFacts = createSourceFacts();

/**
 * The definitions of a file's text.
 * @param root The checkout's root, which names the cache entry.
 * @param file The file, relative to the checkout, with `/` between names.
 * @param text The file's text.
 * @param signal Ends the reading when the request is abandoned.
 * @returns The definitions in source order; none for a file no grammar reads.
 * @throws {unknown} The signal's reason, when it ends the reading.
 */
async function definitionsOfText(
	root: string,
	file: string,
	text: string,
	signal: AbortSignal,
): Promise<readonly Definition[]> {
	const checkout = { root, files: new Set([file]) };
	const facts = await sourceFacts
		.pass(checkout, new Map([[file, text]]), signal)
		.read(checkout, file);
	return facts === undefined || facts.adapter === "text" ? [] : facts.definitions;
}

export { definitionsOfText };
