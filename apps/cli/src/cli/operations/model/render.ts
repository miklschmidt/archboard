import { z } from "zod";
import {
	ArchitectureFlowRenderRequestSchema,
	ArchitectureFlowRenderResultSchema,
} from "@archboard/board/model";
import { renderArchitectureFlowOnServer } from "#cli/clients/server/architecture-model.ts";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import { serverRefusal } from "#cli/protocol/contract/refusals.ts";
import { PendingArtifactSchema } from "#cli/protocol/contract/schemas.ts";
const InputSchema = ArchitectureFlowRenderRequestSchema.extend({ out: z.string() });
const modelRenderContract = defineCommand({
	path: ["model", "render"],
	shared: ["url", "directory"],
	summary: "Render one explicitly selected canonical flow",
	description:
		"Sequence and flowchart require an explicit flow identity or unique name. The complete flow includes every participant, independently of module scope and structural filters.",
	examples: ["archboard model render --flow 'Shop#Checkout' --grammar sequence --out request.svg"],
	parameters: [
		{
			kind: "option",
			key: "flow",
			spellings: ["--flow"],
			value: "required",
			placeholder: "id",
			description: "One qualified flow identity or unique current or former name",
		},
		{
			kind: "option",
			key: "grammar",
			spellings: ["--grammar"],
			value: "required",
			placeholder: "grammar",
			choices: ArchitectureFlowRenderRequestSchema.shape.grammar.options,
			description: "Draw sequence or flowchart",
		},
		{
			kind: "option",
			key: "checkpoint",
			spellings: ["--checkpoint"],
			value: "required",
			placeholder: "id",
			description: "Read this exact retained checkpoint",
		},
		{
			kind: "option",
			key: "theme",
			spellings: ["--theme"],
			value: "required",
			placeholder: "theme",
			choices: ["auto", "light", "dark"],
			description: "The standalone SVG theme",
		},
		{
			kind: "option",
			key: "out",
			spellings: ["--out"],
			value: "required",
			placeholder: "file.svg",
			description: "Write the self-contained SVG to this file",
		},
	],
	input: { ingress: InputSchema },
	result: z.union([
		ArchitectureFlowRenderResultSchema.options[0]
			.omit({ svg: true, atlas: true })
			.extend({ file: z.string() }),
		ArchitectureFlowRenderResultSchema.options[1],
	]),
	output: {
		cases: [
			{
				id: "file",
				when: {},
				mode: "file-receipt",
				artifact: PendingArtifactSchema,
				description: "The exact reading receipt or structured refusal",
			},
		],
		/**
		 * Select the SVG file receipt.
		 * @returns The file output case.
		 */
		select: () => "file",
	},
	prerequisites: ["server"],
	effects: ["read", "local-write"],
	refusals: [serverRefusal],
	outcomes: [
		{
			id: "unavailable",
			exit: 2,
			stream: "stdout-and-stderr",
			presentation: ["diagnostics", "result"],
			description: "The selected flow is unavailable or missing",
		},
	],
	relationships: [
		{
			method: "GET",
			path: "/api/architecture/render",
			cardinality: "one",
			description: "Render the explicit behavioral reading",
		},
	],
	/**
	 * Render the explicitly selected flow and defer artifact installation until success.
	 * @param input The selected flow, grammar, checkpoint, and file.
	 * @param context The invocation capabilities.
	 * @returns A file receipt or an explicit refusal.
	 */
	async handler(input, context) {
		await context.require("server", "model render");
		const { out, ...request } = input;
		const result = await renderArchitectureFlowOnServer(request);
		if (!result.success)
			return {
				result,
				outcome: "unavailable",
				diagnostics: result.diagnostics.map(
					(value) => `${value.code}: ${value.message} ${value.recovery}`,
				),
			};
		const { svg, atlas: _atlas, ...receipt } = result;
		const file = context.resolvePath(out);
		return {
			result: { ...receipt, file },
			pendingArtifact: { path: file, content: svg, encoding: "utf8" as const },
		};
	},
});
export { modelRenderContract };
