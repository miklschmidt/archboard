import { z } from "zod";
import {
	ArchitectureCheckpointRequestSchema,
	ArchitectureCheckpointRetainSchema,
	ArchitectureCheckpointListSchema,
} from "@archboard/board/model";
import {
	listArchitectureCheckpointsOnServer,
	retainArchitectureCheckpointOnServer,
} from "#cli/clients/server/architecture-model.ts";
import { statedInvocation } from "@archboard/server-lifecycle/server-client";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import { serverRefusal, doingRefusal } from "#cli/protocol/contract/refusals.ts";

const modelCheckpointsContract = defineCommand({
	path: ["model", "checkpoints"],
	shared: ["url", "directory"],
	summary: "List retained local architecture checkpoints",
	description:
		"Lists immutable checkpoint identities and source associations. Archive synchronization records never become architectural states. Current files are not read.",
	examples: ["archboard model checkpoints -C /tmp/shop"],
	parameters: [],
	input: { ingress: z.object({}) },
	result: ArchitectureCheckpointListSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "Local checkpoints or structured recovery diagnostics",
			},
		],
		/**
		 * Select the JSON outcome.
		 * @returns The machine-readable outcome case.
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
			description: "The local archive cannot be read",
		},
	],
	relationships: [
		{
			method: "GET",
			path: "/api/architecture/checkpoints",
			cardinality: "one",
			description: "List the addressed vault's local checkpoints",
		},
	],
	/**
	 * List retained checkpoint metadata.
	 * @param _input The empty command input.
	 * @param context The invocation prerequisites.
	 * @returns The shared archive outcome.
	 */
	async handler(_input, context) {
		await context.require("server", "model checkpoints");
		const result = await listArchitectureCheckpointsOnServer();
		return {
			result,
			...(result.success
				? {}
				: {
						outcome: "unavailable",
						diagnostics: result.diagnostics.map(
							(diagnostic) => `${diagnostic.code}: ${diagnostic.message} ${diagnostic.recovery}`,
						),
					}),
		};
	},
});

const modelRetainContract = defineCommand({
	path: ["model", "retain"],
	shared: ["url", "directory", "doing"],
	summary: "Retain exact current architecture or original migration inputs locally",
	description:
		"Uses configured Git identity and signing without changing current files, index or HEAD. Repeat the same operation identity and request to recover the same checkpoint. Required dependencies are complete checkpoint identities. Migration retention names --migration and --expected-plan. Use none for an absent plan. The expected source revision comes from model inventory.",
	examples: [
		"archboard model retain --operation-id capture-1 --writer agent --expect-revision <digest> --doing 'retaining the reviewed reading' -C /tmp/shop",
	],
	parameters: [
		{
			kind: "option",
			key: "origin",
			spellings: ["--migration"],
			value: "required",
			placeholder: "origin",
			description: "Retain original legacy inputs under this import namespace",
		},
		{
			kind: "option",
			key: "expectedPlan",
			spellings: ["--expected-plan"],
			value: "required",
			placeholder: "digest-or-none",
			description: "The exact saved mapping revision, or none when no plan exists",
		},
		{
			kind: "option",
			key: "operationId",
			spellings: ["--operation-id"],
			value: "required",
			placeholder: "id",
			required: true,
			description: "The stable identity for this retention intent",
		},
		{
			kind: "option",
			key: "writer",
			spellings: ["--writer"],
			value: "required",
			placeholder: "name",
			required: true,
			description: "The agent retaining the reading",
		},
		{
			kind: "option",
			key: "expectedRevision",
			spellings: ["--expect-revision"],
			value: "required",
			placeholder: "digest",
			required: true,
			description: "The exact input digest returned by model read",
		},
		{
			kind: "option",
			key: "dependencies",
			spellings: ["--dependency"],
			value: "required",
			occurrences: "append",
			placeholder: "checkpoint",
			description: "Retain a required baseline through actual Git ancestry; repeat for several",
		},
	],
	input: {
		ingress: z.object({
			operationId: ArchitectureCheckpointRequestSchema.shape.operationId,
			writer: ArchitectureCheckpointRequestSchema.shape.writer,
			expectedRevision: ArchitectureCheckpointRequestSchema.shape.expectedRevision,
			dependencies: ArchitectureCheckpointRequestSchema.shape.dependencies,
			origin: ArchitectureCheckpointRequestSchema.shape.origin,
			expectedPlan: z
				.union([z.literal("none"), ArchitectureCheckpointRequestSchema.shape.expectedPlan])
				.transform((value) => (value === "none" ? null : value)),
		}),
	},
	result: ArchitectureCheckpointRetainSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The saved local checkpoint or structured refusal",
			},
		],
		/**
		 * Select the JSON outcome.
		 * @returns The machine-readable outcome case.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "doing"],
	effects: ["server-state-write"],
	refusals: [serverRefusal, doingRefusal],
	outcomes: [
		{
			id: "unavailable",
			exit: 2,
			stream: "stdout-and-stderr",
			presentation: ["diagnostics", "result"],
			description: "Retention failed without changing current architecture",
		},
	],
	relationships: [
		{
			method: "POST",
			path: "/api/architecture/checkpoints",
			cardinality: "one",
			description: "Retain one exact current input set",
		},
	],
	/**
	 * Retain the explicitly requested input revision.
	 * @param input The checkpoint intent and dependencies.
	 * @param context The invocation prerequisites.
	 * @returns The shared retention outcome.
	 */
	async handler(input, context) {
		await context.require("server", "model retain");
		const request = context.parse(ArchitectureCheckpointRequestSchema, {
			...input,
			target: input.origin === undefined ? "current" : "migration",
			doing: statedInvocation().doing,
		});
		const result = await retainArchitectureCheckpointOnServer(request);
		return {
			result,
			...(result.success
				? {}
				: {
						outcome: "unavailable",
						diagnostics: result.diagnostics.map(
							(diagnostic) => `${diagnostic.code}: ${diagnostic.message} ${diagnostic.recovery}`,
						),
					}),
		};
	},
});

export { modelCheckpointsContract, modelRetainContract };
