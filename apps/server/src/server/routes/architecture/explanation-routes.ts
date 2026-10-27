import type { Express } from "express";
import { explainArchitecture } from "@archboard/workbench/server";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";
import { ExplanationActionRequestSchema } from "@archboard/workbench/browser-contract";

/**
 * Translate explicit explanation requests through the existing local workbench.
 * @param app The server application.
 */
function mountArchitectureExplanationRoutes(app: Express): void {
	app.post("/api/architecture/explanations", requireVault, async (req, res) => {
		const { vault: _vault, ...input } = req.body;
		const parsed = ExplanationActionRequestSchema.safeParse({ ...input, type: "invoke" });
		if (!parsed.success) {
			res.status(400).json({
				success: false,
				code: "INVALID_REQUEST",
				error: "Use a complete explanation request and its tab session.",
			});
			return;
		}
		const result = await explainArchitecture(vaultOfRequest(req), parsed.data);
		res.status(result.success ? 200 : result.code === "AGENT_UNAVAILABLE" ? 503 : 409).json(result);
	});
	app.get(
		["/api/architecture/explanations", "/api/architecture/explanations/:actionId"],
		requireVault,
		async (req, res) => {
			const parsed = ExplanationActionRequestSchema.safeParse({
				...(req.params["actionId"] === undefined
					? { type: "latest" }
					: { type: "read", actionId: req.params["actionId"] }),
				tabSessionId: req.query["tabSessionId"],
			});
			if (!parsed.success) {
				res.status(400).json({
					success: false,
					code: "INVALID_REQUEST",
					error: "Name the action and its tab session.",
				});
				return;
			}
			const result = await explainArchitecture(vaultOfRequest(req), parsed.data);
			res.status(result.success ? 200 : 404).json(result);
		},
	);
	for (const type of ["retry", "cancel"] as const)
		app.post(`/api/architecture/explanations/:actionId/${type}`, requireVault, async (req, res) => {
			const parsed = ExplanationActionRequestSchema.safeParse({
				type,
				actionId: req.params["actionId"],
				tabSessionId: req.body.tabSessionId,
			});
			if (!parsed.success) {
				res.status(400).json({
					success: false,
					code: "INVALID_REQUEST",
					error: "Name the action and its tab session.",
				});
				return;
			}
			const result = await explainArchitecture(vaultOfRequest(req), parsed.data);
			res.status(result.success ? 200 : 409).json(result);
		});
}
export { mountArchitectureExplanationRoutes };
