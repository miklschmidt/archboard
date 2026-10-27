import { mountArchitectureExplanationRoutes } from "#server/routes/architecture/explanation-routes.ts";
import { mountArchitectureFlowRoutes } from "#server/routes/architecture/flow-routes.ts";
import { mountArchitecturePublicationRoutes } from "#server/routes/architecture/publication-routes.ts";
import type { Express } from "express";
import { z } from "zod";
import { readArchitectureModel, listArchitectureCheckpoints } from "@archboard/board/store-read";
import {
	retainArchitectureCheckpoint,
	initializeArchitectureArchive,
} from "@archboard/board/store-write";
import { ArchitectureCheckpointRequestSchema } from "@archboard/board/model";
import { respond } from "#server/routes/architecture/model-response.ts";
import { mountArchitectureEditRoutes } from "#server/routes/architecture/model-edit-routes.ts";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";

const QuerySchema = z
	.object({
		vault: z.string(),
		preview: z.string().min(1).optional(),
		module: z.string().min(1).optional(),
		flow: z.string().min(1).optional(),
		walkthrough: z.string().min(1).optional(),
		shared: z
			.enum(["true", "false"])
			.transform((value) => value === "true")
			.optional(),
		checkpoint: z.string().min(1).optional(),
		model: z.string().min(1).optional(),
		references: z
			.enum(["true", "false"])
			.transform((value) => value === "true")
			.optional(),
		reference: z.coerce.number().int().nonnegative().optional(),
		code: z
			.enum(["true", "false"])
			.transform((value) => value === "true")
			.optional(),
		state: z.string().min(1).optional(),
		against: z.string().min(1).optional(),
		compare: z
			.enum(["true", "false"])
			.transform((value) => value === "true")
			.optional(),
	})
	.strict()
	.refine(
		(query) =>
			query.preview !== undefined || query.checkpoint === undefined || query.state === undefined,
		"Select either state or checkpoint.",
	);
const InitializeBodySchema = z.object({ vault: z.string().optional() }).strict();
const ListQuerySchema = z.object({ vault: z.string() }).strict();
const RetainBodySchema = ArchitectureCheckpointRequestSchema.safeExtend({
	vault: z.string().optional(),
});
/**
 * Expose the shared current and retained architecture contracts.
 * @param app The server application.
 */
function mountArchitectureModelRoutes(app: Express): void {
	mountArchitectureExplanationRoutes(app);
	mountArchitecturePublicationRoutes(app);
	mountArchitectureEditRoutes(app);
	mountArchitectureFlowRoutes(app);
	app.post("/api/architecture/archive/init", requireVault, async (req, res) => {
		const parsed = InitializeBodySchema.safeParse(req.body);
		if (!parsed.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(parsed.error) });
			return;
		}
		respond(res, await initializeArchitectureArchive(vaultOfRequest(req)));
	});
	app.get(
		["/api/architecture/model", "/api/architecture/proposals"],
		requireVault,
		async (req, res) => {
			const query = QuerySchema.safeParse(req.query);
			if (!query.success) {
				res
					.status(400)
					.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(query.error) });
				return;
			}
			const { vault: _vault, module, flow, ...navigation } = query.data;
			respond(res, await readArchitectureModel(vaultOfRequest(req), module, flow, navigation));
		},
	);
	app.get("/api/architecture/checkpoints", requireVault, async (req, res) => {
		const query = ListQuerySchema.safeParse(req.query);
		if (!query.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(query.error) });
			return;
		}
		respond(res, await listArchitectureCheckpoints(vaultOfRequest(req)));
	});
	app.post("/api/architecture/checkpoints", requireVault, async (req, res) => {
		const parsed = RetainBodySchema.safeParse(req.body);
		if (!parsed.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(parsed.error) });
			return;
		}
		const { vault: _vault, ...input } = parsed.data;
		respond(res, await retainArchitectureCheckpoint(vaultOfRequest(req), input));
	});
}

export { mountArchitectureModelRoutes };
