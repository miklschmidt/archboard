import path from "node:path";
import { z } from "zod";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import { serverRefusal } from "#cli/protocol/contract/refusals.ts";
import { codeCheckLines } from "#cli/rules/check/code-check-lines.ts";
import { requestJson } from "@archboard/server-lifecycle/server-client";
import { checkSemanticVaultOnServer } from "@archboard/server-lifecycle/semantic-board-client";
import {
	CheckTimingSchema,
	CodeCheckAnswerSchema,
	type CodeCheckAnswer,
	type CheckTiming,
} from "@archboard/code-intel/code-check";
import { diagnosticLine, VaultCheckSchema } from "@archboard/board/policy";
import { SemanticBoardConfigurationSchema } from "@archboard/board/vault-policy";

type VaultCheck = z.infer<typeof VaultCheckSchema>;

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
 * @param reading The draft to read on every board that has one, if any, or every draft.
 * @param reading.variant The draft to read on every board that has one.
 * @param reading.everyDraft Whether to read every draft of every board.
 * @param plans The plan JSON files named, resolved against this directory,
 * because the server runs elsewhere.
 * @param signal Cancels the request, which cancels the check.
 * @returns Its answer.
 */
async function codeCheckOnServer(
	reading: { readonly variant?: string | undefined; readonly everyDraft?: boolean | undefined },
	plans: readonly string[],
	signal: AbortSignal,
): Promise<CodeCheckAnswer> {
	const asked = new URLSearchParams(
		reading.variant === undefined ? [] : [["variant", reading.variant]],
	);
	if (reading.everyDraft === true) asked.append("every-draft", "true");
	for (const plan of plans) asked.append("plan", path.resolve(plan));
	const query = asked.toString() === "" ? "" : `?${asked}`;
	return CodeCheckAnswerSchema.parse(
		await requestJson<unknown>(`/api/vault/code-check${query}`, { signal }),
	);
}

const CheckInputSchema = z.object({
	code: z.boolean().optional(),
	variant: z.string().optional(),
	everyDraft: z.boolean().optional(),
	plan: z.array(z.string()).optional(),
});

/**
 * `--variant`, `--every-draft` and `--plan` name what the code check reads, so
 * they mean nothing without `--code`; one draft and every draft are two readings.
 */
