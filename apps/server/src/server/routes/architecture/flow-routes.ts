import type { Express } from "express";
import { z } from "zod";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import { ArchitectureFlowRenderRequestSchema } from "@archboard/board/model";
import { renderArchitecture } from "@archboard/renderer/bun";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";
import { respond } from "#server/routes/architecture/model-response.ts";

/** Render an explicit behavioral reading through the existing renderer operation. */
function mountArchitectureFlowRoutes(app: Express): void {
	app.get("/api/architecture/render", requireVault, async (req, res) => {
		const query = ArchitectureFlowRenderRequestSchema.extend({ vault: z.string() }).safeParse(
			req.query,
		);
		if (!query.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(query.error) });
			return;
		}
		const { flow: selector, grammar, checkpoint, theme } = query.data;
		if (selector === undefined) {
			respond(res, {
				success: false,
				code: "FLOW_REQUIRED",
				error: "Select a flow for a behavioral reading.",
				diagnostics: [
					{
						code: "FLOW_REQUIRED",
						file: "model.json",
						message: "Sequence and flowchart require one explicit flow.",
						recovery: "Read collections and pass a qualified flow identity.",
					},
				],
			});
			return;
		}
		const model =
			checkpoint === undefined
				? readArchitectureModel(vaultOfRequest(req), undefined, selector)
				: await readArchitectureCheckpoint(vaultOfRequest(req), checkpoint, undefined, selector);
		if (!model.success) {
			respond(res, model);
			return;
		}
		const flow = model.collections
			.flatMap((collection) => collection.flows)
			.find((value) => value.id === model.selectedFlow)!;
		const content = {
			nodes: model.modules.filter((module) => flow.participants.includes(module.id)),
			edges: [],
			flows: [flow],
			walkthroughs: [],
		};
		const drawn = await renderArchitecture({
			content,
			grammar,
			policy: model.policy,
			fonts: "embedded",
			...(theme === undefined ? {} : { theme }),
		});
		const result = {
			success: true as const,
			model: model.manifest.id,
			flow: flow.id,
			grammar,
			revision: model.revision,
			...(checkpoint === undefined ? {} : { checkpoint }),
			...drawn,
		};
		respond(res, result);
	});
}
export { mountArchitectureFlowRoutes };
