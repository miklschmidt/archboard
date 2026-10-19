/**
 * Gives fixture subjects the persisted order their array position represents.
 * Existing orders stay intact so tests that exercise ordering can state them.
 */
export function withFixtureOrders<T>(value: T): T {
	const copy = structuredClone(value);
	applyOrders(copy);
	return copy;
}

function applyOrders(value: unknown): void {
	if (Array.isArray(value)) {
		for (const item of value) applyOrders(item);
		return;
	}
	if (value === null || typeof value !== "object") return;

	const record = value as Record<string, unknown>;
	for (const [key, child] of Object.entries(record)) {
		if ((key === "nodes" || key === "edges") && Array.isArray(child)) {
			for (const [index, subject] of child.entries()) {
				if (subject !== null && typeof subject === "object" && !("order" in subject)) {
					(subject as Record<string, unknown>)["order"] = (index + 1) * 1000;
				}
			}
		}
		applyOrders(child);
	}
}
