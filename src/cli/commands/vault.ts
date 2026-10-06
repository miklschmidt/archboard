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
 * @param variant The draft to read on every board that has one, if any.
 * @param signal Cancels the request, which cancels the check.
 * @returns Its answer.
 */
async function codeCheckOnServer(
	variant: string | undefined,
	signal: AbortSignal,
): Promise<CodeCheckAnswer> {
	const query = variant === undefined ? "" : `?${new URLSearchParams({ variant })}`;
	return CodeCheckAnswerSchema.parse(
		await requestJson<unknown>(`/api/vault/code-check${query}`, { signal }),
	);
}

const CheckInputSchema = z.object({ code: z.boolean().optional(), variant: z.string().optional() });

/** `--variant` names the draft the code check reads, so it means nothing without `--code`. */
const CheckRequestSchema = CheckInputSchema.refine(
	(input) => input.variant === undefined || input.code === true,
	"--variant names the draft the code check reads: use it with --code",
);

const noSuchDraftRefusal = {
	code: "NO_SUCH_DRAFT",
	exit: 2,
	stream: "stderr" as const,
	description: "--variant names no draft on any board. The refusal names the drafts that exist.",
};

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
		"Reports invalid configuration, unreadable boards and removed vocabulary references. With --code it then runs the code check over the current variant of every board: an anchor whose file is not in its checkout or does not hold its symbol, a bound symbol that the bound file or directory does not define, and an anchor whose symbol is defined outside the bound code of both ends or that the file uses only as evidence the relationship's kind does not accept (ANCHOR_MISMATCH), each a warning. From the code that joins the bound parts of a board it reports a part that other bound parts reach with no relationship between them (RELATIONSHIP_UNDRAWN), a warning unless its evidence is only matched by name, and, as information, a relationship with no anchor whose accepted evidence runs only the other way (RELATIONSHIP_BACKWARDS) or does not join its ends (RELATIONSHIP_UNSUPPORTED); the evidence list of each relationship kind in the vault configuration says what it accepts. For a container bound to a module (a directory, or the index.ts or __init__.py that stands for it) it holds the interface the board derives against what the module exposes: an entry point that owns nothing the module exposes while the code of a caller drawn to it reaches it from outside the module (ENTRY_POINT_UNEXPOSED) and a hidden part whose exposed code a file outside the module that no part binds uses at run time (CALLER_UNDRAWN) are warnings, and the exposed names that no file outside the module uses (EXPOSED_UNUSED) are information; a module whose root files it cannot read is skipped (exposure-unknown). It reads TypeScript, TSX and Python by their syntax and every other file as text, only files Git does not ignore, in checkouts this machine has registered, and lists what it skipped with the reason, such as a symbol found only in code that did not parse (symbol-unparsed). It also says how far each board is behind the commits to its bound files, which is information. --variant reads the named draft on every board that has one and the current variant elsewhere, and also warns about a bound path the draft names that is not in its checkout. Exit 1 means the vault still has diagnostics or the code check a warning; no board is changed.",
	examples: [
		"archboard check",
		"archboard check --code",
		"archboard check --code --variant TASK-123",
	],
	parameters: [
		{
			kind: "option",
			key: "code",
			spellings: ["--code"],
			value: "none",
			requiredWhen: "with --variant",
			description:
				"Then run the code check, which reads the code and Git history of every registered checkout",
		},
		{
			kind: "option",
			key: "variant",
			spellings: ["--variant"],
			value: "required",
			placeholder: "draft",
			description:
				"With --code, read this draft on every board that has one, and the current variant elsewhere",
		},
	],
	input: {
		ingress: CheckInputSchema,
		stages: [
			{
				name: "code-check-variant",
				when: "before-server",
				description: "A named draft is read by the code check only",
				rules: ["Refuse --variant without --code"],
				schema: CheckRequestSchema,
			},
		],
	},
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
	refusals: [serverRefusal, noSuchDraftRefusal],
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
		const request = context.parse(CheckRequestSchema, input);
		await context.require("server", "check");
		const result = await checkSemanticVaultOnServer();
		const codeCheck =
			request.code === true ? await codeCheckOnServer(request.variant, context.signal) : undefined;
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
