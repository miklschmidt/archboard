import type { SemanticArchitectureInput } from "#runtime/schemas/semantic-context-types.ts";
const NOTHING_READ: SemanticArchitectureInput = Object.freeze({
	variant: null,
	view: null,
	selection: Object.freeze({ count: 0, subjects: [] }),
	differences: null,
	reconciliation: Object.freeze({ required: false, count: 0, blockedBy: null, issues: [] }),
});
export { NOTHING_READ };

/**
 * Read the aggregate portion of a retained presentation key.
 * @param key The opaque pane key.
 * @returns The aggregate address.
 */
function aggregateKey(key: string): string {
	return key.split("@", 1)[0]!;
}
export { aggregateKey };
