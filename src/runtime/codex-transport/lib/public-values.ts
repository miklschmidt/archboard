/** Clone JSON-shaped data so one public listener cannot poison another. */
function cloneAndFreeze<T>(value: T): T {
	const seen = new WeakMap<object, unknown>();
	const copy = (current: unknown): unknown => {
		if (current === null || typeof current !== "object") {
			return current;
		}
		const existing = seen.get(current);
		if (existing !== undefined) {
			return existing;
		}
		if (Array.isArray(current)) {
			const array: unknown[] = [];
			seen.set(current, array);
			for (const item of current) {
				array.push(copy(item));
			}
			return Object.freeze(array);
		}
		const object: Record<string, unknown> = {};
		seen.set(current, object);
		for (const key of Object.keys(current)) {
			Object.defineProperty(object, key, {
				configurable: false,
				enumerable: true,
				value: copy((current as Record<string, unknown>)[key]),
				writable: false,
			});
		}
		return Object.freeze(object);
	};
	return copy(value) as T;
}

function jsonByteLength(value: unknown): number {
	const encoded = JSON.stringify(value);
	return encoded === undefined ? 0 : Buffer.byteLength(encoded, "utf8");
}

export { cloneAndFreeze, jsonByteLength };
