import type { Express, Response } from "express";
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
	ArchitecturePublicationSchema,
} from "@archboard/board/model";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";

const failureStatuses: Partial<
	Record<Extract<z.infer<typeof ArchitecturePublicationSchema>, { success: false }>["code"], number>
> = {
	ARCHITECTURE_UNAVAILABLE: 404,
	CHECKPOINT_INVALID: 422,
	PUBLICATION_NOT_CONFIGURED: 409,
	PUBLICATION_DESTINATION_CHANGED: 409,
	ARCHIVE_NOT_INITIALIZED: 409,
	ARCHIVE_IN_USE: 409,
	ARCHIVE_BUSY: 409,
	ARCHIVE_NETWORK_FAILED: 502,
};

/**
 * Preserve the common publication result and disable response caching.
 * @param res The outgoing response.
 * @param result The runtime outcome.
 */
function respond(res: Response, result: z.infer<typeof ArchitecturePublicationSchema>) {
	res
		.set("Cache-Control", "no-store")
		.status(result.success ? 200 : (failureStatuses[result.code] ?? 422))
		.json(result);
}

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
