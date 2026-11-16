import { checkoutWork } from "#server/wiring/server-owners.ts";
import type { Express } from "express";
import { z } from "zod";
import { ArchitectureHistoryRequestSchema } from "@archboard/code-intel/history";
import { readArchitectureHistory } from "@archboard/code-intel/history-lens";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";
import { respond } from "#server/http/handlers/routes/model-response.ts";

/** Each history analysis, which a route of its own name answers. */
const ANALYSES = ArchitectureHistoryRequestSchema.options.map(
	(option) => option.shape.analysis.value,
);

/**
 * Mount canonical adapters for the existing local Git history analysis: one route for each
 * analysis, at `/api/architecture/<analysis>`, whose query is that analysis's request.
 * @param app The server application.
 */
function mountArchitectureHistoryRoutes(app: Express): void {
	for (const analysis of ANALYSES) {
		const route = `/api/architecture/${analysis}`;
		app.get(route, requireVault, async (req, res) => {
			const query = Object.entries(req.query).filter(([key]) => key !== "vault");
			const input = ArchitectureHistoryRequestSchema.safeParse({
				...Object.fromEntries(query),
				analysis,
			});
			if (!input.success) {
				res
					.status(400)
					.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(input.error) });
				return;
			}
			const result = await checkoutWork.trackRequest(req, res, `GET ${route}`, (signal) =>
				readArchitectureHistory(vaultOfRequest(req), input.data, signal),
			);
			if (!res.destroyed) respond(res, result);
		});
	}
}
export { mountArchitectureHistoryRoutes };
