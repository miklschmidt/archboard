/**
 * Clone protocol-shaped values so callers cannot mutate retained workhorse state.
 * @param value - The value to copy.
 * @returns A deeply frozen copy.
 */
function cloneAndFreeze<T>(value: T): T {
	return deepFreeze(structuredClone(value), new WeakSet<object>());
}

/**
 * Freeze a value and everything reachable from it, remembering what has been seen so a cyclic
 * structure terminates.
 * @param value - The value to freeze.
 * @param seen - The objects already frozen on this walk.
 * @returns The same value, frozen.
 */
function deepFreeze<T>(value: T, seen: WeakSet<object>): T {
	if (value === null || typeof value !== "object") {
		return value;
	}
	if (seen.has(value)) {
		return value;
	}
	seen.add(value);
	for (const key of Reflect.ownKeys(value)) {
		deepFreeze(Reflect.get(value, key), seen);
	}
	return Object.freeze(value);
}

export { cloneAndFreeze };
