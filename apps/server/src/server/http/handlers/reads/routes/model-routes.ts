import { mountArchitecturePortableRoutes } from "#server/http/handlers/architecture-writes/routes/portable-routes.ts";
import { mountArchitectureFlowRoutes } from "#server/http/handlers/reads/routes/flow-routes.ts";
import { mountArchitecturePublicationRoutes } from "#server/http/handlers/reads/routes/publication-routes.ts";
import type { Express } from "express";
import { z } from "zod";
import {
	initializeArchitectureArchive,
	listArchitectureCheckpoints,
	readArchitectureModel,
	readModuleNavigation,
	readRetainedModule,
	retainArchitectureCheckpoint,
} from "@archboard/model-store";
import { requestOf, respond } from "#server/http/handlers/routes/model-response.ts";
import { mountArchitectureEditRoutes } from "#server/http/handlers/architecture-writes/routes/model-edit-routes.ts";
import { requireVault, vaultOfRequest } from "#server/http/middleware/request-vault.ts";
import { asyncEndpoint } from "#server/http/middleware/mutation-work.ts";

const QuerySchema = z
	.object({
		vault: z.string(),
		preview: z.string().min(1).optional(),
		legacyAddress: z.string().min(1).optional(),
		bookmark: z.string().min(1).optional(),
		module: z.string().min(1).optional(),
		flow: z.string().min(1).optional(),
		walkthrough: z.string().min(1).optional(),
		shared: z
			.enum(["true", "false"])
			.transform((value) => value === "true")
			.optional(),
		checkpoint: z.string().min(1).optional(),
		ref: z.string().min(1).optional(),
		model: z.string().min(1).optional(),
		references: z
			.enum(["true", "false"])
			.transform((value) => value === "true")
			.optional(),
		reference: z.coerce.number().int().nonnegative().optional(),
		code: z
			.enum(["true", "false"])
			.transform((value) => value === "true")
			.optional(),
		state: z.string().min(1).optional(),
		against: z.string().min(1).optional(),
		beside: z
			.union([z.string().min(1), z.array(z.string().min(1))])
			.transform((value) => [value].flat())
			.optional(),
		compare: z
			.enum(["true", "false"])
			.transform((value) => value === "true")
			.optional(),
	})
	.strict()
	.refine(
		(query) =>
			query.preview !== undefined ||
			query.legacyAddress !== undefined ||
			query.checkpoint === undefined ||
			query.state === undefined,
		"Select either state or checkpoint.",
	)
	.refine(
		(query) => query.ref === undefined || query.checkpoint === undefined,
		"Select either a source ref or a checkpoint.",
	);
const ModuleQuerySchema = z
	.object({
		vault: z.string(),
		module: z.string().min(1),
		state: z.string().min(1).optional(),
		checkpoint: z.string().min(1).optional(),
		ref: z.string().min(1).optional(),
		preview: z.string().min(1).optional(),
		code: z
			.enum(["true", "false"])
			.transform((value) => value === "true")
			.optional(),
	})
	.strict();
const ListQuerySchema = z.object({ vault: z.string() }).strict();
const RetainedModuleQuerySchema = ListQuerySchema.extend({ module: z.string().min(1) }).strict();
/**
 * Expose the shared current and retained architecture contracts.
 * @param app The server application.
 */
function mountArchitectureModelRoutes(app: Express): void {
	mountArchitecturePublicationRoutes(app);
	mountArchitecturePortableRoutes(app);
	mountArchitectureEditRoutes(app);
	mountArchitectureFlowRoutes(app);
	app.post(
		"/api/architecture/archive/init",
		requireVault,
		asyncEndpoint(async (req, res) => {
			if (requestOf(res, "initializeArchive", req.body) === undefined) return;
			respond(res, await initializeArchitectureArchive(vaultOfRequest(req)));
		}),
	);
	app.get(
		["/api/architecture/model", "/api/architecture/proposals"],
		requireVault,
		async (req, res) => {
			const query = QuerySchema.safeParse(req.query);
			if (!query.success) {
				res
					.status(400)
					.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(query.error) });
				return;
			}
			const { vault: _vault, module, flow, ...navigation } = query.data;
			respond(res, await readArchitectureModel(vaultOfRequest(req), module, flow, navigation));
		},
	);
	app.get("/api/architecture/module", requireVault, async (req, res) => {
		const query = ModuleQuerySchema.safeParse(req.query);
		if (!query.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(query.error) });
			return;
		}
		const { vault: _vault, module, ...reading } = query.data;
		respond(res, await readModuleNavigation(vaultOfRequest(req), module, reading));
	});
	app.get("/api/architecture/checkpoints/rows", requireVault, async (req, res) => {
		const query = ListQuerySchema.safeParse(req.query);
		if (!query.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(query.error) });
			return;
		}
		respond(res, await listArchitectureCheckpoints(vaultOfRequest(req), "rows"));
	});
	app.get("/api/architecture/checkpoints", requireVault, async (req, res) => {
		const query = ListQuerySchema.safeParse(req.query);
		if (!query.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(query.error) });
			return;
		}
		respond(res, await listArchitectureCheckpoints(vaultOfRequest(req), "full"));
	});
	app.get("/api/architecture/retained-module", requireVault, async (req, res) => {
		const query = RetainedModuleQuerySchema.safeParse(req.query);
		if (!query.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(query.error) });
			return;
		}
		respond(res, await readRetainedModule(vaultOfRequest(req), query.data.module));
	});
	app.post(
		"/api/architecture/checkpoints",
		requireVault,
		asyncEndpoint(async (req, res) => {
			const input = requestOf(res, "retainCheckpoint", req.body);
			if (input === undefined) return;
			respond(res, await retainArchitectureCheckpoint(vaultOfRequest(req), input));
		}),
	);
}

export { mountArchitectureModelRoutes };
