// The two digests of a render recipe: of what a picture is drawn from, and of
// the picture itself.

import { createHash } from "node:crypto";

/**
 * A value as JSON with every object's keys in order, so two reads of one board
 * spell it the same whichever order a file or a schema gave the keys. Arrays
 * keep their order, because the order of parts and relationships is drawn.
 * @param value A JSON value.
 * @returns Its canonical text.
 */
function canonicalJson(value: unknown): string {
	return JSON.stringify(value, (_key, held: unknown) =>
		typeof held === "object" && held !== null && !Array.isArray(held)
			? Object.fromEntries(
					Object.entries(held).toSorted(([one], [other]) =>
						one < other ? -1 : one > other ? 1 : 0,
					),
				)
			: held,
	);
}

/**
 * The SHA-256 digest of some text, spelled with its algorithm.
 * @param text The text.
 * @returns `sha256:` and the digest in hex.
 */
function sha256Of(text: string): string {
	return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

/**
 * The fingerprint of what a picture is drawn from.
 * @param input The drawn input that the board answer names.
 * @returns Its digest.
 */
function inputFingerprint(input: unknown): string {
	return sha256Of(canonicalJson(input));
}

export { inputFingerprint, sha256Of };
