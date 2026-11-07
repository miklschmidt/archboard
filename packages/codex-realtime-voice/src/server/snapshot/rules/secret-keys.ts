// The keys whose values are secrets, for everything bound for the browser: a
// projection input carrying one is refused, and a value handed through as data
// (a tool call's arguments) has them redacted.

const SECRET_KEYS: ReadonlySet<string> = new Set([
	"apiKey",
	"accessToken",
	"secretAccessKey",
	"sessionToken",
	"password",
	"refreshToken",
]);

/** What a redacted secret reads as. */
const REDACTED = "[redacted]";

/**
 * Whether any object reachable from the value carries a key that names a secret.
 * @param value The value to search.
 * @param seen Objects already visited, so a cycle terminates.
 * @returns True when a secret-bearing key is present anywhere.
 */
function containsSecretKey(value: unknown, seen = new Set<object>()): boolean {
	if (value === null || typeof value !== "object" || seen.has(value)) return false;
	seen.add(value);
	if (Array.isArray(value)) return value.some((entry) => containsSecretKey(entry, seen));
	return Object.entries(value).some(
		([key, entry]) => SECRET_KEYS.has(key) || containsSecretKey(entry, seen),
	);
}

/**
 * A copy of a JSON value with the value of every secret-named key, at any
 * depth, replaced by a marker.
 * @param value The JSON value.
 * @returns The redacted copy.
 */
function redactSecrets(value: unknown): unknown {
	if (value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map(redactSecrets);
	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [
			key,
			SECRET_KEYS.has(key) ? REDACTED : redactSecrets(entry),
		]),
	);
}

export { containsSecretKey, redactSecrets };
