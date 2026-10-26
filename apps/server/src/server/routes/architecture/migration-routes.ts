import type { Express, Response } from "express";
import { z } from "zod";
import { readLegacyInventory } from "@archboard/board/store-read";
import { saveLegacyMappingPlan } from "@archboard/board/store-write";
import { LegacyMappingWriteSchema, type LegacyInventoryRead } from "@archboard/board/migration";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";
import { asyncEndpoint } from "#server/middleware/mutation-work/mutation-work.ts";

const QuerySchema = z.strictObject({ vault: z.string(), origin: z.string().min(1) });
const WriteSchema = LegacyMappingWriteSchema.extend({ vault: z.string().optional() });

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
			: ["MAPPING_STALE", "MAPPING_HELD", "INVENTORY_CHANGED"].includes(result.code)
				? 409
				: 422;
	res.set("Cache-Control", "no-store").status(status).json(result);
}

/**
 * Expose migration planning through the architecture runtime alone.
 * @param app The server application.
 */
function mountLegacyMigrationRoutes(app: Express): void {
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
			const parsed = WriteSchema.safeParse(req.body);
			if (!parsed.success) {
				res
					.status(400)
					.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(parsed.error) });
				return;
			}
			const { vault: _vault, ...request } = parsed.data;
			answer(res, await saveLegacyMappingPlan(vaultOfRequest(req), request));
		}),
	);
}
export { mountLegacyMigrationRoutes };
