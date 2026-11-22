import type { Express } from "express";
import { z } from "zod";
import { architectureUpgradeRequestSchema } from "@archboard/model/contract";
import { readUpgradeInventory } from "@archboard/model/store-read";
import { upgradeArchitectureModel } from "@archboard/model/store-write";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";
import { respond } from "#server/http/handlers/routes/model-response.ts";
import { asyncEndpoint } from "#server/http/middleware/mutation-work.ts";

/**
 * Expose the upgrade of an old vault: its inventory, and installing it filled.
 * @param app The server application.
 */
function mountUpgradeRoutes(app: Express): void {
	app.get("/api/architecture/upgrade/inventory", requireVault, async (req, res) => {
		respond(res, await readUpgradeInventory(vaultOfRequest(req)));
	});
	app.post(
		"/api/architecture/upgrade",
		requireVault,
		asyncEndpoint(async (req, res) => {
			const parsed = architectureUpgradeRequestSchema()
				.extend({ vault: z.string().optional() })
				.safeParse(req.body);
			if (!parsed.success) {
				res
					.status(400)
					.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(parsed.error) });
				return;
			}
			const { vault: _vault, ...request } = parsed.data;
			respond(res, await upgradeArchitectureModel(vaultOfRequest(req), request));
		}),
	);
}
export { mountUpgradeRoutes };
