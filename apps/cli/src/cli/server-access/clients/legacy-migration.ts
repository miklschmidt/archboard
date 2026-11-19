import type { LegacyInventoryRead, LegacyMappingWrite } from "@archboard/model-contract";
import { statedInvocation } from "@archboard/server-lifecycle/server-client";
import { architectureResult } from "#cli/server-access/clients/architecture-model.ts";

/**
 * Inventory legacy inputs without changing architecture or creating a plan file.
 * @param origin The owner's stable import namespace.
 * @returns Original coverage, evidence and any saved mapping choices.
 */
function readLegacyInventoryOnServer(origin: string): Promise<LegacyInventoryRead> {
	return architectureResult(
		"readLegacyInventory",
		`/api/architecture/migration/inventory?${new URLSearchParams({ origin })}`,
	);
}

/**
 * Save explicit choices separately from active architecture.
 * @param request The complete plan and previously observed plan revision.
 * @returns The inventory with its saved choices or a stale-write refusal.
 */
function saveLegacyMappingPlanOnServer(
	request: Omit<LegacyMappingWrite, "doing">,
): Promise<LegacyInventoryRead> {
	return architectureResult("saveLegacyMappingPlan", "/api/architecture/migration/plan", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ ...request, doing: statedInvocation().doing }),
	});
}
export { readLegacyInventoryOnServer, saveLegacyMappingPlanOnServer };
