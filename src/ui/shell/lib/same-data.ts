// Whether two pieces of plain data say the same: the navigator's rows are made
// again from the shell view on every piece of pane news, and a row that says
// what it said before is not drawn again (TASK-385.04).

/**
 * Whether two plain values say the same: equal primitives, or arrays and objects
 * whose entries say the same, all the way down.
 * @param a One value.
 * @param b The other.
 * @returns True when they say the same.
 */
function sameData(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	return isObject(a) && isObject(b) && Array.isArray(a) === Array.isArray(b) && sameEntries(a, b);
}

/**
 * Whether a value is an object or an array.
 * @param value The value.
 * @returns True when it is.
 */
function isObject(value: unknown): value is object {
	return typeof value === "object" && value !== null;
}

/**
 * Whether two objects or arrays have the same keys, each saying the same.
 * @param a One.
 * @param b The other.
 * @returns True when they do.
 */
function sameEntries(a: object, b: object): boolean {
	const keys = Object.keys(a);
	if (keys.length !== Object.keys(b).length) return false;
	return keys.every((key) => sameData(Reflect.get(a, key), Reflect.get(b, key)));
}

export { sameData };
