import { errorMessage } from "@archboard/diagnostics/errno";
import { SemanticIdSchema } from "#shared/schemas/primitives.ts";
import type {
	LegacyInventory,
	LegacyInventoryRead,
	LegacyMappingPlan,
} from "#shared/schemas/migration.ts";
import { identityEvidence } from "#shared/rules/legacy-inventory/evidence.ts";
import { legacyIdentities } from "#shared/rules/legacy-inventory/identities.ts";
import {
	siblingOrderConflicts,
	relationshipConflicts,
} from "#shared/rules/legacy-inventory/conflicts.ts";
import { mappingProblem } from "#shared/rules/legacy-inventory/plan.ts";
import { readModelFiles } from "#runtime/store/model-files.ts";
import { readMigrationPlan, MIGRATION_PLAN_PATH } from "#runtime/store/migration-plan.ts";
import {
	decodeLegacyInput,
	decodeLegacyPolicy,
	legacyPolicyConflicts,
} from "#runtime/operations/legacy-inventory/inputs.ts";

/**
 * Assemble original coverage and evidence from one captured source set.
 * @param vault The explicitly addressed vault.
 * @param origin The stable import namespace.
 * @param proposed A candidate plan to assess without saving.
 * @returns The inventory or an input refusal.
 */
function captureInventory(
	vault: string,
	origin: string,
	proposed?: LegacyMappingPlan,
): LegacyInventoryRead {
	const captured = readModelFiles(vault);
	if (captured.diagnostics.length > 0)
		return {
			success: false,
			code: "INVENTORY_UNREADABLE",
			error: "The source inputs are unreadable.",
			diagnostics: captured.diagnostics,
		};
	const diagnostics: LegacyInventory["diagnostics"] = [];
	const boards = [...captured.inputs]
		.filter(([file]) => file.endsWith(".semantic.json"))
		.map(([file, bytes]) => decodeLegacyInput(file, bytes, diagnostics));
	if (boards.length === 0)
		return migrationFailure("LEGACY_NOT_FOUND", ".", "The vault contains no legacy boards.");
	const stored = readMigrationPlan(vault, origin);
	if (stored.problem !== undefined)
		return migrationFailure("MAPPING_INVALID", MIGRATION_PLAN_PATH, stored.problem);
	const plan = proposed ??
		stored.plan ?? {
			schemaVersion: 1,
			origin,
			sourceDigest: captured.revision.digest,
			mappings: [],
			choices: [],
		};
	return assembleInventory(
		{
			source: captured.revision,
			boards,
			policy: decodeLegacyPolicy(captured.inputs.get(".archboard/config.yaml"), diagnostics),
			diagnostics,
			plan,
			planRevision: stored.revision,
		},
		origin,
	);
}

/**
 * Assess planning choices against the original source without composing architecture.
 * @param inputs Captured original content and the selected plan.
 * @param origin The requested namespace, which must match saved provenance.
 * @returns The original coverage and its unresolved decisions.
 */
function assembleInventory(
	inputs: Pick<
		LegacyInventory,
		"source" | "boards" | "policy" | "diagnostics" | "plan" | "planRevision"
	>,
	origin: string,
): LegacyInventoryRead {
	if (inputs.plan.origin !== origin)
		return migrationFailure(
			"MAPPING_INVALID",
			MIGRATION_PLAN_PATH,
			"Keep the saved origin namespace when reading this migration plan.",
		);
	const { evidence, conflicts } = identityEvidence(inputs);
	conflicts.push(
		...siblingOrderConflicts(inputs),
		...relationshipConflicts(inputs),
		...legacyPolicyConflicts(inputs),
	);
	const inventory: LegacyInventory = {
		success: true,
		...inputs,
		...legacyIdentities(inputs.boards, origin, inputs.diagnostics),
		evidence,
		conflicts,
		unresolved: conflicts
			.filter((conflict) => !inputs.plan.choices.some((choice) => choice.conflict === conflict.key))
			.map((conflict) => conflict.key),
	};
	if (inputs.plan.sourceDigest !== inputs.source.digest) {
		inventory.diagnostics.push({
			code: "MAPPING_STALE",
			file: MIGRATION_PLAN_PATH,
			message: "The source changed after these choices were recorded.",
			recovery:
				"Review the fresh inventory and explicitly update the plan's source digest and choices.",
		});
		return inventory;
	}
	const problem = mappingProblem(inventory);
	return problem === undefined
		? inventory
		: migrationFailure("MAPPING_INVALID", MIGRATION_PLAN_PATH, problem);
}

/**
 * Detect external edits to either source or choices while an inventory is assembled.
 * @param vault The addressed vault.
 * @param inventory The captured source and plan revisions.
 * @returns Whether the source or choices changed.
 */
function inventoryChanged(vault: string, inventory: LegacyInventory): boolean {
	const latest = readModelFiles(vault);
	return (
		latest.diagnostics.length > 0 ||
		latest.revision.digest !== inventory.source.digest ||
		readMigrationPlan(vault, inventory.plan.origin).revision !== inventory.planRevision
	);
}

/**
 * Inventory original legacy documents without persisting the decoder's upgrades.
 * @param vault The explicitly addressed vault.
 * @param origin The owner's stable import namespace.
 * @param proposed A candidate plan to assess without saving it.
 * @returns Original coverage, identity provenance and a separate mapping plan.
 */
function readLegacyInventory(
	vault: string,
	origin: string,
	proposed?: LegacyMappingPlan,
): LegacyInventoryRead {
	if (!SemanticIdSchema.safeParse(origin).success)
		return migrationFailure(
			"MAPPING_INVALID",
			".",
			"Use an existing short origin id for this import.",
		);
	try {
		const result = captureInventory(vault, origin, proposed);
		if (!result.success) return result;
		return inventoryChanged(vault, result)
			? migrationFailure(
					"INVENTORY_CHANGED",
					".",
					"The source or planning choices changed during inventory. Read them again after external edits stop.",
				)
			: result;
	} catch (error) {
		return migrationFailure("INVENTORY_UNREADABLE", ".", errorMessage(error));
	}
}

/**
 * Return a structured planning refusal with a recovery action.
 * @param code The stable refusal code.
 * @param file The affected input.
 * @param message What failed and how to continue.
 * @returns The shared failure result.
 */
function migrationFailure(
	code: Extract<LegacyInventoryRead, { success: false }>["code"],
	file: string,
	message: string,
): Extract<LegacyInventoryRead, { success: false }> {
	return {
		success: false,
		code,
		error: message,
		diagnostics: [
			{
				code,
				file,
				message,
				recovery: "Read a fresh inventory and retry with its exact source and plan revisions.",
			},
		],
	};
}
export { readLegacyInventory, migrationFailure };
