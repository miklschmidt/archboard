import { z } from "zod";
import { ArchitectureModelReadSchema, type ArchitectureModelRead } from "@archboard/model/contract";
import { readArchitectureModelOnServer } from "#cli/server-access/clients/architecture-model.ts";
import { defineCommand } from "#cli/contract/protocol/contract.ts";
import { serverRefusal } from "#cli/contract/protocol/refusals.ts";
import { describedComparison } from "#cli/commands/model/rules/compared-interfaces.ts";

const unavailableOutcome = {
	id: "unavailable",
	exit: 2,
	stream: "stdout-and-stderr",
	presentation: ["diagnostics", "result"],
	description:
		"The requested model or module is unavailable. The result carries affected paths, identities and recovery actions.",
} as const;

/**
 * How a command presents a read that refused.
 * @param result The structured refusal.
 * @returns Its declared outcome and diagnostics.
 */
function refusedRead(result: Extract<ArchitectureModelRead, { success: false }>) {
	return {
		outcome: unavailableOutcome.id,
		diagnostics: result.diagnostics.map(
			(diagnostic) =>
				`${diagnostic.code} ${diagnostic.file}${diagnostic.path === undefined ? "" : `:${diagnostic.path}`}: ${diagnostic.message} ${diagnostic.recovery}`,
		),
	};
}

const modelReadContract = defineCommand({
	path: ["model", "read"],
	shared: ["url", "directory"],
	summary: "Read an authored canonical module model",
	description: [
		"Returns ordered root modules, authored details, source-owned relationships, and the exact input revision. A module selector accepts a qualified id or unique name.",
		"",
		"Use these for legacy data:",
		"- `--preview <origin>`: the saved legacy mapping plan.",
		"- `--state <qualified-original-id>`: one original model state.",
		"- `--checkpoint <id>`: retained originals.",
		"",
		"Legacy authority stays unchanged.",
		"",
		"Use `--walkthrough <id|name>` for pinned narrative playback. `--shared` requires an exact retained playback target.",
	].join("\n"),
	examples: ["archboard model read", "archboard model read 'Shop#Gateway' -C /tmp/shop"],
	parameters: [
		{
			kind: "option",
			key: "legacyAddress",
			spellings: ["--legacy-address"],
			value: "required",
			placeholder: "address",
			description:
				"Follow an exact original address from an installed migration map or explicit preview",
		},
		{
			kind: "option",
			key: "bookmark",
			spellings: ["--bookmark"],
			value: "required",
			placeholder: "id|name",
			description:
				"Select one content-free imported bookmark from an installed migration map or preview",
		},
		{
			kind: "option",
			key: "walkthrough",
			spellings: ["--walkthrough"],
			value: "required",
			placeholder: "id|name",
			description: "Resolve one narrative against one complete revision",
		},
		{
			kind: "option",
			key: "shared",
			spellings: ["--shared"],
			value: "none",
			description: "Require an exact retained playback target",
		},
		{
			kind: "option",
			key: "preview",
			spellings: ["--preview"],
			value: "required",
			placeholder: "origin",
			description: "Preview the saved legacy mapping plan for this import namespace",
		},
		{
			kind: "option",
			key: "references",
			spellings: ["--references"],
			value: "none",
			description: "Resolve explicit foreign model references without changing either model",
		},
		{
			kind: "option",
			key: "reference",
			spellings: ["--reference"],
			value: "required",
			placeholder: "index",
			description: "Follow this zero-based reference index on the selected module",
		},
		{
			kind: "option",
			key: "code",
			spellings: ["--code"],
			value: "none",
			description: "Resolve code for the selected module through existing checkout selection",
		},
		{
			kind: "option",
			key: "model",
			spellings: ["--model"],
			value: "required",
			placeholder: "id",
			description: "Require this exact model identity in the addressed vault",
		},
		{
			kind: "option",
			key: "state",
			spellings: ["--state"],
			value: "required",
			placeholder: "id|name",
			description: "Select current or a draft by stable identity or unique current or former name",
		},
		{
			kind: "option",
			key: "against",
			spellings: ["--against"],
			value: "required",
			placeholder: "id|name",
			description: "Compare against one explicit state or complete checkpoint identity",
		},
		{
			kind: "option",
			key: "compare",
			spellings: ["--compare"],
			value: "none",
			description: "Include the default whole-state semantic comparison",
		},
		{
			kind: "option",
			key: "flow",
			spellings: ["--flow"],
			value: "required",
			placeholder: "id",
			description: "Select one flow by qualified identity or unique current or former name",
		},
		{
			kind: "option",
			key: "checkpoint",
			spellings: ["--checkpoint"],
			value: "required",
			placeholder: "id",
			description: "Read one complete immutable checkpoint identity",
		},
		{
			kind: "positional",
			key: "module",
			name: "module",
			description: "A qualified module id or a unique name",
		},
	],
	input: {
		ingress: z.object({
			preview: z.string().optional(),
			legacyAddress: z.string().optional(),
			bookmark: z.string().optional(),
			module: z.string().optional(),
			walkthrough: z.string().optional(),
			shared: z.boolean().optional(),
			state: z.string().optional(),
			against: z.string().optional(),
			compare: z.boolean().optional(),
			checkpoint: z.string().optional(),
			flow: z.string().optional(),
			references: z.boolean().optional(),
			reference: z.coerce.number().int().nonnegative().optional(),
			code: z.boolean().optional(),
			model: z.string().optional(),
		}),
	},
	result: ArchitectureModelReadSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The coherent model or structured diagnostics",
			},
		],
		/**
		 * Select the machine-readable result.
		 * @returns The JSON output case.
		 */
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["read"],
	refusals: [serverRefusal],
	outcomes: [unavailableOutcome],
	relationships: [
		{
			method: "GET",
			path: "/api/architecture/model",
			cardinality: "one",
			description: "One explicitly addressed canonical model",
		},
	],
	/**
	 * Return the runtime result through the server client.
	 * @param input The optional module selector.
	 * @param context The invocation prerequisites.
	 * @returns The shared result and a declared failure outcome when unavailable.
	 */
	async handler(input, context) {
		await context.require("server", "model read");
		const result = await readArchitectureModelOnServer(
			input.module,
			input.checkpoint,
			input.flow,
			input,
		);
		return { result, ...(result.success ? {} : refusedRead(result)) };
	},
});

