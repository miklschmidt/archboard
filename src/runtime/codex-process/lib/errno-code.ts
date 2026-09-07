/**
 * Read the errno-style `code` of a thrown value without trusting its shape.
 * Node file-system and process failures carry a string code; anything else
 * (a plain Error, a non-object) reads as no code, so callers compare against
 * "ENOENT" or "EEXIST" and otherwise treat the failure as unexplained.
 * @param cause - The caught value.
 * @returns The string code when present, otherwise undefined.
 */
function errnoCode(cause: unknown): string | undefined {
	if (typeof cause !== "object" || cause === null || !("code" in cause)) return undefined;
	const { code } = cause;
	return typeof code === "string" ? code : undefined;
}

export { errnoCode };
