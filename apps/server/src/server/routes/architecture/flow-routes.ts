import type { Express } from "express";
import { z } from "zod";
import { readArchitectureModel } from "@archboard/board/store-read";
import {
	ArchitectureRenderRequestSchema,
	type ArchitectureModelRead,
} from "@archboard/board/model";
import { projectModel, projectFlow } from "@archboard/board/content";
import {recordArchitectureRecipe} from "@archboard/renderer/recipe";
import {vaultIdentity} from "@archboard/code-binding/resolution";
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
	return readArchitectureModel(vault,input.module,input.flow,{state:input.state,checkpoint:input.checkpoint});
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
 vault:string,
) {
 const architecture = projectModel(model,input.scope ?? model.selectedModule ?? null,input.focus ?? null,{hideKinds:input.hideKinds,hideGroups:input.hideGroups});
 const flow = model.collections.flatMap((collection)=>collection.flows).find((value)=>value.id===model.selectedFlow);
 const {content} = input.grammar === "architecture" ? architecture : projectFlow(architecture,flow!);
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
		...(input.grammar === "architecture" ? {} : {flow:flow!.id}),
		grammar: input.grammar,
		revision: model.revision,
		checkpoint: model.checkpoint?.id,
		...Object.fromEntries(Object.entries(drawn).filter(([key])=>key!=="readingDirection")),
 svg:recordArchitectureRecipe(drawn.svg,model,input,vaultIdentity(vault)??null), width:drawn.width,height:drawn.height,placed:drawn.placed,atlas:drawn.atlas,
	};
}
/**
 * Mount a thin adapter for explicit behavioral SVG exports.
 * @param app The server application.
 */
function mountArchitectureFlowRoutes(app: Express): void {
	app.get("/api/architecture/render", requireVault, async (req, res) => {
		const query = ArchitectureRenderRequestSchema.extend({ vault: z.string() }).safeParse(
 {...req.query, ...Object.fromEntries(["focus","hideKinds","hideGroups"].filter((key)=>typeof req.query[key] === "string").map((key)=>[key,[req.query[key]]]))},
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
		respond(res, await flowPicture(model, query.data,vaultOfRequest(req)));
	});
}
export { mountArchitectureFlowRoutes };
