import {
	architectureUpgradeResultSchema,
	upgradeInventoryReadSchema,
	type ArchitectureUpgradeRequest,
} from "@archboard/model/contract";
import { statedInvocation } from "@archboard/server-lifecycle/server-client";
import { architectureResult } from "#cli/server-access/clients/architecture-model.ts";

/**
 * Read the inventory of an old vault, one per root module. Nothing changes.
 * @returns The inventories or why the vault has none.
 */
function readUpgradeInventoryOnServer() {
	return architectureResult(upgradeInventoryReadSchema(), "/api/architecture/upgrade/inventory");
}

/**
 * Install filled inventories, which upgrades the vault to the current format.
 * @param request The inventories and their writer; the invocation's doing line goes with them.
 * @returns The receipt with the recorded gaps, or why the inventories cannot be installed.
 */
function upgradeArchitectureModelOnServer(request: Omit<ArchitectureUpgradeRequest, "doing">) {
	return architectureResult(architectureUpgradeResultSchema(), "/api/architecture/upgrade", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ ...request, doing: statedInvocation().doing }),
	});
}

export { readUpgradeInventoryOnServer, upgradeArchitectureModelOnServer };
