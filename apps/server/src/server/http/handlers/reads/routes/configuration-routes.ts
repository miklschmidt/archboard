import type { Express } from "express";
import { checkArchitectureVault } from "@archboard/model-store";
import {
	queryString,
	requireVault,
	vaultOfRequest,
} from "#server/http/middleware/request-vault.ts";
/**
 * Read canonical diagnostics, structure warnings and vocabulary without interpreting legacy boards
 * as live content. A `state` names the draft to check instead of the current architecture.
 * @param app The server application.
 */
function mountArchitectureConfigurationRoutes(app: Express) {
	app.get("/api/vault/check", requireVault, async (req, res) => {
		res.json(await checkArchitectureVault(vaultOfRequest(req), queryString(req, "state")?.trim()));
	});
}
export { mountArchitectureConfigurationRoutes };
