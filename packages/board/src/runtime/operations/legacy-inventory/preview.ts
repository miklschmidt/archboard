import type { ArchitectureModelRead } from "#shared/schemas/model.ts";
import type { LegacyInventory } from "#shared/schemas/migration.ts";
import { GitObjectIdSchema } from "#shared/schemas/model.ts";
import { readLegacyInventory } from "#runtime/operations/legacy-inventory/inventory.ts";
import { readMigrationPlan } from "#runtime/store/migration-plan.ts";
import { readModelFiles } from "#runtime/store/model-files.ts";
import { currentNodes } from "#shared/rules/legacy-inventory/evidence.ts";
import { composeModel } from "#runtime/operations/legacy-inventory/compose.ts";
import { previewCoverage, scopedPreview } from "#runtime/operations/legacy-inventory/history.ts";
import { withDraftConversions } from "#runtime/operations/legacy-inventory/drafts.ts";
import { failure, selectModule, selectFlow } from "#runtime/operations/read/model-read.ts";
import { historyResult } from "#runtime/operations/history/result.ts";
import { archiveContext, readRecord, ArchiveError } from "#runtime/store/model-archive.ts";
import { exactReading } from "#runtime/operations/history/read.ts";
/**
 * Open captured migration originals through the existing archive reader.
 * @param vault The explicitly addressed vault.
 * @param origin The requested import namespace.
 * @param checkpoint The exact migration checkpoint.
 * @param state The optional original state identity.
 * @param module The optional original subject.
 * @param flow The optional original flow.
 * @returns An immutable original reading without live source inputs.
 */
function retainedPreview(
	vault: string,
	origin: string,
	checkpoint: string,
	state?: string,
	module?: string,
	flow?: string,
) {
	return historyResult(
		"ARCHIVE_UNREADABLE",
		async () => {
			if (!GitObjectIdSchema.safeParse(checkpoint).success)
				throw new ArchiveError(
					"CHECKPOINT_INVALID",
					"Use a complete migration checkpoint identity.",
					checkpoint,
				);
			const context = await archiveContext(vault);
			const record = await readRecord(context, checkpoint);
			if (record.kind !== "checkpoint" || record.migration?.origin !== origin)
				throw new ArchiveError(
					"CHECKPOINT_INVALID",
					"Select the matching migration checkpoint and origin.",
					checkpoint,
				);
			return exactReading(context, checkpoint, module, flow, true, state);
		},
		checkpoint,
	);
}
/**
 * Preview current composition or one original board state without changing authority.
 * @param vault The explicitly addressed legacy vault.
 * @param origin The saved import namespace.
 * @param module The optional module selector.
 * @param flow The optional flow selector.
 * @param state The optional qualified original state identity.
 * @param checkpoint The optional immutable original checkpoint.
 * @returns A complete scoped reading or an actionable refusal.
 */
async function readMigrationPreview(
	vault: string,
	origin: string,
	module?: string,
	flow?: string,
	state?: string,
	checkpoint?: string,
): Promise<ArchitectureModelRead> {
	if (checkpoint !== undefined)
		return retainedPreview(vault, origin, checkpoint, state, module, flow);
	const inventory = readLegacyInventory(vault, origin);
	if (!inventory.success) return failure("MAPPING_INVALID", inventory.diagnostics);
	const refused = previewEligibility(inventory) ?? previewReferenceFailure(inventory);
	if (refused !== undefined) return refused;
	const result = previewFromInventory(inventory, state, module, flow);
	if (previewChanged(vault, inventory))
		return failure("MODEL_CHANGED", [
			{
				code: "MODEL_CHANGED",
				file: ".archboard/migration-plan.json",
				message: "The source or mapping choices changed during composition.",
				recovery: "Finish external edits and preview the fresh mapping plan again.",
			},
		]);
	return result;
}
/**
 * Compose captured sources and attach their explicit draft conversion evidence.
 * @param inventory Original inputs and saved mapping choices.
 * @param state Optional original state coverage.
 * @param module Optional original subject selection.
 * @param flow Optional original flow selection.
 * @returns One canonical candidate with original coverage metadata.
 */
function previewFromInventory(
	inventory: LegacyInventory,
	state?: string,
	module?: string,
	flow?: string,
): ArchitectureModelRead {
	const model = state === undefined ? composeModel(inventory) : scopedPreview(inventory, state);
	if (!model.success) return model;
	const result = {
		...model,
		migrationPreview: model.migrationPreview ?? previewCoverage(inventory),
	};
	const converted = withDraftConversions(inventory, result);
	if (!converted.success) return converted;
	return selectFlow(selectModule(converted, module), flow);
}
/**
 * Require a fresh saved plan and complete explicit decisions.
 * @param inventory Original coverage and exact plan revisions.
 * @returns A structured refusal or no unmet prerequisite.
 */
function previewEligibility(inventory: LegacyInventory) {
	if (inventory.planRevision === null)
		return failure("MAPPING_REQUIRED", [
			{
				code: "MAPPING_REQUIRED",
				file: ".archboard/migration-plan.json",
				message: "Preview requires a saved mapping plan.",
				recovery: "Save the explicit mapping plan and retry the preview.",
			},
		]);
	if (inventory.plan.sourceDigest !== inventory.source.digest)
		return failure("MAPPING_STALE", inventory.diagnostics);
	if (inventory.diagnostics.some((diagnostic) => diagnostic.code !== "INVALID_POLICY"))
		return failure("MAPPING_INVALID", inventory.diagnostics);
	if (inventory.unresolved.length > 0)
		return failure(
			"MAPPING_UNRESOLVED",
			inventory.unresolved.map((key) => ({
				code: "MAPPING_UNRESOLVED",
				file: ".archboard/migration-plan.json",
				path: key,
				message: "A mapping conflict has no explicit choice.",
				recovery: "Resolve every conflict against a fresh inventory before previewing.",
			})),
		);
	return undefined;
}

/**
 * Require explicit targets for current drill-down references.
 * @param inventory Original current subjects and reference mappings.
 * @returns A structured refusal or complete reference mapping coverage.
 */
function previewReferenceFailure(inventory: LegacyInventory) {
	const missingReferences = currentNodes(inventory).filter(
		(entry) =>
			entry.node.drillDown !== undefined &&
			!inventory.plan.references?.some((mapping) => mapping.legacy === entry.subject),
	);
	if (missingReferences.length > 0)
		return failure(
			"MAPPING_UNRESOLVED",
			missingReferences.map((entry) => ({
				code: "MAPPING_UNRESOLVED",
				file: entry.file,
				subjects: [entry.subject!],
				message: "A drill-down has no explicit canonical subject and state mapping.",
				recovery: "Add its exact target to the mapping plan references and save the plan.",
			})),
		);
	return undefined;
}

/**
 * Refuse interference with captured source or mapping bytes during composition.
 * @param vault The explicitly addressed legacy vault.
 * @param inventory The source and plan that supplied this candidate.
 * @returns Whether either captured input changed.
 */
function previewChanged(vault: string, inventory: LegacyInventory): boolean {
	const latest = readModelFiles(vault);
	const plan = readMigrationPlan(vault, inventory.plan.origin);
	return (
		latest.diagnostics.length > 0 ||
		latest.revision.digest !== inventory.source.digest ||
		plan.problem !== undefined ||
		plan.revision !== inventory.planRevision
	);
}

export { readMigrationPreview, previewFromInventory };