const modelContract = defineCommand({
	...modelReadContract,
	path: ["model"],
	parameters: [],
	input: { ingress: z.object({}) },
});

const modelProposalsContract = defineCommand({
	...modelReadContract,
	path: ["model", "proposals"],
	summary: "List compact proposals and current state metadata",
	description: [
		"Lists the active proposals and every retained state of the model: current, draft, historical and shelved. Each one comes with its identity, name, summary, predecessor, baseline and lifecycle.",
		"",
		"The `--state` selector of the other `model` commands takes one of these identities or names.",
	].join("\n"),
	examples: ["archboard model proposals", "archboard model proposals -C ../platform"],
	parameters: [],
	input: { ingress: z.object({}) },
});
const modelCompareContract = defineCommand({
	...modelReadContract,
	path: ["model", "compare"],
	summary: "Compare coherent canonical architectural states",
	description: [
		"Reads the selected state with its comparison. The selectors are those of `model read`.",
		"",
		"Interface changes come first, on standard error and in the comparison. An interface change costs every caller, and a change inside a module costs one module.",
		"",
		"The interface measures of each state follow side by side, as counts that are never combined and rank no state.",
		"",
		"The comparison also lists every stable subject. Use `--beside` for a competing proposal that is not the base.",
	].join("\n"),
	examples: [
		"archboard model compare --state 'Queued fulfilment'",
		"archboard model compare --state 'One index' --beside 'Entry per job'",
	],
	parameters: [
		...modelReadContract.parameters,
		{
			kind: "option",
			key: "beside",
			spellings: ["--beside"],
			value: "required",
			occurrences: "append",
			placeholder: "id|name",
			description: "Another state whose interface measures go beside these two",
		},
	],
	input: {
		ingress: modelReadContract.input.ingress.extend({ beside: z.array(z.string()).optional() }),
	},
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The selected state with its comparison, or structured diagnostics",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * Select the machine-readable result.
		 * @returns The JSON output case.
		 */
		select: () => "json",
	},
	/**
	 * Read the comparison and say its interface sections ahead of the answer.
	 * @param input The selectors of the two states and any put beside them.
	 * @param context The invocation prerequisites.
	 * @returns The shared result with its words.
	 */
	async handler(input, context) {
		// The parser answers false for an absent flag, and a false `compare` asks for no comparison.
		const execution = await modelReadContract.handler({ ...input, compare: true }, context);
		return {
			...execution,
			diagnostics: [...describedComparison(execution.result), ...(execution.diagnostics ?? [])],
		};
	},
});
export {
	modelContract,
	modelReadContract,
	modelProposalsContract,
	modelCompareContract,
	refusedRead,
	unavailableOutcome,
};
