import type { Express, Request } from "express";
import { z } from "zod";
import { readArchitectureClaims, watchArchitectureModel } from "@archboard/board/store-read";
import {
	editArchitectureModule,
	recoverArchitectureModel,
	claimArchitectureSubjects,
	releaseArchitectureClaim,
	takeBackArchitectureClaim,
} from "@archboard/board/store-write";
import {
	ArchitectureModuleEditSchema,
	ArchitectureClaimRequestSchema,
	ArchitectureClaimReleaseSchema,
	ArchitectureClaimTakeBackSchema,
	type ArchitectureModelRead,
} from "@archboard/board/model";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";
import { asyncEndpoint } from "#server/middleware/mutation-work/mutation-work.ts";
import { respond } from "#server/routes/architecture/model-response.ts";
const EnvelopeSchema = z.object({ vault: z.string().optional() }).catchall(z.unknown());
const VaultQuerySchema = z.object({ vault: z.string() }).strict();

/**
 * Mount one thin adapter over the shared operation schema and runtime.
 * @param app The server application.
 * @param path The HTTP operation path.
 * @param schema The authoritative schema.
 * @param operation The shared runtime operation.
 */
function post<T>(
	app: Express,
	path: string,
	schema: z.ZodType<T>,
	operation: (
		vault: string,
		input: T,
	) => Promise<{ success: true } | Extract<ArchitectureModelRead, { success: false }>>,
): void {
	app.post(
		path,
		requireVault,
		asyncEndpoint(async (req, res) => {
			const envelope = EnvelopeSchema.safeParse(req.body);
			if (!envelope.success) {
				res.status(400).json({
					success: false,
					code: "INVALID_REQUEST",
					error: z.prettifyError(envelope.error),
				});
				return;
			}
			const { vault: _vault, ...input } = envelope.data;
			const parsed = schema.safeParse(input);
			if (!parsed.success) {
				res
					.status(400)
					.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(parsed.error) });
				return;
			}
			respond(res, await operation(vaultOfRequest(req), parsed.data));
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
	post(app, "/api/architecture/module", ArchitectureModuleEditSchema, editArchitectureModule);
	post(app, "/api/architecture/claims", ArchitectureClaimRequestSchema, claimArchitectureSubjects);
	post(
		app,
		"/api/architecture/claims/release",
		ArchitectureClaimReleaseSchema,
		releaseArchitectureClaim,
	);
	post(
		app,
		"/api/architecture/claims/take-back",
		ArchitectureClaimTakeBackSchema,
		takeBackArchitectureClaim,
	);
	post(app, "/api/architecture/recover", z.object({}).strict(), recoverArchitectureModel);
	app.get("/api/architecture/claims", requireVault, (req, res) => {
		if (!validQuery(req)) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: "Name only the addressed vault." });
			return;
		}
		respond(res, readArchitectureClaims(vaultOfRequest(req)));
	});
	app.get("/api/architecture/events", requireVault, (req, res) => {
		if (!validQuery(req)) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: "Name only the addressed vault." });
			return;
		}
		res.set({
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-store",
			Connection: "keep-alive",
		});
		res.flushHeaders();
		const stop = watchArchitectureModel(vaultOfRequest(req), (event) => {
			res.write(`data: ${JSON.stringify(event)}\n\n`);
		});
		res.once("close", stop);
	});
}
export { mountArchitectureEditRoutes };
