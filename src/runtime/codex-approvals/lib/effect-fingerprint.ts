import { createHash } from "node:crypto";

/**
 * Serialises a value as JSON with object keys in sorted order, so two
 * requests with the same content fingerprint identically whatever order Codex
 * emitted their keys in.
 * @param value - Any JSON-compatible value.
 * @returns The canonical JSON text.
 */
function stableJson(value: unknown): string {
	if (value === null || typeof value !== "object") {
		// The lib typing promises a string, but JSON.stringify yields undefined
		// for undefined, functions and symbols; that case must serialise as null.
		const primitive: string | undefined = JSON.stringify(value);
		return primitive === undefined ? "null" : primitive;
	}
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	return `{${Object.keys(value)
		.toSorted()
		.map((key) => `${JSON.stringify(key)}:${stableJson(Reflect.get(value, key))}`)
		.join(",")}}`;
}

/**
 * Hashes a request's method and parameters into the effect fingerprint a
 * binding carries, so a changed effect is detected as a different binding.
 * @param params - The method and parameters to fingerprint.
 * @returns The hex SHA-256 digest of the canonical JSON.
 */
function effectFingerprint(params: unknown): string {
	return createHash("sha256").update(stableJson(params), "utf8").digest("hex");
}

export { effectFingerprint, stableJson };
