import path from "node:path";
import { z } from "zod";
import {
	CliUsageError,
	defineCommand,
	type CommandContext,
	type CommandExecution,
} from "#cli/protocol/contract/contract.ts";
import { serverRefusal } from "#cli/protocol/contract/refusals.ts";
import { codeCheckLines } from "#cli/rules/check/code-check-lines.ts";
import { embedsCheckLines } from "#cli/rules/check/embed-state.ts";
import { EmbedsPartSchema } from "#cli/protocol/check/embeds-answer.ts";
import {
	CHECK_ALL_HELP,
	CHECK_CODE_HELP,
	CHECK_EMBEDS_HELP,
	FIX_HELP,
} from "#cli/operations/vault/check-help.ts";
import { checkEmbeds } from "#cli/operations/vault/embeds/embeds-check.ts";
import { requestJson } from "@archboard/server-lifecycle/server-client";
import { checkSemanticVaultOnServer } from "#cli/clients/server/semantic-boards.ts";
import { CodeCheckAnswerSchema, type CodeCheckAnswer } from "@archboard/code-intel/code-check";
import { diagnosticLine, VaultCheckSchema } from "@archboard/board/policy";
import { SemanticBoardConfigurationSchema } from "@archboard/board/vault-policy";
import { VAULT_DIRECTORY } from "@archboard/workspace/vault";

/** How long one check took. */
type CheckTiming = CodeCheckAnswer["timings"][number];

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
/** What the code check reads: `--state`, `--every-draft` and `--plan`. */
const CodeCheckInputSchema = z.object({
	state: z.string().optional(),
	everyDraft: z.boolean().optional(),
	plan: z.array(z.string()).optional(),
});
type CodeCheckInput = z.output<typeof CodeCheckInputSchema>;

/**
 * Run the code check on the Archboard server.
 * @param reading What to read.
 * @param reading.state The draft to read on every board that has one.
 * @param reading.everyDraft Whether to read every draft of every board.
 * @param reading.plan The plan JSON files named, resolved against this directory,
 * because the server runs elsewhere.
 * @param signal Cancels the request, which cancels the check.
 * @returns Its answer.
 */
async function codeCheckOnServer(
	reading: CodeCheckInput,
	signal: AbortSignal,
): Promise<CodeCheckAnswer> {
	const asked = new URLSearchParams(reading.state === undefined ? [] : [["state", reading.state]]);
	if (reading.everyDraft === true) asked.append("every-draft", "true");
	for (const plan of reading.plan ?? []) asked.append("plan", path.resolve(plan));
	const query = asked.toString() === "" ? "" : `?${asked}`;
	return CodeCheckAnswerSchema.parse(
		await requestJson<unknown>(`/api/vault/code-check${query}`, { signal }),
	);
}

/** What the embeds check reads: `--fix`. */
const FixInputSchema = z.object({ fix: z.boolean().optional() });
type FixInput = z.output<typeof FixInputSchema>;

/** One draft and every draft are two readings, so `--state` and `--every-draft` exclude each other. */
const CodeCheckRequestSchema = CodeCheckInputSchema.extend(FixInputSchema.shape).refine(
	(input) => input.everyDraft !== true || input.state === undefined,
	"--every-draft reads every draft, and --state one name: use one of them",
);

const noSuchDraftRefusal = {
	code: "NO_SUCH_DRAFT",
	exit: 2,
	stream: "stderr" as const,
	description: "--state names no draft on any board. The refusal names the drafts that exist.",
};

const planRefusal = {
	code: "PLAN_REFUSED",
	exit: 2,
	stream: "stderr" as const,
	description:
		"--plan names a file outside the checkout that holds the vault and the chosen checkout of every other repository, Terraform state, a variable file or a file under .terraform, or a file that is not a plan JSON. The refusal names the plan and why.",
};

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

/** The semantics check's part of the answer: the vault check and the time it took. */
const SemanticsPartSchema = VaultCheckSchema.extend({
	timings: CodeCheckAnswerSchema.shape.timings,
});
type SemanticsPart = z.output<typeof SemanticsPartSchema>;

/**
 * One part for each check. A command fills the parts of the checks it ran and
 * leaves the others out (ADR 0057).
 */
