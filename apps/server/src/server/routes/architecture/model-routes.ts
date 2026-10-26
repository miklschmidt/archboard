import { mountArchitecturePublicationRoutes } from "#server/routes/architecture/publication-routes.ts";
import type { Express } from "express";
import { z } from "zod";
import {
	readArchitectureModel,
	readArchitectureCheckpoint,
	listArchitectureCheckpoints,
} from "@archboard/board/store-read";
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
		checkpoint: z.string().min(1).optional(),
	})
	.strict();
const InitializeBodySchema = z.object({ vault: z.string().optional() }).strict();
const ListQuerySchema = QuerySchema.pick({ vault: true });
const RetainBodySchema = ArchitectureCheckpointRequestSchema.extend({
	vault: z.string().optional(),
});
/**
 * Expose the shared current and retained architecture contracts.
 * @param app The server application.
 */
function mountArchitectureModelRoutes(app: Express): void {
	mountArchitecturePublicationRoutes(app);
	mountArchitectureEditRoutes(app);
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
	app.get("/api/architecture/model", requireVault, async (req, res) => {
		const query = QuerySchema.safeParse(req.query);
		if (!query.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(query.error) });
			return;
		}
		const { module, checkpoint } = query.data;
		respond(
			res,
			checkpoint === undefined
				? readArchitectureModel(vaultOfRequest(req), module)
				: await readArchitectureCheckpoint(vaultOfRequest(req), checkpoint, module),
		);
	});
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
