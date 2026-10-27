import { createHash } from "node:crypto";
import type { ArchitectureModel, ArchitectureModelRead } from "#shared/schemas/model.ts";
import type { LegacyInventory } from "#shared/schemas/migration.ts";
import { compactChanges } from "#runtime/operations/proposals/subjects.ts";
import { scopedPreview } from "#runtime/operations/legacy-inventory/history.ts";
import { originalState } from "#shared/rules/legacy-inventory/drafts.ts";

type Mapping = NonNullable<LegacyInventory["plan"]["drafts"]>[number];
/**
 * Substitute only the exact standing base that the original draft retains.
 * @param inventory The complete original sources.
 * @param mapping The explicit original baseline selector.
 * @returns A scoped original baseline with no present-day surroundings.
 */
function standingBaseline(inventory: LegacyInventory, mapping: Mapping) {
	const original = originalState(inventory, mapping.legacy)!;
	const boards = inventory.boards.map((board) =>
		board.document?.id !== original.board
			? board
			: {
					...board,
					document: {
						...board.document,
						variants: board.document.variants.map((state) =>
							state.id !== original.state.id
								? state
								: { ...state, content: state.reconciliation!.base },
						),
					},
				},
	);
	return scopedPreview({ ...inventory, boards }, mapping.legacy, undefined, undefined, true);
}
/**
 * Resolve an explicitly selected original baseline without inferring one from names.
 * @param inventory The exact original inputs.
 * @param mapping The original ancestry and baseline choice.
 * @param selected The scoped draft reading.
 * @returns Its empty, original predecessor, or exact conflict baseline.
 */
function conversionBaseline(
	inventory: LegacyInventory,
	mapping: Mapping,
	selected: ArchitectureModel,
): ArchitectureModelRead {
	switch (mapping.baseline.kind) {
		case "empty":
			return { ...selected, modules: [], collections: [], relationships: [], roots: [] };
		case "content":
			return scopedPreview(inventory, mapping.baseline.state, undefined, undefined, true);
		default:
			return standingBaseline(inventory, mapping);
	}
}
/**
 * Convert each explicitly mapped draft through the existing compact subject engine.
 * @param inventory Exact originals and explicit baseline choices.
 * @param model A coherent preview with original history metadata.
 * @returns Compact draft changes with original baseline and ancestry evidence.
 */
function convertDrafts(
	inventory: LegacyInventory,
	model: ArchitectureModel,
): ArchitectureModelRead {
	const history = model.migrationPreview!.history!;
	for (const mapping of inventory.plan.drafts ?? []) {
		const selected = scopedPreview(inventory, mapping.legacy, undefined, undefined, true);
		if (!selected.success) return selected;
		const baseline = conversionBaseline(inventory, mapping, selected);
		if (!baseline.success) return baseline;
		const entry = history.find((candidate) => candidate.legacy === mapping.legacy)!;
		entry.conversion = {
			...mapping,
			baselineDigest: createHash("sha256")
				.update(JSON.stringify({ modules: baseline.modules, collections: baseline.collections }))
				.digest("hex"),
			changes: compactChanges(baseline, selected),
		};
	}
	return model;
}
/**
 * Attach conversions only to coherent migration preview results.
 * @param inventory Exact originals and saved mapping choices.
 * @param result The composed or scoped preview result.
 * @returns Original coverage plus explicit compact draft evidence.
 */
function withDraftConversions(
	inventory: LegacyInventory,
	result: ArchitectureModelRead,
): ArchitectureModelRead {
	return result.success && result.migrationPreview !== undefined
		? convertDrafts(inventory, result)
		: result;
}
export { withDraftConversions };
