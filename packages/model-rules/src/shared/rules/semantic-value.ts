/**
 * Whether two semantic values say the same thing.
 *
 * Records compare by their defined keys and values rather than insertion order;
 * an own `undefined` property is equivalent to JSON's absent property. Arrays
 * remain ordered because order is semantic unless a caller explicitly
 * normalizes it first.
 * @param one A semantic value.
 * @param other The other semantic value.
 * @returns True when the two values are structurally equal.
 */
function sameSemanticValue(one: unknown, other: unknown): boolean {
	if (Object.is(one, other)) {
		return true;
	}
	if (Array.isArray(one)) {
		return sameSemanticArray(one, other);
	}
	if (Array.isArray(other)) {
		return false;
	}
	if (!isRecord(one) || !isRecord(other)) {
		return false;
	}
	return sameSemanticRecord(one, other);
}

/**
 * Whether an array is structurally equal to another value.
 * @param one The known array.
 * @param other The candidate array.
 * @returns True when both arrays hold the same values in the same order.
 */
function sameSemanticArray(one: readonly unknown[], other: unknown): boolean {
	if (!Array.isArray(other) || one.length !== other.length) {
		return false;
	}
	return one.every((value, index) => sameSemanticValue(value, other[index]));
}

/**
 * Whether two semantic records hold the same keys and values.
 * @param one One record.
 * @param other The other record.
 * @returns True when key insertion order is their only possible difference.
 */
function sameSemanticRecord(
	one: Readonly<Record<string, unknown>>,
	other: Readonly<Record<string, unknown>>,
): boolean {
	const oneKeys = definedKeys(one);
	const otherKeys = definedKeys(other);
	return (
		oneKeys.length === otherKeys.length &&
		oneKeys.every(
			(key, index) => key === otherKeys[index] && sameSemanticValue(one[key], other[key]),
		)
	);
}

/**
 * A semantic record's JSON-visible keys in deterministic order.
 * @param value The record.
 * @returns Keys whose values survive JSON object serialization.
 */
function definedKeys(value: Readonly<Record<string, unknown>>): string[] {
	return Object.keys(value)
		.filter((key) => value[key] !== undefined)
		.toSorted();
}

/**
 * Whether a value is a non-null record.
 * @param value The candidate.
 * @returns True for a record value.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null;
}

export { sameSemanticValue };