const CheckAnswerSchema = z.object({
	semantics: SemanticsPartSchema.optional(),
	code: CodeCheckAnswerSchema.optional(),
	embeds: EmbedsPartSchema.optional(),
	/**
	 * The checks that read a vault and did not run, and why: the command ran in
	 * a Git checkout that holds no vault, where only the embeds check runs.
	 */
	skipped: z
		.object({ checks: z.array(z.enum(["semantics", "code"])), message: z.string() })
		.optional(),
});
type CheckAnswer = z.output<typeof CheckAnswerSchema>;

/**
 * Run the semantics check on the Archboard server.
 * @param signal Cancels the request.
 * @returns The vault check and its elapsed time.
 */
async function semanticsCheckOnServer(signal: AbortSignal): Promise<SemanticsPart> {
	const started = performance.now();
	const result = await checkSemanticVaultOnServer(signal);
	return { ...result, timings: [{ check: "board", elapsedMs: performance.now() - started }] };
}

/**
 * Whether a part makes the command exit 1: the semantics check has a diagnostic,
 * or the code check or the embeds check a warning. Information, behind
 * included, never does.
 * @param answer The parts that ran.
 * @returns True when the command exits 1.
 */
function failsCheck(answer: CheckAnswer): boolean {
	return (
		(answer.semantics?.diagnostics.length ?? 0) > 0 || warns(answer.code) || warns(answer.embeds)
	);
}

/**
 * Whether a part that reports findings has a warning.
 * @param part The part, when its check ran.
 * @param part.findings Its findings.
 * @returns True when one finding is a warning.
 */
function warns(part: { readonly findings: readonly { severity: string }[] } | undefined): boolean {
	return part?.findings.some((finding) => finding.severity === "warning") ?? false;
}

/** Which checks a command runs. They run, and print, in the order semantics, code, embeds. */
type CheckName = "semantics" | "code" | "embeds";

/**
 * The checks that read a vault, which a command that runs in a Git checkout
 * without one leaves out, and why.
 * @param checks The checks the command runs.
 * @param checkout The checkout without a vault, or null when the command found a vault.
 * @returns What the answer says it left out, or undefined when it left out nothing.
 */
function skippedWithoutVault(
	checks: readonly CheckName[],
	checkout: string | null,
): CheckAnswer["skipped"] {
	const skipped = checks.filter((check): check is "semantics" | "code" => check !== "embeds");
	if (checkout === null || skipped.length === 0) return undefined;
	return {
		checks: skipped,
		message: `${checkout} holds no ${VAULT_DIRECTORY}, so the ${skipped.join(" and ")} checks did not run, because they read a vault. The embeds check read the embeds of this checkout.`,
	};
}

/**
 * The lines of a command's stderr: for each part that ran, its times, then its
 * diagnostics or findings.
 * @param answer The parts that ran.
 * @returns The lines, in the order of the parts.
 */
function checkLines(answer: CheckAnswer): string[] {
	const { semantics, code, embeds, skipped } = answer;
	return [
		...(skipped === undefined ? [] : [`skipped: ${skipped.checks.join(", ")}: ${skipped.message}`]),
		...(semantics === undefined
			? []
			: [...semantics.timings.map(timingLine), ...semantics.diagnostics.map(diagnosticLine)]),
		...(code === undefined ? [] : code.timings.map(timingLine)),
		...codeCheckLines(code),
		...embedsCheckLines(embeds),
	];
}

/**
 * Run the named checks and gather what the command answers: one part for each,
 * the exit status, and the lines for stderr.
 * @param checks The checks to run.
 * @param reading What the code check reads, when it runs, and whether the embeds check fixes.
 * @param context Runtime prerequisites.
 * @returns Check results and a failure exit when issues remain.
 */
async function runChecks(
	checks: readonly CheckName[],
	reading: CodeCheckInput & FixInput,
	context: CommandContext,
): Promise<CommandExecution<CheckAnswer>> {
	await context.require("server", "check");
	const skipped = skippedWithoutVault(checks, context.checkout);
	// In a checkout without a vault, only the embeds check runs.
	const ran = context.checkout === null ? checks : checks.filter((check) => check === "embeds");
	const semantics = ran.includes("semantics")
		? await semanticsCheckOnServer(context.signal)
		: undefined;
	const code = ran.includes("code") ? await codeCheckOnServer(reading, context.signal) : undefined;
	const embeds = ran.includes("embeds")
		? await checkEmbeds(context, reading.fix === true)
		: undefined;
	const answer = { semantics, code, embeds, skipped };
	return {
		result: answer,
		...(failsCheck(answer) ? { outcome: "issues" } : {}),
		diagnostics: checkLines(answer),
	};
}

