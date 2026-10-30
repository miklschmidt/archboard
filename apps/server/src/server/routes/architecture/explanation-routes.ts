import type { Express } from "express";
import { z } from "zod";
import { explainArchitecture } from "@archboard/workbench/server";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";
import { ExplanationActionRequestSchema } from "@archboard/workbench/browser-contract";
import { asyncEndpoint } from "#server/middleware/mutation-work/mutation-work.ts";

const InvokeBodySchema = ExplanationActionRequestSchema.options[1]
	.omit({ type: true })
	.extend({ vault: z.string().optional() });
const ReadQuerySchema = ExplanationActionRequestSchema.options[0]
	.omit({ type: true })
	.extend({ vault: z.string() });
const ActionBodySchema = ExplanationActionRequestSchema.options[2]
	.omit({ type: true, actionId: true })
	.extend({ vault: z.string().optional() });
const ActionIdSchema = ExplanationActionRequestSchema.options[2].shape.actionId;

/**
 * Translate explicit explanation requests through the existing local workbench.
 * @param app The server application.
 */
function mountArchitectureExplanationRoutes(app: Express): void {
	app.post(
		"/api/architecture/explanations",
		requireVault,
		asyncEndpoint(async (req, res) => {
			const parsed = InvokeBodySchema.safeParse(req.body);
			if (!parsed.success) {
				res.status(400).json({
					success: false,
					code: "INVALID_REQUEST",
					error: "Use a complete explanation request and its tab session.",
				});
				return;
			}
			const { vault: _vault, ...input } = parsed.data;
			const result = await explainArchitecture(vaultOfRequest(req), { ...input, type: "invoke" });
			res
				.status(result.success ? 200 : result.code === "AGENT_UNAVAILABLE" ? 503 : 409)
				.json(result);
		}),
	);
	app.get(
		["/api/architecture/explanations", "/api/architecture/explanations/:actionId"],
		requireVault,
		async (req, res) => {
			const parsed = ReadQuerySchema.safeParse(req.query);
			const actionId = ActionIdSchema.optional().safeParse(req.params["actionId"]);
			if (!parsed.success || !actionId.success) {
				res.status(400).json({
					success: false,
					code: "INVALID_REQUEST",
					error: "Name the action and its tab session.",
				});
				return;
			}
			const { vault: _vault, ...input } = parsed.data;
			const result = await explainArchitecture(vaultOfRequest(req), {
				...input,
				...(actionId.data === undefined
					? { type: "latest" }
					: { type: "read", actionId: actionId.data }),
			});
			res.status(result.success ? 200 : 404).json(result);
		},
	);
	for (const type of ["retry", "cancel"] as const)
		app.post(
			`/api/architecture/explanations/:actionId/${type}`,
			requireVault,
			asyncEndpoint(async (req, res) => {
				const parsed = ActionBodySchema.safeParse(req.body);
				const actionId = ActionIdSchema.safeParse(req.params["actionId"]);
				if (!parsed.success || !actionId.success) {
					res.status(400).json({
						success: false,
						code: "INVALID_REQUEST",
						error: "Name the action and its tab session.",
					});
					return;
				}
				const { vault: _vault, ...input } = parsed.data;
				const result = await explainArchitecture(vaultOfRequest(req), {
					...input,
					type,
					actionId: actionId.data,
				});
				res.status(result.success ? 200 : 409).json(result);
			}),
		);
}
export { mountArchitectureExplanationRoutes };
