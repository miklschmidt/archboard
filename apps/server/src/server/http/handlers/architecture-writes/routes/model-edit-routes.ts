import type { Express, Request } from "express";
import { z } from "zod";
import type {
	ArchitectureModelRead,
	ModelRequest,
	RequestOperation,
} from "@archboard/model-contract";
import {
	changeArchitectureClaims,
	editArchitectureModule,
	readArchitectureClaims,
	recoverArchitectureModel,
} from "@archboard/model-store";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";
import { asyncEndpoint } from "#server/http/middleware/mutation-work.ts";
import { requestOf, respond } from "#server/http/handlers/routes/model-response.ts";
const VaultQuerySchema = z.object({ vault: z.string() }).strict();

/**
 * Mount one thin adapter over the contract's request and the store's operation.
 * @param app The server application.
 * @param path The HTTP operation path.
 * @param request The request operation the body is read as.
 * @param operation The shared runtime operation.
 */
function post<O extends RequestOperation>(
	app: Express,
	path: string,
	request: O,
	operation: (
		vault: string,
		input: ModelRequest<O>,
	) => Promise<{ success: true } | Extract<ArchitectureModelRead, { success: false }>>,
): void {
	app.post(
		path,
		requireVault,
		asyncEndpoint(async (req, res) => {
			const input = requestOf(res, request, req.body);
			if (input === undefined) return;
			respond(res, await operation(vaultOfRequest(req), input));
		}),
	);
}
/**
 * Require the subscription and claim list to name only their vault.
 * @param req The incoming HTTP request.
 * @returns Whether the query names only its vault.
 */
function validQuery(req: Request): boolean {
	return VaultQuerySchema.safeParse(req.query).success;
}
/**
 * Expose canonical edits, claims, recovery and coherent subscription snapshots.
 * @param app The server application.
 */
function mountArchitectureEditRoutes(app: Express): void {
	post(app, "/api/architecture/module", "edit", editArchitectureModule);
	post(app, "/api/architecture/claims", "claim", (vault, input) =>
		changeArchitectureClaims(vault, "claim", input),
	);
	post(app, "/api/architecture/claims/release", "releaseClaim", (vault, input) =>
		changeArchitectureClaims(vault, "release", input),
	);
	post(app, "/api/architecture/claims/take-back", "takeBackClaim", (vault, input) =>
		changeArchitectureClaims(vault, "takeBack", input),
	);
	post(app, "/api/architecture/recover", "recover", recoverArchitectureModel);
	app.get("/api/architecture/claims", requireVault, (req, res) => {
		if (!validQuery(req)) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: "Name only the addressed vault." });
			return;
		}
		respond(res, readArchitectureClaims(vaultOfRequest(req)));
	});
}
export { mountArchitectureEditRoutes };
