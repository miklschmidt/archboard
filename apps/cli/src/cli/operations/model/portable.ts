import { z } from "zod";
import {
	ArchitectureExportResultSchema,
	ArchitectureImportRequestSchema,
	ArchitectureModuleEditResultSchema,
} from "@archboard/board/model";
import {
	exportArchitectureModelOnServer,
	importArchitectureModelOnServer,
} from "#cli/clients/server/architecture-model.ts";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import { serverRefusal } from "#cli/protocol/contract/refusals.ts";
import { PendingArtifactSchema } from "#cli/protocol/contract/schemas.ts";
import { statedJson } from "#cli/operations/semantic/input/semantic-input.ts";
const unavailable = {
	id: "unavailable",
	exit: 2,
	stream: "stdout-and-stderr",
	presentation: ["diagnostics", "result"],
	description: "The runtime refused the portable operation and supplies recovery instructions",
} as const;
const modelExportContract = defineCommand({
	path: ["model", "export"],
	shared: ["url", "directory"],
	summary: "Export complete canonical inputs and retained history",
	description:
		"Writes a portable JSON bundle with exact architecture inputs and complete Git archive ancestry. Repository source files and private runtime state remain separate.",
	examples: ["archboard model export --out architecture.json"],
	parameters: [
		{
			kind: "option",
			key: "out",
			spellings: ["--out"],
			value: "required",
			placeholder: "file.json",
			description: "Write the portable model bundle to this file",
		},
	],
	input: { ingress: z.strictObject({ out: z.string() }) },
	result: z.union([
		z.strictObject({
			success: z.literal(true),
			file: z.string(),
			model: z.string(),
			revision: z.string(),
		}),
		ArchitectureExportResultSchema.options[1],
	]),
	output: {
		cases: [
			{
				id: "file",
				when: {},
				mode: "file-receipt",
				artifact: PendingArtifactSchema,
				description: "The portable bundle file receipt or structured refusal",
			},
		],
		/**
		 * Select the file receipt.
		 * @returns The output case.
		 */
		select: () => "file",
	},
	prerequisites: ["server"],
	effects: ["read", "local-write"],
	refusals: [serverRefusal],
	outcomes: [unavailable],
	relationships: [
		{
			method: "POST",
			path: "/api/architecture/export",
			cardinality: "one",
			description: "Capture exact current inputs and complete retained architecture",
		},
	],
	/**
	 * Defer output installation until runtime export succeeds.
	 * @param input The output path.
	 * @param context The invocation capabilities.
	 * @returns The file receipt or refusal.
	 */
	async handler(input, context) {
		await context.require("server", "model export");
		const result = await exportArchitectureModelOnServer();
		if (!result.success)
			return {
				result,
				outcome: "unavailable",
				diagnostics: result.diagnostics.map((d) => `${d.code}: ${d.message} ${d.recovery}`),
			};
		const file = context.resolvePath(input.out);
		return {
			result: {
				success: true as const,
				file,
				model: result.bundle.model,
				revision: result.bundle.revision.digest,
			},
			pendingArtifact: {
				path: file,
				content: JSON.stringify(result.bundle, null, 2) + "\n",
				encoding: "utf8" as const,
			},
		};
	},
});
const modelImportContract = defineCommand({
	path: ["model", "import"],
	shared: ["url", "directory"],
	summary: "Import verified canonical inputs and complete history",
	description:
		"Reads a complete request with bundle, expectedRevision, operationId, writer and doing. Installs into empty or identical authored inputs through the existing durable journal. Initialize private history first for an untracked vault.",
	examples: ["archboard model import --input import-request.json -C /tmp/restored-model"],
	parameters: [
		{
			kind: "option",
			key: "input",
			spellings: ["--input"],
			value: "required",
			placeholder: "file.json",
			description: "Read the complete import request from this file, or standard input when absent",
		},
	],
	input: { ingress: z.strictObject({ input: z.string().optional() }) },
	result: ArchitectureModuleEditResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The durable import receipt or structured refusal",
			},
		],
		/**
		 * Select the structured receipt.
		 * @returns The output case.
		 */
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["local-read", "server-state-write"],
	refusals: [serverRefusal],
	outcomes: [unavailable],
	relationships: [
		{
			method: "POST",
			path: "/api/architecture/import",
			cardinality: "one",
			description: "Install a complete portable architecture through the shared runtime",
		},
	],
	/**
	 * Submit the complete import intent without interpreting its architecture.
	 * @param input The request file path.
	 * @param context The invocation capabilities.
	 * @returns The shared installation receipt or refusal.
	 */
	async handler(input, context) {
		await context.require("server", "model import");
		const result = await importArchitectureModelOnServer(
			context.parse(ArchitectureImportRequestSchema, await statedJson(input, context)),
		);
		return {
			result,
			...(result.success
				? {}
				: {
						outcome: "unavailable",
						diagnostics: result.diagnostics.map((d) => `${d.code}: ${d.message} ${d.recovery}`),
					}),
		};
	},
});
export { modelExportContract, modelImportContract };
