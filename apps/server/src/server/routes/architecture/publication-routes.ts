import type { Express } from "express";
import { z } from "zod";
import { readArchitecturePublication } from "@archboard/board/store-read";
import {
	configureArchitecturePublication,
	publishArchitectureHistory,
	fetchArchitectureHistory,
} from "@archboard/board/store-write";
import {
	ArchitecturePublicationDestinationSchema,
	ArchitecturePublicationRequestSchema,
} from "@archboard/board/model";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";
import { respond } from "#server/routes/architecture/model-response.ts";

/**
 * Mount explicit history operations. Every request names its vault.
 * @param app The server application.
 */
function mountArchitecturePublicationRoutes(app: Express) {
	app.get("/api/architecture/publication", requireVault, async (req, res) => {
		const query = ArchitecturePublicationRequestSchema.pick({ checkpoint: true })
			.extend({ vault: z.string() })
			.safeParse(req.query);
		if (!query.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(query.error) });
			return;
		}
		respond(res, await readArchitecturePublication(vaultOfRequest(req), query.data.checkpoint));
	});
	app.post("/api/architecture/publication/configure", requireVault, async (req, res) => {
		const parsed = ArchitecturePublicationDestinationSchema.extend({
			vault: z.string().optional(),
		}).safeParse(req.body);
		if (!parsed.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(parsed.error) });
			return;
		}
		const { vault: _vault, ...input } = parsed.data;
		respond(res, await configureArchitecturePublication(vaultOfRequest(req), input));
	});
	for (const [action, operation] of [
		["publish", publishArchitectureHistory],
		["fetch", fetchArchitectureHistory],
	] as const) {
		app.post(`/api/architecture/publication/${action}`, requireVault, async (req, res) => {
			const parsed = ArchitecturePublicationRequestSchema.extend({
				vault: z.string().optional(),
			}).safeParse(req.body);
			if (!parsed.success) {
				res
					.status(400)
					.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(parsed.error) });
				return;
			}
			const { vault: _vault, ...input } = parsed.data;
			respond(res, await operation(vaultOfRequest(req), input));
		});
	}
}

export { mountArchitecturePublicationRoutes };