const CheckNamespaceInputSchema = z.object({
	action: z.string().optional(),
	tail: z.array(z.string()).default([]),
});

/** The options of the code check, which `check`, `check all` and `check code` read. */
const codeCheckParameters = [
	{
		kind: "option",
		key: "state",
		spellings: ["--state"],
		value: "required",
		placeholder: "draft",
		description: "Read the canonical state identified by this ID or unique name",
	},
	{
		kind: "option",
		key: "everyDraft",
		spellings: ["--every-draft"],
		value: "none",
		description: "Inspect each independent active proposal instead of current architecture",
	},
	{
		kind: "option",
		key: "plan",
		spellings: ["--plan"],
		value: "required",
		occurrences: "append",
		placeholder: "file",
		description:
			"Read this plan JSON, from terraform show -json or tofu show -json, for the root module of its directory. The check reads only its addresses and references, for the modules it does not read itself. The file must be in the checkout that holds the vault or in the chosen checkout of another repository",
	},
] as const;

/** The option of the embeds check, which `check`, `check all` and `check embeds` read. */
const fixParameter = {
	kind: "option",
	key: "fix",
	spellings: ["--fix"],
	value: "none",
	description: FIX_HELP,
} as const;

const codeCheckStages = [
	{
		name: "code-check-state",
		when: "before-server" as const,
		description: "A named draft and every draft are two readings of the code check",
		rules: ["Refuse --every-draft with --state"],
		schema: CodeCheckRequestSchema,
	},
];

const checkOutput = {
	cases: [
		{
			id: "json",
			when: {},
			mode: "json" as const,
			description: "One part for each check that ran: semantics, code, embeds",
			presentation: ["diagnostics", "result"] as const,
		},
	],
	/**
	 * Select JSON output.
	 * @returns The output case.
	 */
	select: () => "json",
} as const;

const checkOutcomes = [
	{
		id: "issues",
		exit: 1,
		description:
			"The semantics check has a diagnostic or a warning, or the code check or the embeds check a warning. Information never changes the exit status",
		stream: "stdout-and-stderr",
		presentation: ["diagnostics", "result"],
	},
] as const;

const embedsRelationships = [
	{
		method: "GET",
		path: "/api/semantic-boards",
		cardinality: "conditional",
		description:
			"Each vault an embed's recipe names, listed once, to find its board by id, and this vault's boards with the embeds they track",
	},
	{
		method: "GET",
		path: "/api/semantic-boards/render",
		cardinality: "conditional",
		description: "Each embed drawn again from its recipe",
	},
] as const;

const semanticsRoute = {
	method: "GET",
	path: "/api/vault/check",
	cardinality: "one",
	description: "The shared whole-vault checker, the one the panes poll",
} as const;
const codeRoute = {
	method: "GET",
	path: "/api/vault/code-check",
	cardinality: "one",
	description: "The code check, which no pane starts",
} as const;

