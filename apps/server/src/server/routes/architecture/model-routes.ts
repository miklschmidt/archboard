import type { Express } from "express";
import { z } from "zod";
import { readArchitectureModel } from "@archboard/board/store-read";
import type { ArchitectureModelRead } from "@archboard/board/model";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";

const QuerySchema = z.object({ vault: z.string(), module: z.string().min(1).optional() }).strict();
const failureStatuses: Partial<
	Record<Extract<ArchitectureModelRead, { success: false }>["code"], number>
> = {
	MODEL_NOT_FOUND: 404,
	MODULE_NOT_FOUND: 404,
	MODULE_AMBIGUOUS: 409,
	LEGACY_AUTHORITY: 409,
};

/**
 * Expose the runtime model reader without a transport-specific interpretation.
 * @param app The server application.
 */
function mountArchitectureModelRoutes(app: Express): void {
	app.get("/api/architecture/model", requireVault, (req, res) => {
		const query = QuerySchema.safeParse(req.query);
		if (!query.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(query.error) });
			return;
		}
		const result = readArchitectureModel(vaultOfRequest(req), query.data.module);
		const status = result.success ? 200 : (failureStatuses[result.code] ?? 422);
		res.set("Cache-Control", "no-store").status(status).json(result);
	});
}

export { mountArchitectureModelRoutes };
