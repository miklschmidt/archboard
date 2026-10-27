import type { Express } from "express";
import { z } from "zod";
import { readArchitectureModel } from "@archboard/board/store-read";
import {
	ArchitectureRenderRequestSchema,
	type ArchitectureModelRead,
} from "@archboard/board/model";
import { projectModel, projectFlow } from "@archboard/board/content";
import { recordArchitectureRecipe } from "@archboard/renderer/recipe";
import { vaultIdentity } from "@archboard/code-binding/resolution";
import { renderArchitecture } from "@archboard/renderer/bun";
import { requireVault, vaultOfRequest } from "@archboard/workbench/host";
import { respond } from "#server/routes/architecture/model-response.ts";

type Reading = z.infer<typeof ArchitectureRenderRequestSchema>;
/**
 * Read the explicitly selected current or retained flow through the public runtime.
 * @param vault The addressed vault.
 * @param input The explicit behavioral reading.
 * @returns A selected reading or actionable diagnostics.
 */
function flowReading(vault: string, input: Reading) {
	if (input.grammar !== "architecture" && input.flow === undefined)
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
	return readArchitectureModel(vault, input.module, input.flow, {
		state: input.state,
		checkpoint: input.checkpoint,
	});
}
/**
 * Adapt complete selected meaning to the existing renderer operation.
 * @param model The coherent selected architecture reading.
 * @param input The explicit grammar and export theme.
 * @param vault The addressed vault.
 * @returns The SVG and exact reading receipt.
 */
async function flowPicture(
	model: Extract<ArchitectureModelRead, { success: true }>,
	input: Reading,
	vault: string,
) {
	const { architecture, flow, content } = renderProjection(model, input);
	if (architecture.missing || architecture.missingFocus.length !== 0)
		return {
			success: false as const,
			code: "MODULE_NOT_FOUND" as const,
			error: "The requested scope or focus is unavailable.",
			diagnostics: [
				{
					code: "MODULE_NOT_FOUND",
					file: "model.json",
					message: "The requested scope or focus is unavailable.",
					recovery: "Read the model and select existing qualified module identities.",
				},
			],
		};
	const drawn = await renderArchitecture({
		content,
		grammar: input.grammar,
		policy: model.policy,
		fonts: "embedded",
		theme: input.theme,
	});
	return renderReceipt(model, input, vault, drawn, flow);
}
/**
 * Project structural scope and complete behavioral meaning through shared rules.
 * @param model The coherent reading.
 * @param input The requested presentation.
 * @returns The structural projection, selected flow, and complete content.
 */
function renderProjection(
	model: Extract<ArchitectureModelRead, { success: true }>,
	input: Reading,
) {
	const architecture = projectModel(
		model,
		input.scope ?? model.selectedModule ?? null,
		input.focus ?? null,
		{ hideKinds: input.hideKinds, hideGroups: input.hideGroups },
	);
	const flow = model.collections
		.flatMap((collection) => collection.flows)
		.find((value) => value.id === model.selectedFlow);
	return {
		architecture,
		flow,
		content:
			input.grammar === "architecture"
				? architecture.content
				: projectFlow(architecture, flow!).content,
	};
}
/**
 * Attach exact reading evidence through the existing recipe owner.
 * @param model The coherent architecture.
 * @param input The public selectors.
 * @param vault The addressed vault.
 * @param drawn The existing renderer result.
 * @param flow The selected authored flow.
 * @returns The canonical rendering receipt.
 */
function renderReceipt(
	model: Extract<ArchitectureModelRead, { success: true }>,
	input: Reading,
	vault: string,
	drawn: Awaited<ReturnType<typeof renderArchitecture>>,
	flow: ReturnType<typeof renderProjection>["flow"],
) {
	return {
		success: true as const,
		model: model.manifest.id,
		state: model.selectedState?.id ?? null,
		...(input.grammar === "architecture" ? {} : { flow: flow!.id }),
		grammar: input.grammar,
		revision: model.revision,
		checkpoint: model.checkpoint?.id,
		svg: recordArchitectureRecipe(drawn.svg, model, input, vaultIdentity(vault) ?? null),
		width: drawn.width,
		height: drawn.height,
		placed: drawn.placed,
		atlas: drawn.atlas,
	};
}
/**
 * Mount a thin adapter for explicit behavioral SVG exports.
 * @param app The server application.
 */
function mountArchitectureFlowRoutes(app: Express): void {
	app.get("/api/architecture/render", requireVault, async (req, res) => {
		const query = ArchitectureRenderRequestSchema.extend({ vault: z.string() }).safeParse({
			...req.query,
			...Object.fromEntries(
				["focus", "hideKinds", "hideGroups"]
					.filter((key) => typeof req.query[key] === "string")
					.map((key) => [key, [req.query[key]]]),
			),
		});
		if (!query.success) {
			res
				.status(400)
				.json({ success: false, code: "INVALID_REQUEST", error: z.prettifyError(query.error) });
			return;
		}
		const { vault: _vault, ...reading } = query.data;
		const model = await flowReading(vaultOfRequest(req), reading);
		if (!model.success) {
			respond(res, model);
			return;
		}
		respond(res, await flowPicture(model, reading, vaultOfRequest(req)));
	});
}
export { mountArchitectureFlowRoutes };