const checkContract = defineCommand({
	path: ["check"],
	shared: [],
	summary: "Run every check of the vault: semantics, code, then embeds",
	description: "Routes the check subcommands. Without one, `check` runs `check all`.",
	examples: [
		"archboard check",
		"archboard check semantics",
		"archboard check code",
		"archboard check embeds",
	],
	parameters: [
		{
			kind: "positional",
			key: "action",
			name: "subcommand",
			hidden: true,
			description: "Check subcommand",
		},
		{
			kind: "positional",
			key: "tail",
			name: "arguments",
			repeatable: true,
			route: "pass-through",
			hidden: true,
			description: "Subcommand arguments",
		},
	],
	input: { ingress: CheckNamespaceInputSchema },
	result: z.never(),
	output: {
		cases: [{ id: "json", when: {}, mode: "json", description: "Namespace refusal" }],
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: [],
	effects: [],
	refusals: [],
	relationships: [],
	/**
	 * Refuses a word that names no check, with the usage line.
	 * @returns Never; the usage error is the whole behaviour.
	 */
	async handler() {
		throw new CliUsageError("check needs a subcommand: all, semantics, code, or embeds");
	},
});

const checkAllContract = defineCommand({
	path: ["check", "all"],
	shared: ["url", "directory"],
	runsWithoutVault: true,
	summary: "Run every check of the vault: semantics, code, then embeds",
	description: CHECK_ALL_HELP,
	examples: [
		"archboard check",
		"archboard check all --state TASK-123",
		"archboard check --every-draft",
		"archboard check --fix",
	],
	parameters: [...codeCheckParameters, fixParameter],
	input: { ingress: CodeCheckInputSchema.extend(FixInputSchema.shape), stages: codeCheckStages },
	result: CheckAnswerSchema,
	output: checkOutput,
	prerequisites: ["server"],
	effects: ["read", "local-write"],
	refusals: [serverRefusal, noSuchDraftRefusal, planRefusal],
	relationships: [semanticsRoute, codeRoute, ...embedsRelationships],
	outcomes: checkOutcomes,
	/**
	 * Run every check.
	 * @param input What the code check reads, and whether the embeds check fixes.
	 * @param context Runtime prerequisites.
	 * @returns One part for each check, and a failure exit when issues remain.
	 */
	async handler(input, context) {
		return runChecks(
			["semantics", "code", "embeds"],
			context.parse(CodeCheckRequestSchema, input),
			context,
		);
	},
});

const checkEmbedsContract = defineCommand({
	path: ["check", "embeds"],
	shared: ["url", "directory"],
	runsWithoutVault: true,
	summary: "Check the reproducible architecture artifacts that this checkout embeds",
	description: CHECK_EMBEDS_HELP,
	examples: ["archboard check embeds", "archboard check embeds --fix"],
	parameters: [fixParameter],
	input: { ingress: FixInputSchema },
	result: CheckAnswerSchema,
	output: checkOutput,
	prerequisites: ["server"],
	effects: ["read", "local-write"],
	refusals: [serverRefusal],
	relationships: embedsRelationships,
	outcomes: checkOutcomes,
	/**
	 * Run the embeds check.
	 * @param input Whether it fixes.
	 * @param context Runtime prerequisites.
	 * @returns The embeds part, and a failure exit when a warning remains.
	 */
	async handler(input, context) {
		return runChecks(["embeds"], input, context);
	},
});

const checkSemanticsContract = defineCommand({
	path: ["check", "semantics"],
	shared: ["url", "directory"],
	summary: "Check the canonical model, active proposals, and vocabulary",
	description:
		"Reports invalid configuration, incoherent model content, and removed vocabulary references. It changes no authored input. Exit 1 means that a diagnostic or warning remains.",
	examples: ["archboard check semantics"],
	parameters: [],
	input: { ingress: z.object({}) },
	result: CheckAnswerSchema,
	output: checkOutput,
	prerequisites: ["server"],
	effects: ["read"],
	refusals: [serverRefusal],
	relationships: [semanticsRoute],
	outcomes: checkOutcomes,
	/**
	 * Run the semantics check.
	 * @param _input Nothing: the semantics check takes no option.
	 * @param context Runtime prerequisites.
	 * @returns The semantics part, and a failure exit when issues remain.
	 */
	async handler(_input, context) {
		return runChecks(["semantics"], {}, context);
	},
});

const checkCodeContract = defineCommand({
	path: ["check", "code"],
	shared: ["url", "directory"],
	summary: "Inspect the source that canonical bindings and evidence anchors name",
	description: CHECK_CODE_HELP,
	examples: [
		"archboard check code",
		"archboard check code --state TASK-123",
		"archboard check code --every-draft",
		"archboard check code --plan infra/plan.json",
	],
	parameters: codeCheckParameters,
	input: { ingress: CodeCheckInputSchema, stages: codeCheckStages },
	result: CheckAnswerSchema,
	output: checkOutput,
	prerequisites: ["server"],
	effects: ["read"],
	refusals: [serverRefusal, noSuchDraftRefusal, planRefusal],
	relationships: [codeRoute],
	outcomes: checkOutcomes,
	/**
	 * Run the code check.
	 * @param input What the code check reads.
	 * @param context Runtime prerequisites.
	 * @returns The code part, and a failure exit when a warning remains.
	 */
	async handler(input, context) {
		return runChecks(["code"], context.parse(CodeCheckRequestSchema, input), context);
	},
});
const semanticConfigContract = defineCommand({
	path: ["model", "config"],
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
		await context.require("server", "model config");
		return { result: await checkSemanticVaultOnServer() };
	},
});
export {
	checkContract,
	checkAllContract,
	checkSemanticsContract,
	checkCodeContract,
	checkEmbedsContract,
	semanticConfigContract,
};
