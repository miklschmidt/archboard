import { z } from "zod";
import {
	LegacyInventoryReadSchema,
	LegacyMappingWriteSchema,
	type LegacyInventoryRead,
} from "@archboard/board/migration";
import {
	readLegacyInventoryOnServer,
	saveLegacyMappingPlanOnServer,
} from "#cli/clients/server/legacy-migration.ts";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import { serverRefusal, doingRefusal } from "#cli/protocol/contract/refusals.ts";
import { statedJson } from "#cli/operations/semantic/input/semantic-input.ts";

/**
 * Keep inventory decisions readable without treating an unresolved choice as a failed read.
 * @param result The shared runtime result.
 * @returns The machine-readable answer and declared refusal outcome, when any.
 */
function presented(result: LegacyInventoryRead) {
	return {
		result,
		...(result.success
			? {}
			: {
					outcome: "unavailable",
					diagnostics: result.diagnostics.map(
						(diagnostic) =>
							`${diagnostic.code} ${diagnostic.file}: ${diagnostic.message} ${diagnostic.recovery}`,
					),
				}),
	};
}

const modelInventoryContract = defineCommand({
	path: ["model", "inventory"],
	shared: ["url", "directory"],
	summary: "Inventory original legacy boards and identity evidence",
	description:
		"Returns exact source fingerprints, complete original coverage, aliases, identity evidence, conflicts and a separate mapping plan. The origin is a stable short namespace chosen by the owner. This read changes no files.",
	examples: ["archboard model inventory --origin Shop -C /tmp/shop"],
	parameters: [
		{
			kind: "option",
			key: "origin",
			spellings: ["--origin"],
			value: "required",
			placeholder: "id",
			required: true,
			description: "The owner's stable one-to-eight-character import namespace",
		},
	],
	input: { ingress: z.object({ origin: z.string() }) },
	result: LegacyInventoryReadSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "Original inputs and explicit mapping choices",
			},
		],
		/**
		 * Select the shared JSON contract.
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
				"The inventory or mapping record is unavailable. The answer includes recovery actions.",
		},
	],
	relationships: [
		{
			method: "GET",
			path: "/api/architecture/migration/inventory",
			cardinality: "one",
			description: "Read legacy migration evidence",
		},
	],
	/**
	 * Ask the shared runtime for the complete source inventory.
	 * @param input The owner-selected origin.
	 * @param context The invocation prerequisites.
	 * @returns The inventory or structured refusal.
	 */
	async handler(input, context) {
		await context.require("server", "model inventory");
		return presented(await readLegacyInventoryOnServer(input.origin));
	},
});

const modelPlanContract = defineCommand({
	...modelInventoryContract,
	path: ["model", "plan"],
	shared: ["url", "directory", "doing"],
	summary: "Save explicit legacy identity mappings and conflict choices",
	description:
		"Reads {plan, expectedPlan} from JSON and saves only .archboard/migration-plan.json. Source and plan fingerprints refuse stale choices. Legacy boards remain the active architecture. No canonical composition or cutover occurs.",
	examples: [
		'archboard model plan --input choices.json --doing "Record the owner identity choices" -C /tmp/shop',
	],
	parameters: [
		{
			kind: "option",
			key: "input",
			spellings: ["--input"],
			value: "required",
			placeholder: "file.json",
			description: "A JSON planning request; standard input when absent",
		},
	],
	input: { ingress: z.object({ input: z.string().optional() }) },
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The inventory with saved planning choices",
			},
		],
		/**
		 * Select the shared JSON contract.
		 * @returns The JSON output case.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "doing"],
	effects: ["local-read", "server-state-write"],
	refusals: [serverRefusal, doingRefusal],
	relationships: [
		{
			method: "PUT",
			path: "/api/architecture/migration/plan",
			cardinality: "one",
			description: "Save the separate mapping plan",
		},
	],
	/**
	 * Validate the planning request before sending it to the server.
	 * @param input The optional JSON input file.
	 * @param context The invocation prerequisites and input reader.
	 * @returns The inventory with its saved plan or structured refusal.
	 */
	async handler(input, context) {
		await context.require("server", "model plan");
		const request = context.parse(
			LegacyMappingWriteSchema.omit({ doing: true }),
			await statedJson(input, context),
		);
		return presented(await saveLegacyMappingPlanOnServer(request));
	},
});
export { modelInventoryContract, modelPlanContract };
