import { type LegacyBoard, parseDocument, type VariantContent } from "@archboard/model-contract";

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

/**
 * A variant's content, stated as a document would hold it, read through the contract.
 * @param stated What is on it.
 * @returns The content, with the orders its array positions represent.
 */
export function contentOf(stated: Record<string, unknown>): VariantContent {
	const read = parseDocument("variantContent", withFixtureOrders(stated));
	if (read.success) return read.data;
	throw read.error instanceof Error ? read.error : new Error(JSON.stringify(read.error));
}

/**
 * A legacy board, stated as a document would hold it, read through the contract.
 * @param stated The board.
 * @returns The board, with the orders its array positions represent.
 */
export function boardOf(stated: Record<string, unknown>): LegacyBoard {
	const read = parseDocument("legacyBoard", withFixtureOrders(stated));
	if (read.success) return read.data;
	throw new Error(read.error);
}
