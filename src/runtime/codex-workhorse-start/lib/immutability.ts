/** Clone protocol-shaped values so callers cannot mutate retained workhorse state. */
export function cloneAndFreeze<T>(value: T): T {
	return deepFreeze(structuredClone(value), new WeakSet<object>());
}

function deepFreeze<T>(value: T, seen: WeakSet<object>): T {
	if (value === null || typeof value !== "object") return value;
	if (seen.has(value)) return value;
	seen.add(value);
	for (const key of Reflect.ownKeys(value)) deepFreeze(Reflect.get(value, key), seen);
	return Object.freeze(value);
}
