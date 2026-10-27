import type { Express } from "express";
import { z } from "zod";
import {
	exportArchitectureModel,
	importArchitectureModel,
	initializeArchitectureModel,
} from "@archboard/board/store-write";
import {
	ArchitectureImportRequestSchema,
	ArchitectureInitializationRequestSchema,
} from "@archboard/board/model";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";
import { respond } from "#server/routes/architecture/model-response.ts";
/**
 * Route portable operations through the shared runtime with explicit vault addressing.
 * @param app The server application.
 */
function mountArchitecturePortableRoutes(app: Express) {
	app.post("/api/architecture/init", requireVault, async (req, res) => {
		const parsed = ArchitectureInitializationRequestSchema.extend({
			vault: z.string().optional(),
		}).safeParse(req.body);
		if (!parsed.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(parsed.error) });
			return;
		}
		const { vault: _vault, ...request } = parsed.data;
		respond(res, await initializeArchitectureModel(vaultOfRequest(req), request));
	});
	app.post("/api/architecture/export", requireVault, async (req, res) => {
		const parsed = z.strictObject({ vault: z.string().optional() }).safeParse(req.body);
		if (!parsed.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(parsed.error) });
			return;
		}
		respond(res, await exportArchitectureModel(vaultOfRequest(req)));
	});
	app.post("/api/architecture/import", requireVault, async (req, res) => {
		const parsed = ArchitectureImportRequestSchema.extend({
			vault: z.string().optional(),
		}).safeParse(req.body);
		if (!parsed.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(parsed.error) });
			return;
		}
		const { vault: _vault, ...request } = parsed.data;
		respond(res, await importArchitectureModel(vaultOfRequest(req), request));
	});
}
export { mountArchitecturePortableRoutes };
