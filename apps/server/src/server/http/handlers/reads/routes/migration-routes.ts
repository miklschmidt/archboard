import type { LegacyInventoryRead } from "@archboard/model-contract";
import {
	migrateArchitectureModel,
	readLegacyInventory,
	saveLegacyMappingPlan,
} from "@archboard/model-store";
import { requestOf, respond } from "#server/http/handlers/routes/model-response.ts";
import type { Express, Response } from "express";
import { z } from "zod";
import { requireVault, vaultOfRequest } from "@archboard/server-requests/server";
import { asyncEndpoint } from "#server/http/middleware/mutation-work.ts";

const QuerySchema = z.strictObject({ vault: z.string(), origin: z.string().min(1) });

/**
 * Return the shared runtime result with its transport status.
 * @param res The HTTP response.
 * @param result The inventory or planning refusal.
 */
function answer(res: Response, result: LegacyInventoryRead): void {
	const status = result.success
		? 200
		: result.code === "LEGACY_NOT_FOUND"
			? 404
			: [
						"MAPPING_STALE",
						"MAPPING_HELD",
						"INVENTORY_CHANGED",
						"RECOVERY_REQUIRED",
						"MODEL_BUSY",
				  ].includes(result.code)
				? 409
				: 422;
	res.set("Cache-Control", "no-store").status(status).json(result);
}

/**
 * Expose migration planning through the architecture runtime alone.
 * @param app The server application.
 */
function mountLegacyMigrationRoutes(app: Express): void {
	app.post(
		"/api/architecture/migration/apply",
		requireVault,
		asyncEndpoint(async (req, res) => {
			const request = requestOf(res, "migrate", req.body);
			if (request === undefined) return;
			respond(res, await migrateArchitectureModel(vaultOfRequest(req), request));
		}),
	);
	app.get("/api/architecture/migration/inventory", requireVault, (req, res) => {
		const query = QuerySchema.safeParse(req.query);
		if (!query.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(query.error) });
			return;
		}
		answer(res, readLegacyInventory(vaultOfRequest(req), query.data.origin));
	});
	app.put(
		"/api/architecture/migration/plan",
		requireVault,
		asyncEndpoint(async (req, res) => {
			const request = requestOf(res, "saveLegacyMappingPlan", req.body);
			if (request === undefined) return;
			answer(res, await saveLegacyMappingPlan(vaultOfRequest(req), request));
		}),
	);
}
export { mountLegacyMigrationRoutes };
