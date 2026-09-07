/**
 * Whether a value is a plain object record: not null and not an array. Every
 * untrusted envelope in this module passes through this guard before its
 * fields are read.
 * @param value Candidate of unknown origin.
 * @returns Whether the value can be read as a string-keyed record.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Whether an object owns exactly the listed keys: no extra own key (including
 * symbols) and no missing key. Exactness is how a reviewed envelope refuses
 * smuggled fields.
 * @param value Object whose own keys are inspected.
 * @param keys The complete expected key list.
 * @returns Whether the own keys and the expected keys are the same set.
 */
function hasExactKeys(value: object, keys: readonly string[]): boolean {
	return (
		Reflect.ownKeys(value).every((key) => typeof key === "string" && keys.includes(key)) &&
		keys.every((key) => Object.hasOwn(value, key))
	);
}

/**
 * Recursively freeze an object graph so an effect or identity cannot change
 * after it was hashed or approved. Already-frozen and primitive values are
 * returned untouched.
 * @param value Value to freeze in place.
 * @returns The same value, deeply frozen.
 */
function freezeDeep<Value>(value: Value): Value {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
		return value;
	}
	const children: readonly unknown[] = Object.values(value);
	for (const child of children) {
		freezeDeep(child);
	}
	return Object.freeze(value);
}

/**
 * Whether a value is a string with at least one character; identities and
 * wire fields are never allowed to be empty.
 * @param value Candidate of unknown origin.
 * @returns Whether the value is a non-empty string.
 */
function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

/**
 * Whether a value is the boolean `true`. Used to re-check literal `true`
 * fields on records supplied by host ports without trusting their static type.
 * @param value Candidate of unknown origin.
 * @returns Whether the value is exactly `true`.
 */
function isExactlyTrue(value: unknown): value is true {
	return value === true;
}

export { freezeDeep, hasExactKeys, isExactlyTrue, isNonEmptyString, isRecord };
