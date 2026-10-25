/**
 * Serialize a value with every object's keys in a deterministic order. An absent value is what
 * `JSON.stringify` makes of it: an object leaves its key out, and an array holds null, also for a
 * hole.
 * @param value The value.
 * @returns Its canonical JSON.
 */
function canonicalJson(value: unknown): string {
	if (value === undefined) return "null";
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${Array.from(value, canonicalJson).join(",")}]`;
	return `{${Object.entries(value)
		.filter(([, item]) => item !== undefined)
		.toSorted(([a], [b]) => a.localeCompare(b))
		.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
		.join(",")}}`;
}

export { canonicalJson };
