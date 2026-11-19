import type { Express } from "express";
import { exportArchitectureModel, installArchitectureModel } from "@archboard/model-store";
import { requireVault, vaultOfRequest } from "#server/http/middleware/request-vault.ts";
import { requestOf, respond } from "#server/http/handlers/routes/model-response.ts";
import { asyncEndpoint } from "#server/http/middleware/mutation-work.ts";
/**
 * Route portable operations through the shared runtime with explicit vault addressing.
 * @param app The server application.
 */
function mountArchitecturePortableRoutes(app: Express) {
	for (const [path, operation] of [
		["/api/architecture/init", "initialize"],
		["/api/architecture/import", "import"],
	] as const) {
		app.post(
			path,
			requireVault,
			asyncEndpoint(async (req, res) => {
				const request = requestOf(res, operation, req.body);
				if (request === undefined) return;
				respond(res, await installArchitectureModel(vaultOfRequest(req), request));
			}),
		);
	}
	app.post(
		"/api/architecture/export",
		requireVault,
		asyncEndpoint(async (req, res) => {
			if (requestOf(res, "export", req.body) === undefined) return;
			respond(res, await exportArchitectureModel(vaultOfRequest(req)));
		}),
	);
}
export { mountArchitecturePortableRoutes };
