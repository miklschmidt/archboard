import { z } from "zod";
import {
	architectureRenderRequestSchema,
	architectureRenderResultSchema,
} from "@archboard/model/contract";
import { standaloneThemeSchema } from "@archboard/model/render-reply";
import { lineEffectSchema, retiredCallAdvice } from "@archboard/model/policy";
import { renderArchitectureFlowOnServer } from "#cli/server-access/clients/architecture-model.ts";
import { CliUsageError, defineCommand } from "#cli/contract/protocol/contract.ts";
import { refusal } from "#cli/contract/protocol/refusals.ts";
import { pendingArtifactSchema } from "#cli/contract/protocol/schemas.ts";
const InputSchema = architectureRenderRequestSchema().extend({
	out: z.string(),
	theme: standaloneThemeSchema().default("auto"),
});
/**
 * Refuse a hidden kind that names call, which names neither of the kinds that replace it.
 * @param hideKinds The kinds hidden, when any are.
 * @throws {CliUsageError} When one of them is call.
 */
function refuseRetiredKind(hideKinds: readonly string[] | undefined): void {
	const retired = hideKinds?.map(retiredCallAdvice).find((advice) => advice !== undefined);
	if (retired !== undefined)
		throw new CliUsageError(
			`--hide-kind call: ${retired}. Pass --hide-kind sync, --hide-kind async, or both.`,
		);
}
/**
 * Refuse a selector that the grammar would silently ignore: a flow in the architecture grammar, and
 * a lens in a behavioral one, which draws every message of its flow. Refuse the retired kind call
 * too.
 * @param request The selected reading.
 * @param request.flow The named flow, when there is one.
 * @param request.lens The named lens, when there is one.
 * @param request.grammar The grammar the reading draws.
 * @param request.hideKinds The kinds hidden, when any are.
 * @throws {CliUsageError} When a selector does not fit the grammar or names call.
 */
function requireGrammarForFlow(request: {
	flow?: string | undefined;
	lens?: string | undefined;
	grammar: string;
	hideKinds?: readonly string[] | undefined;
}): void {
	refuseRetiredKind(request.hideKinds);
	if (request.flow !== undefined && request.grammar === "architecture")
		throw new CliUsageError(
			`--flow ${request.flow} needs a behavioral grammar: add --grammar sequence or --grammar flowchart.`,
		);
	if (request.lens !== undefined && request.grammar !== "architecture")
		throw new CliUsageError(
			`--lens ${request.lens} reads a structural picture: a ${request.grammar} draws every message of its flow. Leave out --lens.`,
		);
}
const modelRenderContract = defineCommand({
	path: ["model", "render"],
	shared: ["url", "directory"],
	summary: "Render a canonical architecture or behavioral reading",
	description:
		"The `sequence` and `flowchart` grammars require an explicit flow identity or unique name. The complete flow includes every participant, independently of module scope and structural filters.",
	examples: ["archboard model render --flow 'Shop#Checkout' --grammar sequence --out request.svg"],
	parameters: [
		...(
			[
				["module", "Select a module by identity or unique name"],
				["state", "Select an explicit architectural state"],
				["scope", "Open an exact module scope"],
				[
					"lens",
					"Show the relationships this lens selects, by id. Without it, the vault's default lens",
				],
			] as const
		).map(([key, description]) => ({
			kind: "option" as const,
			key,
			spellings: [`--${key}`] as const,
			value: "required" as const,
			placeholder: "id",
			description,
		})),
		...(
			[
				["focus", "--focus", "Focus these identities"],
				["hideKinds", "--hide-kind", "Also hide this relationship kind. Repeat to hide more kinds"],
				["expand", "--expand", "Open these modules beside the scope"],
			] as const
		).map(([key, spelling, description]) => ({
			kind: "option" as const,
			key,
			spellings: [spelling] as const,
			value: "required" as const,
			occurrences: "append" as const,
			placeholder: "id",
			description,
		})),
		{
			kind: "option",
			key: "hideEffects",
			spellings: ["--hide-effect"],
			value: "required",
			occurrences: "append",
			placeholder: "effect",
			choices: lineEffectSchema().options,
			description:
				"Also hide relationships with this effect; `declared` is a dependency that states none. Repeat to hide more effects",
		},
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
			choices: architectureRenderRequestSchema().shape.grammar.removeDefault().options,
			description: "Draw `sequence` or `flowchart`",
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
			default: "auto",
			description: "The standalone SVG theme",
		},
		{
			kind: "option",
			key: "legend",
			spellings: ["--legend"],
			value: "required",
			placeholder: "layout",
			choices: architectureRenderRequestSchema().shape.legend.removeDefault().options,
			default: "horizontal",
			description:
				"Draw the legend under the picture, beside it (`vertical`), or not at all (`none`)",
		},
		{
			kind: "option",
			key: "out",
			spellings: ["--out"],
			value: "required",
			placeholder: "file.svg",
			required: true,
			description: "Write the self-contained SVG to this file",
		},
	],
	input: { ingress: InputSchema },
	result: z.union([
		architectureRenderResultSchema()
			.options[0].omit({ svg: true, atlas: true })
			.extend({ file: z.string() }),
		architectureRenderResultSchema().options[1],
	]),
	output: {
		cases: [
			{
				id: "file",
				when: {},
				mode: "file-receipt",
				artifact: pendingArtifactSchema(),
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
	refusals: [refusal("server")],
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
		requireGrammarForFlow(request);
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
export { modelRenderContract, requireGrammarForFlow };
