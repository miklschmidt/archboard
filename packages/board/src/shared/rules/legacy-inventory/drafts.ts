import { sameSemanticValue } from "#shared/rules/semantic-value.ts";
import type { LegacyInventory } from "#shared/schemas/migration.ts";

type DraftMapping = NonNullable<LegacyInventory["plan"]["drafts"]>[number];
/**
 * Locate an original state without matching names across independent board families.
 * @param inventory The complete original source.
 * @param identity The qualified original state identity.
 * @returns Its original board and state.
 */
function originalState(inventory: LegacyInventory, identity: string) {
	return inventory.boards
		.flatMap(({ document }) =>
			document === undefined
				? []
				: document.variants.map((state) => ({ board: document.id, state })),
		)
		.find(({ board, state }) => `${inventory.plan.origin}/${board}#${state.id}` === identity);
}
/**
 * Require the original predecessor and retained conflict base for one draft.
 * @param inventory The original source and choices.
 * @param mapping One explicit conversion choice.
 * @returns A refusal for invented ancestry or substituted baseline content.
 */
function mappingProblem(inventory: LegacyInventory, mapping: DraftMapping): string | undefined {
	const original = originalState(inventory, mapping.legacy);
	if (original?.state.lifecycle !== "draft")
		return `Draft mapping ${mapping.legacy} must name an original draft.`;
	const predecessor = parentIdentity(inventory, original);
	if (mapping.predecessor !== predecessor)
		return `Draft ${mapping.legacy} must explicitly retain its original predecessor.`;
	const expected =
		original.state.reconciliation !== undefined
			? { kind: "reconciliation-base", state: mapping.legacy }
			: rootOrParent(predecessor);
	if (!sameSemanticValue(mapping.baseline, expected))
		return `Draft ${mapping.legacy} must select its exact original baseline: ${JSON.stringify(expected)}.`;
	return undefined;
}
/**
 * Qualify the explicit original parent without inferring a current predecessor.
 * @param inventory The original namespace.
 * @param original The original board and state.
 * @returns Its exact parent identity, or a planning root.
 */
function parentIdentity(
	inventory: LegacyInventory,
	original: NonNullable<ReturnType<typeof originalState>>,
) {
	return original.state.parent === undefined
		? null
		: `${inventory.plan.origin}/${original.board}#${original.state.parent}`;
}
/**
 * Distinguish an empty planning root from its explicit original predecessor.
 * @param predecessor The original predecessor identity, or none.
 * @returns The required original baseline selector.
 */
function rootOrParent(predecessor: string | null) {
	return predecessor === null
		? { kind: "empty", state: null }
		: { kind: "content", state: predecessor };
}
/**
 * Require one explicit original ancestry and exact baseline choice per mapped draft.
 * @param inventory The complete original source and proposed choices.
 * @returns A refusal for ambiguous or invented conversion mappings.
 */
function draftMappingProblem(inventory: LegacyInventory): string | undefined {
	const drafts = inventory.plan.drafts ?? [];
	if (new Set(drafts.map((entry) => entry.legacy)).size !== drafts.length)
		return "Each original draft requires one conversion mapping.";
	return drafts
		.map((mapping) => mappingProblem(inventory, mapping))
		.find((problem) => problem !== undefined);
}
export { draftMappingProblem, originalState };
