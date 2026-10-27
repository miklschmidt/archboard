import {
	ArchitectureInitializationRequestSchema,
	ArchitectureModuleEditResultSchema,
} from "@archboard/board/model";
import { initializeArchitectureModelOnServer } from "#cli/clients/server/architecture-model.ts";
import { modelArchiveInitContract } from "#cli/operations/model/archive.ts";
import { defineCommand } from "#cli/protocol/contract/contract.ts";

const modelInitContract = defineCommand({
	...modelArchiveInitContract,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "Canonical initialization receipt or structured refusal",
			},
		],
		/**
		 * Select the declared JSON receipt.
		 * @returns The output identity.
		 */
		select: () => "json",
	},
	path: ["model", "init"],
	summary: "Initialize an empty canonical planning model",
	description:
		"Creates one canonical model through the existing signed installation and recovery workflow. Existing models and legacy boards are never replaced.",
	examples: [
		"archboard model init --name Shop --operation-id initialize-shop --writer agent --doing 'Initialize architecture'",
	],
	parameters: (
		[
			["name", "The model name"],
			["operationId", "The stable retry identity"],
			["writer", "The author identity"],
			["doing", "The present intent"],
		] as const
	).map(([key, description]) => ({
		kind: "option" as const,
		key,
		spellings: [key === "operationId" ? "--operation-id" : `--${key}`] as const,
		value: "required" as const,
		placeholder: "value",
		required: true,
		description,
	})),
	input: { ingress: ArchitectureInitializationRequestSchema },
	result: ArchitectureModuleEditResultSchema,
	effects: ["write", "server-state-write"],
	relationships: [
		{
			method: "POST",
			path: "/api/architecture/init",
			cardinality: "one",
			description: "Initialize through the canonical installer",
		},
	],
	/**
	 * Initialize the addressed empty vault.
	 * @param input The stable intent.
	 * @param context The invocation capabilities.
	 * @returns The durable result or refusal.
	 */
	async handler(input, context) {
		await context.require("server", "model init");
		const result = await initializeArchitectureModelOnServer(input);
		return {
			result,
			...(result.success
				? {}
				: {
						outcome: "unavailable",
						diagnostics: result.diagnostics.map(
							(item) => `${item.code}: ${item.message} ${item.recovery}`,
						),
					}),
		};
	},
});
export { modelInitContract };
