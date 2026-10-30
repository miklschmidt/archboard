import type { ArchitectureModelRead } from "@archboard/board/model";
import { z } from "zod";
import {
	ArchitectureHistoryRequestSchema,
	ArchitectureHistoryResultSchema,
} from "@archboard/code-intel/history";
import { architectureResult } from "#cli/clients/server/architecture-model.ts";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import { serverRefusal } from "#cli/protocol/contract/refusals.ts";
/**
 * Define a thin command over one canonical history route.
 * @param name The analysis operation.
 * @param input The runtime request schema.
 * @param result The runtime result schema.
 * @returns The discoverable command contract.
 */
function historyCommand<
	I extends z.ZodRawShape,
	O extends { success: true } | Extract<ArchitectureModelRead, { success: false }>,
>(name: "locality" | "footprint", input: z.ZodObject<I>, result: z.ZodType<O>) {
	return defineCommand({
		path: ["model", name],
		shared: ["url", "directory"],
		summary:
			name === "locality"
				? "Read canonical module change frequency and coupling"
				: "Read a local source branch footprint against canonical architecture",
		description:
			"Reads canonical semantic content through existing local Git analysis. Source refs remain local and no source history is retained.",
		examples: [`archboard model ${name}${name === "footprint" ? " --base main" : ""}`],
		parameters: Object.keys(input.shape).map((key) => ({
			kind: "option" as const,
			key,
			spellings: [`--${key}`] as const,
			value: "required" as const,
			placeholder: key,
			description: `The explicit ${key} selector`,
		})),
		input: { ingress: input },
		result,
		output: {
			cases: [
				{
					id: "json",
					when: {},
					mode: "json",
					description: "Canonical revision and source analysis evidence",
				},
			],
			/**
			 * Select the json output case.
			 * @returns The declared output identity.
			 */
			select: () => "json",
		},
		prerequisites: ["server"],
		effects: ["read"],
		outcomes: [
			{
				id: "unavailable",
				exit: 2,
				stream: "stdout-and-stderr",
				presentation: ["diagnostics", "result"],
				description: "The selected canonical architecture is unavailable",
			},
		],
		refusals: [serverRefusal],
		relationships: [
			{
				method: "GET",
				path: `/api/architecture/${name}`,
				cardinality: "one",
				description: "Read canonical architecture and local source evidence",
			},
		],
		/**
		 * Read the selected canonical analysis.
		 * @param request The public request.
		 * @param context The invocation.
		 * @returns The runtime result.
		 */
		async handler(request, context) {
			await context.require("server", `model ${name}`);
			const query = new URLSearchParams(
				Object.entries(request).filter(
					(entry): entry is [string, string] => typeof entry[1] === "string",
				),
			);
			const answer = await architectureResult(result, `/api/architecture/${name}?${query}`);
			return {
				result: answer,
				...(answer.success
					? {}
					: {
							outcome: "unavailable" as const,
							diagnostics: answer.diagnostics.map(
								(item) => `${item.code}: ${item.message} ${item.recovery}`,
							),
						}),
			};
		},
	});
}
const modelLocalityContract = historyCommand(
	"locality",
	ArchitectureHistoryRequestSchema.options[0].omit({ analysis: true }),
	ArchitectureHistoryResultSchema,
);
const modelFootprintContract = historyCommand(
	"footprint",
	ArchitectureHistoryRequestSchema.options[1].omit({ analysis: true }),
	ArchitectureHistoryResultSchema,
);
export { modelLocalityContract, modelFootprintContract };
