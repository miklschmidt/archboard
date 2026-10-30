import { z } from "zod";
import { ArchitectureArchiveInitializationSchema } from "@archboard/board/model";
import { initializeArchitectureArchiveOnServer } from "#cli/clients/server/architecture-model.ts";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import { serverRefusal } from "#cli/protocol/contract/refusals.ts";

const modelArchiveInitContract = defineCommand({
	path: ["model", "archive-init"],
	shared: ["url", "directory"],
	summary: "Explicitly initialize private history for an untracked vault",
	description:
		"Creates a private bare archive outside source repositories. Returns its local directory for Git identity, signing and remote configuration. Sends no history. Existing source repositories are refused without changes.",
	examples: ["archboard model archive-init -C /tmp/architecture-notes"],
	parameters: [],
	input: { ingress: z.object({}).strict() },
	result: ArchitectureArchiveInitializationSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "Private archive setup or structured recovery diagnostics",
			},
		],
		/**
		 * Select the JSON outcome.
		 * @returns The machine-readable outcome case.
		 */
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["server-state-write"],
	refusals: [serverRefusal],
	outcomes: [
		{
			id: "unavailable",
			exit: 2,
			stream: "stdout-and-stderr",
			presentation: ["diagnostics", "result"],
			description: "Private history setup cannot complete",
		},
	],
	relationships: [
		{
			method: "POST",
			path: "/api/architecture/archive/init",
			cardinality: "one",
			description: "Initialize the addressed untracked vault's private archive",
		},
	],
	/**
	 * Initialize local history through the shared runtime.
	 * @param _input The empty command input.
	 * @param context The invocation prerequisites.
	 * @returns The shared setup outcome.
	 */
	async handler(_input, context) {
		await context.require("server", "model archive-init");
		const result = await initializeArchitectureArchiveOnServer();
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
export { modelArchiveInitContract };
