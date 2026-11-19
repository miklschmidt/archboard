// Fixtures read through the contract's own operation, as a vault's files are:
// a fixture the contract refuses fails the test that builds it.

import { parseDocument, type DocumentKind, type ModelDocument } from "@archboard/model-contract";

/**
 * The document a fixture writes, read as the contract reads it.
 * @param kind The kind of document.
 * @param raw The fixture as written.
 * @returns The document.
 * @throws When the contract refuses the fixture, with the contract's reason.
 */
function fixtureDocument<K extends DocumentKind>(kind: K, raw: unknown): ModelDocument<K> {
	const parsed = parseDocument(kind, raw);
	if (parsed.success) return parsed.data;
	const { error } = parsed;
	throw typeof error === "string" ? new Error(error) : error;
}

export { fixtureDocument };
