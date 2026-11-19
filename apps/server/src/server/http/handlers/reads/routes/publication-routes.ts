import type { Express } from "express";
import { changeArchitecturePublication, readArchitecturePublication } from "@archboard/model-store";
import { requireVault, vaultOfRequest } from "#server/http/middleware/request-vault.ts";
import { requestOf, respond } from "#server/http/handlers/routes/model-response.ts";
import { asyncEndpoint } from "#server/http/middleware/mutation-work.ts";

/**
 * Mount explicit history operations. Every request names its vault.
 * @param app The server application.
 */
function mountArchitecturePublicationRoutes(app: Express) {
	app.get("/api/architecture/publication", requireVault, async (req, res) => {
		const query = requestOf(res, "readPublication", req.query);
		if (query === undefined) return;
		respond(res, await readArchitecturePublication(vaultOfRequest(req), query.checkpoint));
	});
	app.post(
		"/api/architecture/publication/configure",
		requireVault,
		asyncEndpoint(async (req, res) => {
			const input = requestOf(res, "configurePublication", req.body);
			if (input === undefined) return;
			respond(res, await changeArchitecturePublication(vaultOfRequest(req), "configure", input));
		}),
	);
	app.post(
		"/api/architecture/publication/publish",
		requireVault,
		asyncEndpoint(async (req, res) => {
			const input = requestOf(res, "publish", req.body);
			if (input === undefined) return;
			respond(res, await changeArchitecturePublication(vaultOfRequest(req), "publish", input));
		}),
	);
	app.post(
		"/api/architecture/publication/fetch",
		requireVault,
		asyncEndpoint(async (req, res) => {
			const input = requestOf(res, "fetch", req.body);
			if (input === undefined) return;
			respond(res, await changeArchitecturePublication(vaultOfRequest(req), "fetch", input));
		}),
	);
}

export { mountArchitecturePublicationRoutes };
