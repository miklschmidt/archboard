import { z } from "zod";
import { defineCommand } from "@/cli/command-contract/contract";
import { serverRefusal } from "@/cli/command-contract/common";
import { checkSemanticVaultOnCanvas } from "@/runtime/semantic-board-client/index";
import { VaultCheckSchema } from "@/shared/semantic-policy/index";
import { SemanticBoardConfigurationSchema } from "@/runtime/semantic-board-store/index";

const output = {
	cases: [
		{
			id: "json",
			when: {},
			mode: "json" as const,
			description: "The current interpreted vault policy and diagnostics",
		},
	],
	/**
	 * Select JSON output.
	 * @returns The output case.
	 */
	select: () => "json",
} as const;
const checkContract = defineCommand({
	path: ["check"],
	summary: "Check configuration and every board family in the vault",
	usage: "check",
	description:
		"Reports invalid configuration, unreadable boards and removed vocabulary references. Exit 1 means the vault still has diagnostics; no board is changed.",
	examples: ["archboard check"],
	parameters: [],
	input: { ingress: z.object({}) },
	result: VaultCheckSchema,
	output,
	prerequisites: ["server"],
	effects: ["read"],
	refusals: [serverRefusal],
	relationships: [
		{
			method: "GET",
			path: "/api/vault/check",
			cardinality: "one",
			description: "The shared whole-vault checker",
		},
	],
	outcomes: [
		{
			id: "issues",
			exit: 1,
			description: "The vault has warnings or errors",
			stream: "stdout-and-stderr",
			presentation: ["diagnostics", "result"],
		},
	],
	/**
	 * Check the whole vault.
	 * @param _input No arguments.
	 * @param context Runtime prerequisites.
	 * @returns Check results and a failure exit when issues remain.
	 */
	async handler(_input, context) {
		await context.require("server", "check");
		const result = await checkSemanticVaultOnCanvas();
		return {
			result,
			...(result.diagnostics.length === 0 ? {} : { outcome: "issues" }),
			diagnostics: result.diagnostics.map(
				(issue) =>
					`${issue.severity}: ${issue.file}${issue.path === undefined ? "" : `:${issue.path}`}: ${issue.message}`,
			),
		};
	},
});
const semanticConfigContract = defineCommand({
	path: ["semantic", "config"],
	summary: "Discover the configured vocabulary or its editor schema",
	usage: "semantic config [--schema]",
	description:
		"Prints the vault policy, source path and current diagnostics. --schema emits a JSON Schema generated from the canonical YAML validation schema, without requiring a running server.",
	examples: [
		"archboard semantic config",
		"archboard semantic config --schema > config.schema.json",
	],
	parameters: [
		{
			kind: "option",
			key: "schema",
			spellings: ["--schema"],
			value: "none",
			description: "Print the generated editor JSON Schema",
		},
	],
	input: { ingress: z.object({ schema: z.boolean().optional() }) },
	result: z.union([VaultCheckSchema, z.record(z.string(), z.unknown())]),
	output,
	prerequisites: [],
	effects: ["read"],
	refusals: [serverRefusal],
	relationships: [
		{
			method: "GET",
			path: "/api/vault/check",
			cardinality: "one",
			description: "Discover interpreted vocabulary and configuration health",
		},
	],
	/**
	 * Discover current configuration or the editor schema.
	 * @param input Requested discovery mode.
	 * @param context Runtime prerequisites.
	 * @returns Policy or generated schema.
	 */
	async handler(input, context) {
		if (input.schema) return { result: z.toJSONSchema(SemanticBoardConfigurationSchema) };
		await context.require("server", "semantic config");
		return { result: await checkSemanticVaultOnCanvas() };
	},
});
export { checkContract, semanticConfigContract };
