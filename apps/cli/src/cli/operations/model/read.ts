import { z } from "zod";
import { ArchitectureModelReadSchema } from "@archboard/board/model";
import { readArchitectureModelOnServer } from "#cli/clients/server/architecture-model.ts";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import { serverRefusal } from "#cli/protocol/contract/refusals.ts";

const modelReadContract = defineCommand({
	path: ["model", "read"],
	shared: ["url", "directory"],
	summary: "Read an authored canonical module model",
	description:
		"Returns ordered root modules, authored details, source-owned relationships and the exact input revision. A module selector accepts a qualified id or a unique name. Legacy vaults require explicit migration.",
	examples: ["archboard model read", "archboard model read 'Shop#Gateway' -C /tmp/shop"],
	parameters: [
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
			module: z.string().optional(),
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
	outcomes: [
		{
			id: "unavailable",
			exit: 2,
			stream: "stdout-and-stderr",
			presentation: ["diagnostics", "result"],
			description:
				"The requested model or module is unavailable. The result carries affected paths, identities and recovery actions.",
		},
	],
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
		return {
			result,
			...(result.success
				? {}
				: {
						outcome: "unavailable",
						diagnostics: result.diagnostics.map(
							(diagnostic) =>
								`${diagnostic.code} ${diagnostic.file}${diagnostic.path === undefined ? "" : `:${diagnostic.path}`}: ${diagnostic.message} ${diagnostic.recovery}`,
						),
					}),
		};
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
	parameters: [],
	input: { ingress: z.object({}) },
});
const modelCompareContract = defineCommand({
	...modelReadContract,
	path: ["model", "compare"],
	summary: "Compare coherent canonical architectural states",
});
export { modelContract, modelReadContract, modelProposalsContract, modelCompareContract };
