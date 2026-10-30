import type { LegacyInventory, LegacyMappingPlan } from "#shared/schemas/migration.ts";
import type { SemanticBoard, SemanticVariant } from "#shared/schemas/board-document.ts";
import type { ModelDiagnostic } from "#shared/schemas/model.ts";

/**
 * Select reference decisions for one original state before narrowing its family.
 * @param inventory Captured original families and explicit decisions.
 * @param document The original complete family.
 * @param state The selected original state.
 * @returns Exact decisions and diagnostics for unresolved original navigation.
 */
function originalReferences(
	inventory: LegacyInventory,
	document: SemanticBoard,
	state: SemanticVariant,
) {
	const qualified = `${inventory.plan.origin}/${document.id}#${state.id}`;
	const references: NonNullable<LegacyMappingPlan["references"]> = [];
	const diagnostics: ModelDiagnostic[] = [];
	for (const node of state.content.nodes.filter((entry) => entry.drillDown !== undefined)) {
		const legacy = `${inventory.plan.origin}/${document.id}#${node.id}`;
		const choices = inventory.plan.references?.filter((entry) => entry.legacy === legacy) ?? [];
		const choice =
			choices.find((entry) => entry.state === qualified) ??
			choices.find((entry) => entry.state === undefined && state.id === document.current);
		if (choice !== undefined) references.push({ ...choice, state: qualified });
		else
			diagnostics.push({
				code: "REFERENCE_UNAVAILABLE",
				file: inventory.boards.find((entry) => entry.document?.id === document.id)!.file,
				subjects: [legacy],
				message:
					"This original drill-down has no exact subject and state mapping for this coverage.",
				recovery:
					"Inspect the original drill-down. Save an explicit reference choice for this qualified original state. External history also requires an exact checkpoint.",
			});
	}
	return { references, diagnostics };
}
export { originalReferences };
