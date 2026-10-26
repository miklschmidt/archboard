import type { Express, Response } from "express";
import { z } from "zod";
import {
	readArchitectureModel,
	readArchitectureCheckpoint,
	listArchitectureCheckpoints,
} from "@archboard/board/store-read";
import { retainArchitectureCheckpoint } from "@archboard/board/store-write";
import {
	ArchitectureCheckpointRequestSchema,
	type ArchitectureModelRead,
	type ArchitectureCheckpointRetain,
	type ArchitectureCheckpointList,
} from "@archboard/board/model";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";

const QuerySchema = z
	.object({
		vault: z.string(),
		module: z.string().min(1).optional(),
		checkpoint: z.string().min(1).optional(),
	})
	.strict();
const ListQuerySchema = QuerySchema.pick({ vault: true });
const RetainBodySchema = ArchitectureCheckpointRequestSchema.extend({
	vault: z.string().optional(),
});
const failureStatuses: Partial<
	Record<Extract<ArchitectureModelRead, { success: false }>["code"], number>
> = {
	MODEL_NOT_FOUND: 404,
	MODULE_NOT_FOUND: 404,
	ARCHITECTURE_UNAVAILABLE: 404,
	MODULE_AMBIGUOUS: 409,
	LEGACY_AUTHORITY: 409,
	STALE_REVISION: 409,
	OPERATION_REUSED: 409,
	ARCHIVE_NOT_INITIALIZED: 409,
	ARCHIVE_IN_USE: 409,
	ARCHIVE_BUSY: 409,
};

/**
 * Keep runtime results intact at the HTTP boundary.
 * @param res The outgoing HTTP response.
 * @param result The shared architecture outcome.
 */
function respond(
	res: Response,
	result: ArchitectureModelRead | ArchitectureCheckpointRetain | ArchitectureCheckpointList,
): void {
	res
		.set("Cache-Control", "no-store")
		.status(result.success ? 200 : (failureStatuses[result.code] ?? 422))
		.json(result);
}

/**
 * Expose the shared current and retained architecture contracts.
 * @param app The server application.
 */
function mountArchitectureModelRoutes(app: Express): void {
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
