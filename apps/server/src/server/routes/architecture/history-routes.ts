import type { Express } from "express";
import { z } from "zod";
import {
	ArchitectureLocalityRequestSchema,
	ArchitectureFootprintRequestSchema,
} from "@archboard/code-intel/history";
import {
	readArchitectureLocality,
	readArchitectureFootprint,
} from "@archboard/code-intel/history-lens";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";
import { respond } from "#server/routes/architecture/model-response.ts";
/**
 * Mount canonical adapters for the existing local Git history analysis.
 * @param app The server application.
 */
function mountArchitectureHistoryRoutes(app: Express): void {
	app.get("/api/architecture/locality", requireVault, async (req, res) => {
		const input = ArchitectureLocalityRequestSchema.safeParse(
			Object.fromEntries(Object.entries(req.query).filter(([key]) => key !== "vault")),
		);
		if (!input.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(input.error) });
			return;
		}
		respond(res, await readArchitectureLocality(vaultOfRequest(req), input.data));
	});
	app.get("/api/architecture/footprint", requireVault, async (req, res) => {
		const input = ArchitectureFootprintRequestSchema.safeParse(
			Object.fromEntries(Object.entries(req.query).filter(([key]) => key !== "vault")),
		);
		if (!input.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(input.error) });
			return;
		}
		respond(res, await readArchitectureFootprint(vaultOfRequest(req), input.data));
	});
}
export { mountArchitectureHistoryRoutes };
