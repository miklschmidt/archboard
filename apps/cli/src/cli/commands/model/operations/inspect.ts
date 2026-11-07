import { z } from "zod";
import { ArchitectureModelReadSchema } from "@archboard/model/contract";
import { readArchitectureModelOnServer } from "#cli/server-access/clients/architecture-model.ts";
import {
	modelReadContract,
	refusedRead,
	unavailableOutcome,
} from "#cli/commands/model/operations/read.ts";
import { CliUsageError, defineCommand } from "#cli/contract/protocol/contract.ts";
import { serverRefusal } from "#cli/contract/protocol/refusals.ts";
import {
	GroupInspectionSchema,
	ModuleInspectionSchema,
	describedGroup,
	describedModule,
	groupInspection,
	moduleInspection,
} from "#cli/commands/model/rules/inspection.ts";

const unknownGroupRefusal = {
	code: "UNKNOWN_GROUP",
	exit: 2,
	stream: "stderr" as const,
	description: "The vault configures no group with this id. The refusal lists the configured ids.",
};

const modelInspectContract = defineCommand({
	path: ["model", "inspect"],
	shared: ["url", "directory"],
	summary: "Read one module's interface or one group's boundary",
	description: [
		"Reports what the model claims about one module or one group, read over the whole state before any reading narrows it. The answer holds counts and lists, and never a score.",
		"",
		"A module with parts answers with its interface and a count of each of these:",
		"- The entry points: the parts that relationships from outside reach, with those relationships.",
		"- The hidden parts: the parts that none reaches.",
		"- The callers: the modules outside where those relationships start.",
		"- The outgoing relationships.",
		"- The pass-through entry points: a question about each, never a fault.",
		"",
		"It also lists the relationships that end on the module itself: each makes a caller and no entry point. A module with no parts answers that it holds no parts.",
		"",
		"A group answers with its members, the relationships between them, the relationships that cross its boundary with their direction, and the modules at the far end. A configured group that no module joined answers empty.",
	].join("\n"),
	examples: [
		"archboard model inspect 'Order store'",
		"archboard model inspect 'Shop#Gateway' --state 'Queued fulfilment' -C /tmp/shop",
		"archboard model inspect --group fulfillment",
	],
	parameters: [
		{
			kind: "positional",
			key: "module",
			name: "module",
			description: "A qualified module id or a unique name. Name this or --group",
		},
		{
			kind: "option",
			key: "group",
			spellings: ["--group"],
			value: "required",
			placeholder: "id",
			requiredWhen: "unless a module is named instead",
			description: "The configured group id whose boundary to read",
		},
		...modelReadContract.parameters.filter(({ key }) => key === "state" || key === "checkpoint"),
	],
	input: {
		ingress: z.object({
			module: z.string().optional(),
			group: z.string().optional(),
			state: z.string().optional(),
			checkpoint: z.string().optional(),
		}),
	},
	result: z.union([
		ModuleInspectionSchema,
		GroupInspectionSchema,
		ArchitectureModelReadSchema.options[1],
	]),
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The module or the group as it stands in the selected reading",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * One answer: the inspection.
		 * @returns The output case's id.
		 */
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["read"],
	refusals: [serverRefusal, unknownGroupRefusal],
	outcomes: [unavailableOutcome],
	relationships: [
		{
			method: "GET",
			path: "/api/architecture/model",
			cardinality: "one",
			description: "The selected state whose module or group is read",
		},
	],
	/**
	 * Inspect the module or the group.
	 * @param input What the command was given.
	 * @param context The invocation prerequisites.
	 * @returns The answer, or the read's declared refusal.
	 * @throws {CliUsageError} When neither or both of a module and --group are given.
	 */
	async handler(input, context) {
		if ((input.module === undefined) === (input.group === undefined)) {
			throw new CliUsageError("Name one module to inspect, or give --group <id>, and not both.");
		}
		await context.require("server", "model inspect");
		const model = await readArchitectureModelOnServer(input.module, input.checkpoint, undefined, {
			state: input.state,
			compare: false,
		});
		if (!model.success) return { result: model, ...refusedRead(model) };
		if (input.group !== undefined) {
			const result = groupInspection(model, input.group);
			return { result, diagnostics: describedGroup(result) };
		}
		const result = moduleInspection(model);
		return { result, diagnostics: describedModule(result) };
	},
});

export { modelInspectContract };
