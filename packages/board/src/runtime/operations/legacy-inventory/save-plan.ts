import { join } from "node:path";
import { writeFileAtomic } from "@archboard/workspace/atomic-write";
import { errorMessage } from "@archboard/diagnostics/errno";
import { mintId } from "#shared/rules/ids.ts";
import { checkDoing } from "#runtime/store/doing.ts";
import {
	LegacyMappingWriteSchema,
	type LegacyMappingWrite,
	type LegacyInventoryRead,
} from "#shared/schemas/migration.ts";
import { withBoardLock, BoardHeldError } from "#runtime/store/lock/lock.ts";
import { MIGRATION_PLAN_PATH } from "#runtime/store/migration-plan.ts";
import {
	readLegacyInventory,
	migrationFailure,
} from "#runtime/operations/legacy-inventory/inventory.ts";

/**
 * Save only the owner's planning choices under the existing durable file boundary.
 * @param vault The explicitly addressed vault.
 * @param request The complete plan, observed plan revision and doing line.
 * @returns The fresh inventory and saved plan, or an unchanged-file refusal.
 */
async function saveLegacyMappingPlan(
	vault: string,
	request: LegacyMappingWrite,
): Promise<LegacyInventoryRead> {
	const parsed = LegacyMappingWriteSchema.safeParse(request);
	if (!parsed.success)
		return migrationFailure("MAPPING_INVALID", MIGRATION_PLAN_PATH, parsed.error.message);
	const { plan, expectedPlan } = parsed.data;
	const description = checkDoing(parsed.data.doing);
	if (!description.ok)
		return migrationFailure("MAPPING_INVALID", MIGRATION_PLAN_PATH, description.problem);
	try {
		// Board names cannot contain @, so this lease cannot alias a board claim.
		return await withBoardLock(
			{
				vault,
				board: "@migration-plan",
				holder: { id: mintId(), kind: "agent", reason: description.doing },
				waitMs: 0,
			},
			() => {
				const inventory = readLegacyInventory(vault, plan.origin, plan);
				if (!inventory.success) return inventory;
				if (
					inventory.source.digest !== plan.sourceDigest ||
					inventory.planRevision !== expectedPlan
				)
					return migrationFailure(
						"MAPPING_STALE",
						MIGRATION_PLAN_PATH,
						"The source or mapping plan changed. Review a fresh inventory before saving choices.",
					);
				if (inventory.diagnostics.some((diagnostic) => diagnostic.code !== "INVALID_POLICY"))
					return migrationFailure(
						"MAPPING_INVALID",
						MIGRATION_PLAN_PATH,
						"Repair unreadable source documents before recording identity choices.",
					);
				writeFileAtomic(join(vault, MIGRATION_PLAN_PATH), `${JSON.stringify(plan, null, 2)}\n`);
				return readLegacyInventory(vault, plan.origin);
			},
		);
	} catch (error) {
		return migrationFailure(
			error instanceof BoardHeldError ? "MAPPING_HELD" : "INVENTORY_UNREADABLE",
			MIGRATION_PLAN_PATH,
			errorMessage(error),
		);
	}
}
export { saveLegacyMappingPlan };
