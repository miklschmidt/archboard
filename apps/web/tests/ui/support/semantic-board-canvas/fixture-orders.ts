/**
 * Gives fixture subjects the persisted order their array position represents.
 * Existing orders stay intact so tests that exercise ordering can state them.
 * @param value A fixture containing semantic subjects.
 * @returns A copy with missing subject orders assigned.
 */
export function withFixtureOrders<T>(value: T): T {
	const copy = structuredClone(value);
	applyOrders(copy);
	return copy;
}

/**
 * Walk a fixture to find its node and relationship collections.
 * @param value One fixture value.
 */
function applyOrders(value: unknown): void {
	if (Array.isArray(value)) {
		for (const item of value) applyOrders(item);
		return;
	}
	if (!isRecord(value)) return;

	for (const [key, child] of Object.entries(value)) applyField(key, child);
}

/**
 * Traverse one field, assigning order when it is a subject collection.
 * @param key The field name.
 * @param child Its value.
 */
function applyField(key: string, child: unknown): void {
	if (key === "nodes" || key === "edges") addOrders(child);
	applyOrders(child);
}

/**
 * Add positions to one subject collection when they were not stated.
 * @param value A possible node or relationship array.
 */
function addOrders(value: unknown): void {
	if (!Array.isArray(value)) return;
	for (const [index, subject] of value.entries()) {
		if (isRecord(subject) && !("order" in subject)) subject["order"] = (index + 1) * 1000;
	}
}

/**
 * Recognize an object whose fields can be inspected safely.
 * @param value An unknown fixture value.
 * @returns Whether it is a non-array record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
