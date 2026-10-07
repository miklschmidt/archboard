import path from "node:path";
import { z } from "zod";
import { defineCommand } from "@/cli/command-contract/contract";
import { serverRefusal } from "@/cli/command-contract/common";
import { codeCheckLines } from "@/cli/commands/lib/code-check-lines";
import { requestJson } from "@/runtime/engine/server-client";
import { checkSemanticVaultOnServer } from "@/runtime/semantic-board-client/index";
import {
	CheckTimingSchema,
	CodeCheckAnswerSchema,
	type CodeCheckAnswer,
	type CheckTiming,
} from "@/shared/code-check/index";
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
 * @param plans The plan JSON files named, resolved against this directory,
 * because the server runs elsewhere.
 * @param signal Cancels the request, which cancels the check.
 * @returns Its answer.
 */
async function codeCheckOnServer(
	variant: string | undefined,
	plans: readonly string[],
	signal: AbortSignal,
): Promise<CodeCheckAnswer> {
	const asked = new URLSearchParams(variant === undefined ? [] : [["variant", variant]]);
	for (const plan of plans) asked.append("plan", path.resolve(plan));
	const query = asked.toString() === "" ? "" : `?${asked}`;
	return CodeCheckAnswerSchema.parse(
		await requestJson<unknown>(`/api/vault/code-check${query}`, { signal }),
	);
}

const CheckInputSchema = z.object({
	code: z.boolean().optional(),
	variant: z.string().optional(),
	plan: z.array(z.string()).optional(),
});

/** `--variant` and `--plan` name what the code check reads, so they mean nothing without `--code`. */
const CheckRequestSchema = CheckInputSchema.refine(
	(input) => input.variant === undefined || input.code === true,
	"--variant names the draft the code check reads: use it with --code",
).refine(
	(input) => input.plan === undefined || input.code === true,
	"--plan names a plan JSON the code check reads: use it with --code",
);

const noSuchDraftRefusal = {
	code: "NO_SUCH_DRAFT",
	exit: 2,
	stream: "stderr" as const,
	description: "--variant names no draft on any board. The refusal names the drafts that exist.",
};

