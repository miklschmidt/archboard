import { createHash } from "node:crypto";

/**
 * One scalar as fingerprint text.
 * @param value - The scalar value.
 * @returns Its JSON text, with the values JSON cannot represent written as null.
 */
function jsonScalarText(value: unknown): string {
	// The lib typing promises a string, but JSON.stringify yields undefined for undefined,
	// functions and symbols; a fingerprint must serialise those as null, not as "undefined".
	const primitive: unknown = JSON.stringify(value);
	return typeof primitive === "string" ? primitive : "null";
}

/**
 * Serialize a value with object keys in sorted order, so the same effect always fingerprints the
 * same way whatever order its fields arrived in.
 * @param value - The value to serialize.
 * @returns The stable JSON text.
 */
function stableJson(value: unknown): string {
	if (value === null || typeof value !== "object") {
		// The lib typing promises a string, but JSON.stringify yields undefined
		// for undefined, functions and symbols; that case must serialise as null.
		return jsonScalarText(value);
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
