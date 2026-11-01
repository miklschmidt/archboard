import { checkoutWork } from "#server/wiring/owners/server-owners.ts";
import type { Express } from "express";
import { z } from "zod";
import { ArchitectureHistoryRequestSchema } from "@archboard/code-intel/history";
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
		const input = ArchitectureHistoryRequestSchema.options[0]
			.omit({ analysis: true })
			.safeParse(Object.fromEntries(Object.entries(req.query).filter(([key]) => key !== "vault")));
		if (!input.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(input.error) });
			return;
		}
		const result = await checkoutWork.trackRequest(
			req,
			res,
			"GET /api/architecture/locality",
			(signal) => readArchitectureLocality(vaultOfRequest(req), input.data, signal),
		);
		if (!res.destroyed) respond(res, result);
	});
	app.get("/api/architecture/footprint", requireVault, async (req, res) => {
		const input = ArchitectureHistoryRequestSchema.options[1]
			.omit({ analysis: true })
			.safeParse(Object.fromEntries(Object.entries(req.query).filter(([key]) => key !== "vault")));
		if (!input.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(input.error) });
			return;
		}
		const result = await checkoutWork.trackRequest(
			req,
			res,
			"GET /api/architecture/footprint",
			(signal) => readArchitectureFootprint(vaultOfRequest(req), input.data, signal),
		);
		if (!res.destroyed) respond(res, result);
	});
}
export { mountArchitectureHistoryRoutes };
