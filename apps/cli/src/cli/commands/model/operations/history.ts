import { z } from "zod";
import {
	ArchitectureHistoryRequestSchema,
	ArchitectureHistoryResultSchema,
} from "@archboard/code-intel/history";
import { architectureResult } from "#cli/server-access/clients/architecture-model.ts";
import { CliUsageError, defineCommand } from "#cli/contract/protocol/contract.ts";
import { serverRefusal } from "#cli/contract/protocol/refusals.ts";
import {
	type Answer,
	historyLines,
	unreadLines,
} from "#cli/commands/model/operations/history-lines.ts";

/** What each analysis answers, and what each option of it means. */
const WORDS = {
	locality: {
		summary: "Rank modules by how often their code changes, and find modules that change together",
		description: [
			"Reads the selected state against the local Git history of every repository its modules bind.",
			"",
			"It answers:",
			"- Which modules are hotspots, with the most commits in the period.",
			"- Which pairs are coupled: they changed in the same commits, in at least 5 shared commits and 30% of their own.",
			"",
			"It also names the modules it could not read and why. Source refs stay local and no source history is retained.",
		].join("\n"),
		options: {
			state: "Read this draft by identity or name; current when absent",
			checkpoint: "Read this exact retained checkpoint instead of a live state",
			against: "Read the state beside this one, so the answer says what a plan joins",
			since:
				"Start the period at this date, or at a date and time with offset; a year before each `HEAD` when absent",
		},
	},
	footprint: {
		summary: "Compare a source branch with the architecture: which modules its commits changed",
		description: [
			"Reads the commits between `--base` and `HEAD` in every repository the selected state binds, and answers which modules they changed.",
			"",
			"With a draft selected, it sets those against the draft:",
			"- Planned and changed.",
			"- Changed outside the plan.",
			"- Planned but unchanged.",
			"",
			"Each changed module lists, in `holds`, the other changed modules bound inside it, because a module bound to a directory changes with each of them. It lists them only when they bind each file that the commits changed in its own binding. A module that holds another is not counted as changed outside the plan.",
			"",
			"It also lists, in `unboundFiles`, each changed file that no module is bound to, because no module shows that change. The files of the vault are not listed.",
			"",
			"With `--fail-outside`, it exits 1 when the commits changed a module that the draft does not name. A module bound to a directory passes when each file it changed lies in the binding of another changed module inside it. If the commits also changed a file that only the outer module binds, the outer module fails. A file that no module is bound to never fails it. A gate before a merge uses it.",
			"",
			"With `--head`, the selected state is read from the vault as the repository that holds the vault has it at that head, without a checkout. A head that only a code repository has leaves the vault on disk. `--model-at checkout` reads the vault on disk, for a gate that runs where the draft was just edited. The answer's `vaultRead` names the vault it read.",
			"",
			"A repository that cannot read the base or head is named, and the command exits 2. Source refs stay local and no source history is retained.",
		].join("\n"),
		options: {
			state:
				"Read this draft by identity or name; current when absent. It names a draft of the vault that this command reads: with `--head`, the vault at that head, unless `--model-at checkout`",
			checkpoint: "Read this exact retained checkpoint instead of a live state",
			against: "Read the draft beside this state; its base or current when absent",
			base: "The Git ref the branch started from, such as `main` (required)",
			head: "The Git ref the commits run up to; the `HEAD` of each checkout when absent",
			modelAt:
				"`head` (default) reads the vault as the repository that holds it has it at `--head`, so the head's own drafts and bindings count; `checkout` reads the vault on disk. With no `--head`, or a head that only a code repository has, it reads the vault on disk",
		},
	},
} as const;

/** The footprint's gate, which the CLI judges and the server never reads: `--fail-outside`. */
const FailOutsideSchema = z.object({ failOutside: z.boolean().optional() });

const failOutsideParameter = {
	kind: "option",
	key: "failOutside",
	spellings: ["--fail-outside"],
	value: "none",
	description:
		"Exit 1 when the commits changed a module that the draft does not name. It needs a draft from `--state`",
} as const;

const failOutsideStage = {
	name: "fail-outside-draft",
	when: "before-server" as const,
	description: "Only a draft names modules, so the gate needs one",
	rules: ["Refuse --fail-outside without --state"],
	schema: FailOutsideSchema.extend({ state: z.string().optional() }).refine(
		(input) => input.failOutside !== true || input.state !== undefined,
		"--fail-outside judges the commits against a draft: name it with --state",
	),
};

const outsideOutcome = {
	id: "outside",
	exit: 1,
	stream: "stdout-and-stderr" as const,
	presentation: ["diagnostics", "result"] as const,
	description: "With `--fail-outside`, the commits changed a module that the draft does not name",
};

/**
 * The modules that `--fail-outside` fails on: those the commits changed and the draft does not name,
 * except a directory that holds another changed module because that module binds each file it changed.
 * @param answer The answer of the server.
 * @param failOutside Whether `--fail-outside` was given.
 * @returns The changed modules outside the draft, or none when the gate is off.
 */
function outsideOf(answer: Answer, failOutside: boolean) {
	if (!failOutside || answer.analysis !== "footprint") return [];
	if (!("changedNotNamed" in answer)) {
		throw new CliUsageError(
			`--fail-outside judges the commits against a draft, and ${answer.state?.name ?? "the selected state"} is no draft. Name a draft with --state; \`archboard model proposals\` lists them.`,
		);
	}
	return answer.changedNotNamed.filter((part) => part.holds.length === 0);
}

/**
 * What an answer says on standard error, and the outcome it exits with.
 * @param answer The answer of the server.
 * @param failOutside Whether `--fail-outside` was given.
 * @returns The diagnostics, and the outcome when it is not success.
 */
function judged(
	answer: Answer,
	failOutside: boolean,
): { diagnostics: string[]; outcome?: "unread" | "outside" } {
	const outside = outsideOf(answer, failOutside);
	const names = outside.map(({ subject }) => subject.name).join(", ");
	const diagnostics = [
		...historyLines(answer),
		...(outside.length === 0
			? []
			: [`Changed outside the draft: ${names}. Name each in the draft, or undo its change.`]),
	];
	if (unreadLines(answer).length > 0) return { diagnostics, outcome: "unread" };
	return outside.length === 0 ? { diagnostics } : { diagnostics, outcome: "outside" };
}

/**
 * An option's key as the command line spells it.
 * @param key The camel-case key.
 * @returns The dashed spelling, such as `model-at`.
 */
function kebab(key: string): string {
	return key.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

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
	const gated = name === "footprint";
	const ingress = input.extend(gated ? FailOutsideSchema.shape : {});
	return defineCommand({
		path: ["model", name],
		shared: ["url", "directory"],
		summary: WORDS[name].summary,
		description: WORDS[name].description,
		examples: [`archboard model ${name}${name === "footprint" ? " --base main" : ""}`],
		parameters: [
			...Object.keys(input.shape).map((key) => ({
				kind: "option" as const,
				key,
				spellings: [`--${kebab(key)}`] as const,
				value: "required" as const,
				placeholder: key === "modelAt" ? "head|checkout" : key,
				description: optionWords(name, key),
			})),
			...(gated ? [failOutsideParameter] : []),
		],
		input: { ingress, ...(gated ? { stages: [failOutsideStage] } : {}) },
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
			...(gated ? [outsideOutcome] : []),
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
			const { failOutside } = context.parse(
				gated ? failOutsideStage.schema : FailOutsideSchema,
				request,
			);
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
			return { result: answer, ...judged(answer, failOutside === true) };
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
