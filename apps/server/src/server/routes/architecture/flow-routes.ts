import type { Express } from "express";
import { z } from "zod";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import {
	ArchitectureFlowRenderRequestSchema,
	type ArchitectureModelRead,
} from "@archboard/board/model";
import { renderArchitecture } from "@archboard/renderer/bun";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";
import { respond } from "#server/routes/architecture/model-response.ts";

type Reading = z.infer<typeof ArchitectureFlowRenderRequestSchema>;
/**
 * Read the explicitly selected current or retained flow through the public runtime.
 * @param vault The addressed vault.
 * @param input The explicit behavioral reading.
 * @returns A selected reading or actionable diagnostics.
 */
function flowReading(vault: string, input: Reading) {
	if (input.flow === undefined)
		return {
			success: false as const,
			code: "FLOW_REQUIRED" as const,
			error: "Select a flow for a behavioral reading.",
			diagnostics: [
				{
					code: "FLOW_REQUIRED",
					file: "model.json",
					message: "Sequence and flowchart require one explicit flow.",
					recovery: "Read collections and pass a qualified flow identity.",
				},
			],
		};
	return input.checkpoint === undefined
		? readArchitectureModel(vault, undefined, input.flow)
		: readArchitectureCheckpoint(vault, input.checkpoint, undefined, input.flow);
}
/**
 * Adapt complete selected meaning to the existing renderer operation.
 * @param model The coherent selected architecture reading.
 * @param input The explicit grammar and export theme.
 * @returns The SVG and exact reading receipt.
 */
async function flowPicture(
	model: Extract<ArchitectureModelRead, { success: true }>,
	input: Reading,
) {
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
		grammar: input.grammar,
		policy: model.policy,
		fonts: "embedded",
		theme: input.theme,
	});
	return {
		success: true as const,
		model: model.manifest.id,
		flow: flow.id,
		grammar: input.grammar,
		revision: model.revision,
		checkpoint: model.checkpoint?.id,
		...drawn,
	};
}
/**
 * Mount a thin adapter for explicit behavioral SVG exports.
 * @param app The server application.
 */
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
		const model = await flowReading(vaultOfRequest(req), query.data);
		if (!model.success) {
			respond(res, model);
			return;
		}
		respond(res, await flowPicture(model, query.data));
	});
}
export { mountArchitectureFlowRoutes };