const planRefusal = {
	code: "PLAN_REFUSED",
	exit: 2,
	stream: "stderr" as const,
	description:
		"--plan names a file outside every registered checkout, Terraform state, a variable file or a file under .terraform, or a file that is not a plan JSON. The refusal names the plan and why.",
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

/**
 * One elapsed time, before the findings and the JSON answer.
 * @param timing The check and its elapsed wall time.
 * @returns Its text line.
 */
function timingLine(timing: CheckTiming): string {
	const name =
		timing.check === "language-server"
			? `language server ${timing.language}${timing.repo === undefined ? "" : ` (${timing.repo}, ${timing.project})`}`
			: timing.check === "code-facts"
				? "code facts"
				: timing.check === "history"
					? "history lens"
					: "board check";
	return `time: ${name}: ${timing.elapsedMs.toFixed(1)} ms`;
}

/** The plain check's answer, and with `--code` the code check's beside it. */
const CheckResultSchema = VaultCheckSchema.extend({
	timings: z.array(CheckTimingSchema),
	codeCheck: CodeCheckAnswerSchema.optional(),
});
const checkContract = defineCommand({
	path: ["check"],
	shared: ["url"],
	summary: "Check configuration and every board family in the vault",
	description:
		"Reports invalid configuration, unreadable boards and removed vocabulary references. With --code it then runs the code check over the current variant of every board: an anchor whose file is not in its checkout or does not hold its symbol, a bound symbol that the bound file or directory does not define, and an anchor whose symbol is defined outside the bound code of both ends or that the file uses only as evidence the relationship's kind does not accept (ANCHOR_MISMATCH), each a warning. From the code that joins the bound parts of a board it reports a part whose code other bound parts run, calling or constructing it, with no relationship between them (RELATIONSHIP_UNDRAWN), a warning unless its evidence is only matched by name, and, as information, a relationship with no anchor whose accepted evidence runs only the other way (RELATIONSHIP_BACKWARDS) or does not join its ends (RELATIONSHIP_UNSUPPORTED); the evidence list of each relationship kind in the vault configuration says what it accepts. Across a network hop it joins an environment value that bound code reads with the compose service, Kubernetes workload or Terraform resource that runs that code and sets the value to another part's address, as configured-path evidence: a compose service runs the directory it builds, and any of them runs the code drawn inside the part bound to it; the evidence is a candidate where the infrastructure leaves a choice, and an unsupported relationship whose kind accepts it names the side with no evidence, code or infrastructure, in missing. For a container bound to a module (a directory, or the index.ts or __init__.py that stands for it) it holds the interface the board derives against what the module exposes: an entry point that owns nothing the module exposes while the code of a caller drawn to it reaches it from outside the module (ENTRY_POINT_UNEXPOSED) and a hidden part whose exposed code a file outside the module that no part binds runs (CALLER_UNDRAWN) are warnings, and the exposed names that no file outside the module uses (EXPOSED_UNUSED) are information; a module whose root files it cannot read is skipped (exposure-unknown). A Terraform or OpenTofu module, a directory of .tf or .tofu files, exposes its variables and outputs, which a call of it uses; as information it names the variables the module passes unchanged to one argument of a resource (VARIABLE_PASSED_THROUGH), or says that the module wraps one resource and passes every variable through (MODULE_SHALLOW). It reads the languages and formats it knows by their syntax, such as TypeScript, Python, C#, Swift, docker-compose files and Terraform, and every other file as text, only files Git does not ignore, in checkouts this machine has registered, and lists what it skipped with the reason, such as a symbol found only in code that did not parse (symbol-unparsed), and once for a checkout and language with no configured language server (language-server-missing; `repo language-server` configures one, and it runs that repository's code as an editor does), a project its server cannot answer about, such as a Swift directory with no Package.swift, a C# checkout with no solution or project file, or a C, C++ or Objective-C file with no compile_commands.json (language-server-unready), or a checkout where its server did not answer (language-server-failed). A part bound to a Terraform or OpenTofu root module, a directory of .tf or .tofu files, names an address there as its symbol, such as module.queue.aws_sqs_queue.this: the check reads the root module and the local modules it calls, never state, a variable file or .terraform, and never runs terraform or tofu; a reference that joins two such parts is configured-path evidence, and an address inside a remote module is skipped (module-not-read) unless --plan names a plan for that root. It also says how far each board is behind the commits to its bound files, which is information. --variant reads the named draft on every board that has one and the current variant elsewhere, and also warns about a bound path the draft names that is not in its checkout. Exit 1 means the vault still has diagnostics or the code check a warning; no board is changed.",
	examples: [
		"archboard check",
		"archboard check --code",
		"archboard check --code --variant TASK-123",
		"archboard check --code --plan infra/plan.json",
	],
	parameters: [
		{
			kind: "option",
			key: "code",
			spellings: ["--code"],
			value: "none",
			requiredWhen: "with --variant or --plan",
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
		{
			kind: "option",
			key: "plan",
			spellings: ["--plan"],
			value: "required",
			occurrences: "append",
			placeholder: "file",
			description:
				"With --code, read this plan JSON from terraform show -json or tofu show -json, inside a registered checkout, for the root module of its directory: only its addresses and references, for the modules the check does not read",
		},
	],
	input: {
		ingress: CheckInputSchema,
		stages: [
			{
				name: "code-check-variant",
				when: "before-server",
				description: "A named draft and a named plan are read by the code check only",
				rules: ["Refuse --variant without --code", "Refuse --plan without --code"],
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
				presentation: ["diagnostics", "result"],
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
	refusals: [serverRefusal, noSuchDraftRefusal, planRefusal],
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
		const boardStarted = performance.now();
		const result = await checkSemanticVaultOnServer(context.signal);
		const boardTiming: CheckTiming = {
			check: "board",
			elapsedMs: performance.now() - boardStarted,
		};
		const codeCheck =
			request.code === true
				? await codeCheckOnServer(request.variant, request.plan ?? [], context.signal)
				: undefined;
		const timings = [boardTiming, ...(codeCheck?.timings ?? [])];
		return {
			result: { ...result, timings, codeCheck },
			...(failsCheck(result, codeCheck) ? { outcome: "issues" } : {}),
			diagnostics: [
				...timings.map(timingLine),
				...result.diagnostics.map(diagnosticLine),
				...codeCheckLines(codeCheck),
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
