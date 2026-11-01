import { z } from "zod";
import {
	ArchitectureHistoryRequestSchema,
	ArchitectureHistoryResultSchema,
} from "@archboard/code-intel/history";
import { architectureResult } from "#cli/clients/server/architecture-model.ts";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import { serverRefusal } from "#cli/protocol/contract/refusals.ts";
import { historyLines, unreadLines } from "#cli/operations/model/history-lines.ts";

/** What each analysis answers, and what each option of it means. */
const WORDS = {
	locality: {
		summary: "Rank modules by how often their code changes, and find modules that change together",
		description:
			"Reads the selected state against the local Git history of every repository its modules bind. Answers which modules are hotspots, with the most commits in the period, and which pairs are coupled: they changed in the same commits, in at least 5 shared commits and 30% of their own. Names the modules it could not read and why. Source refs stay local and no source history is retained.",
		options: {
			state: "Read this draft by identity or name; current when absent",
			checkpoint: "Read this exact retained checkpoint instead of a live state",
			against: "Read the state beside this one, so the answer says what a plan joins",
			since:
				"Start the period at this date, or at a date and time with offset; a year before each HEAD when absent",
		},
	},
	footprint: {
		summary: "Compare a source branch with the architecture: which modules its commits changed",
		description:
			"Reads the commits between --base and HEAD in every repository the selected state binds, and answers which modules they changed. With a draft selected, it sets those against the draft: planned and changed, changed outside the plan, and planned but unchanged. A repository that cannot read the base or head is named, and the command exits 2. Source refs stay local and no source history is retained.",
		options: {
			state: "Read this draft by identity or name; current when absent",
			checkpoint: "Read this exact retained checkpoint instead of a live state",
			against: "Read the draft beside this state; its base or current when absent",
			base: "The Git ref the branch started from, such as main (required)",
			head: "The Git ref the commits run up to; the HEAD of each checkout when absent",
		},
	},
} as const;

/**
 * What an option of an analysis means.
 * @param name The analysis.
 * @param key The option.
 * @returns Its description.
 */
function optionWords(name: keyof typeof WORDS, key: string): string {
	const options: Readonly<Record<string, string>> = WORDS[name].options;
	return options[key] ?? `The ${key} selector`;
}
/**
 * Define a thin command over one canonical history route.
 * @param name The analysis operation.
 * @param input The runtime request schema.
 * @param result The runtime result schema.
 * @returns The discoverable command contract.
 */
function historyCommand<I extends z.ZodRawShape>(
	name: "locality" | "footprint",
	input: z.ZodObject<I>,
	result: typeof ArchitectureHistoryResultSchema,
) {
	return defineCommand({
		path: ["model", name],
		shared: ["url", "directory"],
		summary: WORDS[name].summary,
		description: WORDS[name].description,
		examples: [`archboard model ${name}${name === "footprint" ? " --base main" : ""}`],
		parameters: Object.keys(input.shape).map((key) => ({
			kind: "option" as const,
			key,
			spellings: [`--${key}`] as const,
			value: "required" as const,
			placeholder: key,
			description: optionWords(name, key),
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
					presentation: ["diagnostics", "result"],
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
			{
				id: "unread",
				exit: 2,
				stream: "stdout-and-stderr",
				presentation: ["diagnostics", "result"],
				description: "A repository could not read the base or head that was named",
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
			if (!answer.success) {
				return {
					result: answer,
					outcome: "unavailable" as const,
					diagnostics: answer.diagnostics.map(
						(item) => `${item.code}: ${item.message} ${item.recovery}`,
					),
				};
			}
			return {
				result: answer,
				diagnostics: historyLines(answer),
				...(unreadLines(answer).length === 0 ? {} : { outcome: "unread" as const }),
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
