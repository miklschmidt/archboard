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
 {kind:"option",key:"flow",spellings:["--flow"],value:"required",placeholder:"id",description:"Select one flow by qualified identity or unique current or former name"},
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
		ingress: z.object({ module: z.string().optional(), checkpoint: z.string().optional(),flow:z.string().optional() }),
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
		const result = await readArchitectureModelOnServer(input.module, input.checkpoint,input.flow);
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

export { modelContract, modelReadContract };
