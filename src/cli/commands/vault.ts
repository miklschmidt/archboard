import { z } from "zod";
import { defineCommand } from "@/cli/command-contract/contract";
import { serverRefusal } from "@/cli/command-contract/common";
import { codeCheckLines } from "@/cli/commands/lib/code-check-lines";
import { requestJson } from "@/runtime/engine/server-client";
import { checkSemanticVaultOnServer } from "@/runtime/semantic-board-client/index";
import { CodeCheckAnswerSchema, type CodeCheckAnswer } from "@/shared/code-check/index";
import { diagnosticLine, VaultCheckSchema, type VaultCheck } from "@/shared/semantic-policy/index";
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
/**
 * Run the code check on the Archboard server.
 * @param signal Cancels the request, which cancels the check.
 * @returns Its answer.
 */
async function codeCheckOnServer(signal: AbortSignal): Promise<CodeCheckAnswer> {
	return CodeCheckAnswerSchema.parse(
		await requestJson<unknown>("/api/vault/code-check", { signal }),
	);
}

/**
 * Whether the check fails: the plain check has a diagnostic, or the code
 * check a warning. Information, behind included, never fails it.
 * @param plain The plain check's answer.
 * @param code The code check's answer, when it ran.
 * @returns True when the command exits 1.
 */
function failsCheck(plain: VaultCheck, code: CodeCheckAnswer | undefined): boolean {
	return (
		plain.diagnostics.length > 0 ||
		(code?.findings.some((finding) => finding.severity === "warning") ?? false)
	);
}

/** The plain check's answer, and with `--code` the code check's beside it. */
const CheckResultSchema = VaultCheckSchema.extend({ codeCheck: CodeCheckAnswerSchema.optional() });
const checkContract = defineCommand({
	path: ["check"],
	shared: ["url"],
	summary: "Check configuration and every board family in the vault",
	description:
		"Reports invalid configuration, unreadable boards and removed vocabulary references. With --code it then runs the code check: how far each board is behind the commits to its bound files, which is information. Exit 1 means the vault still has diagnostics or the code check a warning; no board is changed.",
	examples: ["archboard check", "archboard check --code"],
	parameters: [
		{
			kind: "option",
			key: "code",
			spellings: ["--code"],
			value: "none",
			description:
				"Then run the code check, which reads the code and Git history of every registered checkout",
		},
	],
	input: { ingress: z.object({ code: z.boolean().optional() }) },
	result: CheckResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: { key: "code", present: false },
				mode: "json",
				description: "The current interpreted vault policy and diagnostics",
			},
			{
				id: "code",
				when: { key: "code", present: true },
				mode: "json",
				description: "The vault check, and the code check's answer as codeCheck",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * The code case when `--code` was given.
		 * @param input The parsed input.
		 * @param input.code Whether `--code` was given.
		 * @returns The output case's id.
		 */
		select: (input: { code?: boolean | undefined }) => (input.code === true ? "code" : "json"),
	},
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
		{
			method: "GET",
			path: "/api/vault/code-check",
			cardinality: "conditional",
			description: "The code check, after the plain check, with --code",
		},
	],
	outcomes: [
		{
			id: "issues",
			exit: 1,
			description: "The vault has warnings or errors, or the code check a warning",
			stream: "stdout-and-stderr",
			presentation: ["diagnostics", "result"],
		},
	],
	/**
	 * Check the whole vault, and with `--code` the code it describes.
	 * @param input Whether to run the code check.
	 * @param context Runtime prerequisites.
	 * @returns Check results and a failure exit when issues remain.
	 */
	async handler(input, context) {
		await context.require("server", "check");
		const result = await checkSemanticVaultOnServer();
		const codeCheck = input.code === true ? await codeCheckOnServer(context.signal) : undefined;
		return {
			result: codeCheck === undefined ? result : { ...result, codeCheck },
			...(failsCheck(result, codeCheck) ? { outcome: "issues" } : {}),
			diagnostics: [
				...result.diagnostics.map(diagnosticLine),
				...(codeCheck === undefined ? [] : codeCheckLines(codeCheck)),
			],
		};
	},
});
const semanticConfigContract = defineCommand({
	path: ["semantic", "config"],
	shared: ["url"],
	summary: "Discover the configured vocabulary or its editor schema",
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
			excludesShared: ["url"],
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
		return { result: await checkSemanticVaultOnServer() };
	},
});
export { checkContract, semanticConfigContract };
