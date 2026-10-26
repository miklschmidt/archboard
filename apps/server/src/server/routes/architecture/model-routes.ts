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
		module: z.string().min(1).optional(),
		flow: z.string().min(1).optional(),
		walkthrough: z.string().min(1).optional(),
		shared: z.enum(["true", "false"]).optional(),
		checkpoint: z.string().min(1).optional(),
		state: z.string().min(1).optional(),
		against: z.string().min(1).optional(),
		compare: z.enum(["true", "false"]).optional(),
	})
	.strict()
	.refine(
		(query) => query.checkpoint === undefined || query.state === undefined,
		"Select either state or checkpoint.",
	);
const InitializeBodySchema = z.object({ vault: z.string().optional() }).strict();
const ListQuerySchema = z.object({ vault: z.string() }).strict();
const RetainBodySchema = ArchitectureCheckpointRequestSchema.extend({
	vault: z.string().optional(),
});
/**
 * Translate state query selectors without interpreting architecture.
 * @param vault The explicitly addressed vault.
 * @param query The parsed wire selection.
 * @returns The shared runtime reading.
 */
function selectedReading(vault: string, query: z.infer<typeof QuerySchema>) {
	const comparison = {
		against: query.against,
		compare: query.compare === undefined ? undefined : query.compare === "true",
	};
	return readArchitectureModel(vault, query.module, query.flow, {
		state: query.state,
		checkpoint: query.checkpoint,
		walkthrough: query.walkthrough,
		shared: query.shared === "true",
		...comparison,
	});
}
/**
 * Expose the shared current and retained architecture contracts.
 * @param app The server application.
 */
function mountArchitectureModelRoutes(app: Express): void {
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
			if (
				!query.success ||
				(query.data.checkpoint !== undefined && query.data.state !== undefined)
			) {
				res.status(400).json({
					success: false,
					code: "INVALID_REQUEST",
					error: query.success
						? "Select either state or checkpoint."
						: z.prettifyError(query.error),
				});
				return;
			}
			respond(res, await selectedReading(vaultOfRequest(req), query.data));
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