const CheckRequestSchema = CheckInputSchema.refine(
	(input) => input.variant === undefined || input.code === true,
	"--variant names the draft the code check reads: use it with --code",
)
	.refine(
		(input) => input.everyDraft !== true || input.code === true,
		"--every-draft makes the code check read every draft: use it with --code",
	)
	.refine(
		(input) => input.everyDraft !== true || input.variant === undefined,
		"--every-draft reads every draft, and --variant one name: use one of them",
	)
	.refine(
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
		"--plan names a file outside the checkout that holds the vault and the chosen checkout of every other repository, Terraform state, a variable file or a file under .terraform, or a file that is not a plan JSON. The refusal names the plan and why.",
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
	shared: ["url", "directory"],
	summary: "Check configuration and every board family in the vault",
	description:
		"Reports invalid configuration, unreadable boards and removed vocabulary references. With --code it then runs the code check over the current variant of every board: an anchor whose file is not in its checkout or does not hold its symbol, a bound symbol that the bound file or directory does not define, and an anchor whose symbol is defined outside the bound code of both ends or that the file uses only as evidence the relationship's kind does not accept (ANCHOR_MISMATCH), each a warning. From the code that joins the bound parts of a board it reports a part whose code other bound parts run, calling or constructing it, with no relationship between them (RELATIONSHIP_UNDRAWN), a warning unless its evidence is only matched by name, and, as information, a relationship with no anchor whose accepted evidence runs only the other way (RELATIONSHIP_BACKWARDS) or does not join its ends (RELATIONSHIP_UNSUPPORTED); the evidence list of each relationship kind in the vault configuration says what it accepts. Across a network hop it joins an environment value that bound code reads with the compose service, Kubernetes workload or Terraform resource that runs that code and sets the value to another part's address, as configured-path evidence: a compose service runs the directory it builds, and any of them runs the code drawn inside the part bound to it; the evidence is a candidate where the infrastructure leaves a choice, and an unsupported relationship whose kind accepts it names the side with no evidence, code or infrastructure, in missing. For a container bound to a module (a directory, or the index.ts or __init__.py that stands for it) it holds the interface the board derives against what the module exposes: an entry point that owns nothing the module exposes while the code of a caller drawn to it reaches it from outside the module (ENTRY_POINT_UNEXPOSED) and a hidden part whose exposed code a file outside the module that no part binds runs (CALLER_UNDRAWN) are warnings, and the exposed names that no file outside the module uses (EXPOSED_UNUSED) are information; a module whose root files it cannot read is skipped (exposure-unknown). A Terraform or OpenTofu module, a directory of .tf or .tofu files, exposes its variables and outputs, which a call of it uses; as information it names the variables the module passes unchanged to one argument of a resource (VARIABLE_PASSED_THROUGH), or says that the module wraps one resource and passes every variable through (MODULE_SHALLOW). It reads the languages and formats it knows by their syntax, such as TypeScript, Python, C#, Swift, docker-compose files and Terraform, and every other file as text, only files Git does not ignore, in the checkout that holds the vault for its own repository and in the chosen checkout of every other, and lists what it skipped with the reason, such as a symbol found only in code that did not parse (symbol-unparsed), and once for a checkout and language with no configured language server (language-server-missing; `repo language-server` configures one, and it runs that repository's code as an editor does), a project its server cannot answer about, such as a Swift directory with no Package.swift, a C# checkout with no solution or project file, or a C, C++ or Objective-C file with no compile_commands.json (language-server-unready), or a checkout where its server did not answer (language-server-failed). A part bound to a Terraform or OpenTofu root module, a directory of .tf or .tofu files, names an address there as its symbol, such as module.queue.aws_sqs_queue.this: the check reads the root module and the local modules it calls, never state, a variable file or .terraform, and never runs terraform or tofu; a reference that joins two such parts is configured-path evidence, and an address inside a remote module is skipped (module-not-read) unless --plan names a plan for that root. It also says how far each board is behind the commits to its bound files, which is information. --variant reads the named draft on every board that has one and the current variant elsewhere, and also warns about a bound path the draft names that is not in its checkout. --every-draft reads every draft of every board instead, each as a named draft. Every variant it reads is also held to its document references (ADR 0054): a referenced file that is not at the branch or commit the reference names, read as a binding of the same repository and ref is, gets DOCUMENT_PATH_MISSING, a warning at variants.<id>.documents.<index>. A draft read either way that lacks a bound node the variant it was branched from holds, while the code it describes still holds that node's path and symbol, gets INHERITED_PART_DROPPED, a warning whose dropped field names the earlier variant, the ref, the commit and where the code holds it. That code is the ref the draft's bindings name (branch or commit) that no earlier variant names, else the one ref they name, read from Git without checking it out, or the checkout's files when they name none; a checkout without that ref (draft-ref-missing) or several refs (draft-refs-ambiguous) skips the draft. A binding that names a branch or commit its checkout does not have out (any variant) is read at that ref from Git without checking it out, for its bound path and symbol, its anchors, the evidence between parts and module interfaces: a language server reads files on disk, so a use that no import resolves there stays as code facts read it (ref-without-language-server), a draft reads every part of a repository at its own ref, which holds the layers below it, except a part that pins a ref that one does not hold, and a relationship whose ends are then read at different code is skipped (refs-differ), and only a ref the checkout cannot resolve is skipped as ref-not-checked-out, which names the ref. Exit 1 means the vault still has diagnostics or the code check a warning; no board is changed.",
	examples: [
		"archboard check",
		"archboard check --code",
		"archboard check --code --variant TASK-123",
		"archboard check --code --every-draft",
		"archboard check --code --plan infra/plan.json",
	],
	parameters: [
		{
			kind: "option",
			key: "code",
			spellings: ["--code"],
			value: "none",
			requiredWhen: "with --variant, --every-draft or --plan",
			description:
				"Then run the code check, which reads the code and Git history of the checkout that holds the vault and of the chosen checkout of every other repository",
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
			key: "everyDraft",
			spellings: ["--every-draft"],
			value: "none",
			description:
				"With --code, read every draft of every board, each against the ref its bindings name, and no current variant",
		},
		{
			kind: "option",
			key: "plan",
			spellings: ["--plan"],
			value: "required",
			occurrences: "append",
			placeholder: "file",
			description:
				"With --code, read this plan JSON from terraform show -json or tofu show -json, inside the checkout that holds the vault or the chosen checkout of another repository, for the root module of its directory: only its addresses and references, for the modules the check does not read",
		},
	],
	input: {
		ingress: CheckInputSchema,
		stages: [
			{
				name: "code-check-variant",
				when: "before-server",
				description: "A named draft, every draft and a named plan are read by the code check only",
				rules: [
					"Refuse --variant without --code",
					"Refuse --every-draft without --code or with --variant",
					"Refuse --plan without --code",
				],
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
				? await codeCheckOnServer(request, request.plan ?? [], context.signal)
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
	shared: ["url", "directory"],
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
			excludesShared: ["url", "directory"],
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
