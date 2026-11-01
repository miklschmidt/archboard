import type { LegacyInventory } from "#shared/schemas/migration.ts";
import type { SemanticVariant } from "#shared/schemas/board-document.ts";
/**
 * Preserve selected and predecessor names without treating sibling proposals as former names.
 * @param inventory Captured complete original families.
 * @param board The original family identity.
 * @param state The selected original state identity.
 * @param names The continuing subject's names in each original state.
 * @returns Names in selected-to-predecessor order.
 */
function predecessorNames(
	inventory: LegacyInventory,
	board: string,
	state: string | undefined,
	names: (state: SemanticVariant) => string[],
): string[] {
	const variants =
		inventory.boards.find((entry) => entry.document?.id === board)?.document?.variants ?? [];
	const result: string[] = [],
		visited = new Set<string>();
	let selected = variants.find((entry) => entry.id === state);
	while (selected !== undefined && !visited.has(selected.id)) {
		visited.add(selected.id);
		result.push(...names(selected));
		selected = variants.find((entry) => entry.id === selected!.parent);
	}
	return result;
}
export { predecessorNames };
