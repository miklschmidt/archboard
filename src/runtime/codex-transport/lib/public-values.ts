import { encodeJsonText } from "@/runtime/codex-transport/lib/wire";

/**
 * Deep-copies JSON-shaped data into frozen objects so one public listener cannot poison
 * another through a shared reference. Repeated references are copied once and cycles survive.
 * @param value The JSON-shaped value to copy.
 * @returns A frozen structural copy with the same shape.
 */
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
		return Array.isArray(current) ? copyArray(current) : copyRecord(current);
	};
	const copyArray = (current: readonly unknown[]): readonly unknown[] => {
		const array: unknown[] = [];
		seen.set(current, array);
		for (const item of current) {
			array.push(copy(item));
		}
		return Object.freeze(array);
	};
	const copyRecord = (current: object): Readonly<Record<string, unknown>> => {
		const object: Record<string, unknown> = {};
		seen.set(current, object);
		const entries: readonly (readonly [string, unknown])[] = Object.entries(current);
		for (const [key, item] of entries) {
			Object.defineProperty(object, key, {
				configurable: false,
				enumerable: true,
				value: copy(item),
				writable: false,
			});
		}
		return Object.freeze(object);
	};
	// The copy reproduces the source shape member by member; only identity and mutability change.
	// oxlint-disable-next-line typescript(no-unsafe-type-assertion) -- structural copy of T is a T
	return copy(value) as T;
}

/**
 * The byte length of a value's JSON encoding, which the retention bounds are measured in.
 * @param value The value to measure.
 * @returns The UTF-8 byte count, or zero when the value has no JSON form.
 */
function jsonByteLength(value: unknown): number {
	const encoded = encodeJsonText(value);
	return encoded === undefined ? 0 : Buffer.byteLength(encoded, "utf8");
}

export { cloneAndFreeze, jsonByteLength };
