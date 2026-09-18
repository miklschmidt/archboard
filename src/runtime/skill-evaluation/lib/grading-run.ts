// The grading session over one batch: a read-only workspace holding the
// pinned Flask checkouts, the skill under evaluation and every anonymous run
// bundle, one grader session
// that grades the runs in chunks and is resumed rather than restarted, and
// the verdicts and the session's own usage written beside the runs. Which
// program grades is chosen here, by name, through the runner seam.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { SKILL_EVAL_GRADER_TIMEOUT_MS } from "@/shared/timing/timing";
import type { Usage } from "@/runtime/skill-evaluation/lib/events";
import { checkoutFlask } from "@/runtime/skill-evaluation/lib/flask";
import { claudeGrader } from "@/runtime/skill-evaluation/lib/claude-grader";
import { codexGrader } from "@/runtime/skill-evaluation/lib/codex-grader";
import {
	FiledVerdictSchema,
	GRADER_OUTPUT_JSON_SCHEMA,
	graderPrompt,
	parseGraderOutput,
	type RunVerdict,
} from "@/runtime/skill-evaluation/lib/grader";
import {
	graderLayout,
	prepareGraderLayout,
	type GraderLayout,
} from "@/runtime/skill-evaluation/lib/grader-layout";
import type {
	GraderCallOutcome,
	GraderIdentity,
	GraderRunner,
	UsageSemantics,
} from "@/runtime/skill-evaluation/lib/grader-runner";
import { callUsageFrom, sessionUsage } from "@/runtime/skill-evaluation/lib/grader-usage";
import { sequentially, type ProcessResult } from "@/runtime/skill-evaluation/lib/process";
import {
	fileImageReceipt,
	imagesForRun,
	type RunImages,
} from "@/runtime/skill-evaluation/lib/grading-images";
import { BATCH_SKILL_DIRECTORY } from "@/runtime/skill-evaluation/lib/citations";
import { digestOf } from "@/runtime/skill-evaluation/lib/install";
import { assertBatchInputs } from "@/runtime/skill-evaluation/lib/provenance";
import {
	GRADER_NAMES,
	type GraderName,
	type LoadedSuite,
} from "@/runtime/skill-evaluation/lib/suite";
import { runDirectories } from "@/runtime/skill-evaluation/lib/run-manifest";
import { executableVersion } from "@/runtime/skill-evaluation/lib/version";

/** What a grading pass is given. */
interface GradingOptions {
	readonly batchRoot: string;
	readonly checkout: string;
	readonly cache: string;
	readonly loaded: LoadedSuite;
	readonly chunkSize: number;
	readonly signal: AbortSignal;
	readonly log: (line: string) => void;
	/** Which grader runs, chosen now, not when the authors ran. */
	readonly grader: GraderName;
	/** The executable to run; must report the pinned version. */
	readonly executable: string;
}

const UsageSchema = z.object({
	input: z.number(),
	cached: z.number(),
	cacheWrite: z.number().nullable(),
	output: z.number(),
	reasoning: z.number().nullable(),
	total: z.number(),
});
const CallSchema = z.object({
	index: z.number(),
	runs: z.array(z.string()),
	promptFile: z.string(),
	verdictFile: z.string(),
	eventsFile: z.string(),
	exitCode: z.number().nullable(),
	/**
	 * What the call reported, under the runner's semantics: a Codex resumed
	 * thread reports its cumulative usage so far; a Claude call reports its own.
	 */
	usage: UsageSchema.nullable(),
	/** This call's own usage. Absent in sessions recorded before TASK-212. */
	callUsage: UsageSchema.nullable().optional(),
	/** The runner's raw usage record, kept beside the normalized one. Claude only. */
	raw: z
		.object({ usage: z.unknown(), modelUsage: z.unknown(), costUsd: z.number().nullable() })
		.nullable()
		.optional(),
	graded: z.array(z.string()),
	error: z.string().nullable(),
});
type GradingCall = z.infer<typeof CallSchema>;
const SessionSchema = z.object({
	/** The runner's session identity: a Codex thread id or a Claude session id. */
	threadId: z.string().nullable(),
	/** Absent in sessions recorded before there was a choice; those are Codex. */
	runner: z.enum(GRADER_NAMES).optional(),
	version: z.string().optional(),
	settings: z.record(z.string(), z.unknown()).optional(),
	calls: z.array(CallSchema),
});
type GradingSession = z.infer<typeof SessionSchema>;
const BundleHeadSchema = z.object({ run: z.string(), revision: z.string() }).passthrough();
/** A filed verdict, read leniently: one filed before captures existed carries no visual answer. */
const RunVerdictSchema = FiledVerdictSchema;

/** One bundled run, found under the batch. */
interface BundledRun {
	readonly id: string;
	readonly directory: string;
	readonly revision: string;
}

/**
 * Every run directory of the batch that finished with a bundle.
 * @param batchRoot The batch.
 * @returns Run directories with their anonymous ids and revisions.
 */
function bundledRuns(batchRoot: string): BundledRun[] {
	return runDirectories(batchRoot)
		.filter((directory) => fs.existsSync(path.join(directory, "bundle.json")))
		.map((directory) => {
			const head = BundleHeadSchema.parse(
				JSON.parse(fs.readFileSync(path.join(directory, "bundle.json"), "utf8")),
			);
			return { id: head.run, directory, revision: head.revision };
		})
		.toSorted((a, b) => a.id.localeCompare(b.id));
}

/**
 * Copies one run's blinded material into the workspace.
 * @param run The run.
 * @param workspace The workspace.
 */
function stageRun(run: BundledRun, workspace: string): void {
	const target = path.join(workspace, "runs", run.id);
	fs.rmSync(target, { recursive: true, force: true });
	fs.mkdirSync(target, { recursive: true });
	fs.copyFileSync(path.join(run.directory, "bundle.json"), path.join(target, "bundle.json"));
	for (const sub of ["boards", "renders", "captures"]) {
		const source = path.join(run.directory, sub);
		if (fs.existsSync(source)) fs.cpSync(source, path.join(target, sub), { recursive: true });
	}
}

/** Where the skill under evaluation sits in the grading workspace. */
const SKILL_DIRECTORY = "skill";

/**
 * Copies the skill under evaluation into the workspace, so a grader can read
 * the passage an expected feature cites and judge conformance against the
 * skill rather than against the rubric's summary of it.
 *
 * It is the candidate skill as the batch kept it when it ran, once, for every
 * run of both arms, and never a run's own copy. A comparison needs one
 * instrument: judging each arm against its own skill measures two things with
 * two rulers. And a per-run copy would let a grader sort runs by the text
 * beside them, which is the unblinding blind.ts keeps a printed SKILL.md out
 * of the bundle to prevent. The cost falls on the baseline arm, which may be
 * found to depart from a passage it never carried; the report counts those
 * findings apart. A batch that kept no copy predates this and is refused: its
 * skill can no longer be known. So is a copy whose digest is not the one the
 * batch recorded when it kept it: a later edit to it would be judged against
 * by no run.
 * @param options The pass.
 * @param workspace The workspace.
 */
function stageSkill(options: GradingOptions, workspace: string): void {
	const kept = path.join(options.batchRoot, BATCH_SKILL_DIRECTORY);
	const recorded = z
		.object({ candidateSkillDigest: z.string().optional() })
		.parse(
			JSON.parse(fs.readFileSync(path.join(options.batchRoot, "batch.json"), "utf8")),
		).candidateSkillDigest;
	if (recorded === undefined || !fs.existsSync(path.join(kept, "SKILL.md")))
		throw new Error(
			`${kept} is missing or unrecorded: this batch kept no copy of the skill it ran, so conformance cannot be judged against it. Grade a batch started since the copy was kept.`,
		);
	if (digestOf(kept) !== recorded)
		throw new Error(
			`${kept} changed after the batch kept it; restore it to the copy the batch recorded before grading.`,
		);
	const target = path.join(workspace, SKILL_DIRECTORY);
	fs.rmSync(target, { recursive: true, force: true });
	fs.cpSync(kept, target, { recursive: true, dereference: true });
}

/**
 * Makes sure the workspace holds every Flask revision the runs used.
 * @param options The pass.
 * @param revisions The revisions used.
 * @param workspace The workspace.
 */
async function stageFlask(
	options: GradingOptions,
	revisions: readonly string[],
	workspace: string,
): Promise<void> {
	const commits: Record<string, string> = { ...options.loaded.pins.flask.revisions };
	await sequentially(revisions, async (revision) => {
		const destination = path.join(workspace, "flask", revision);
		if (fs.existsSync(path.join(destination, ".git"))) return;
		await checkoutFlask(
			options.cache,
			options.loaded.pins.flask.repository,
			commits[revision] ?? "",
			destination,
			options.signal,
		);
	});
}

/**
 * The session as last written, or a fresh one.
 * @param file The session file.
 * @returns The session.
 */
function readSession(file: string): GradingSession {
	return fs.existsSync(file)
		? SessionSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")))
		: { threadId: null, calls: [] };
}

/**
 * The usage semantics a recorded session was written under.
 * @param session The session.
 * @returns Cumulative for Codex and for sessions recorded before the choice.
 */
function semanticsOf(session: GradingSession): UsageSemantics {
	return session.runner === "claude" ? "per-call" : "cumulative";
}

/**
 * The runner chosen by name.
 * @param options The pass.
 * @returns The runner.
 */
function runnerFor(options: GradingOptions): GraderRunner {
	return options.grader === "claude"
		? claudeGrader(options.loaded.graders.claude, options.executable)
		: codexGrader(options.loaded.graders.codex, options.executable);
}

/**
 * Files each run's verdict from a call's structured answer.
 * @param layout The grading layout.
 * @param verdictFile The answer file.
 * @param asked The runs the call was asked to grade.
 * @param images Delivery evidence, only when the call completed successfully.
 * @returns What was filed, and what went wrong reading the answer.
 */
function fileVerdicts(
	layout: GraderLayout,
	verdictFile: string,
	asked: readonly string[],
	images: readonly RunImages[] | null,
): { readonly graded: string[]; readonly error: string | null } {
	if (!fs.existsSync(verdictFile))
		return { graded: [], error: "the grader returned no structured answer" };
	try {
		const output = parseGraderOutput(fs.readFileSync(verdictFile, "utf8"));
		const graded = output.runs
			.filter((verdict) => asked.includes(verdict.run))
			.map((verdict) => {
				const file = path.join(layout.verdicts, `${verdict.run}.json`);
				fs.writeFileSync(file, `${JSON.stringify(verdict, null, "\t")}\n`);
				fileImageReceipt(file, images?.find((run) => run.run === verdict.run) ?? null);
				return verdict.run;
			});
		const missing = asked.filter((id) => !graded.includes(id));
		return {
			graded,
			error:
				missing.length === 0 ? null : `the grader returned no verdict for ${missing.join(", ")}`,
		};
	} catch (error) {
		return { graded: [], error: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * Why a call went wrong, if it did: the filing error, the runner's failure,
 * or a non-zero exit.
 * @param name The runner, for the message.
 * @param filing What filing the verdicts said.
 * @param filing.error The filing error, if any.
 * @param failure What the runner said.
 * @param result The process result.
 * @returns The error, or null.
 */
function callError(
	name: GraderName,
	filing: { readonly error: string | null },
	failure: string | null,
	result: ProcessResult,
): string | null {
	if (failure !== null) return failure;
	if (filing.error !== null) return filing.error;
	return result.exitCode === 0
		? null
		: `${name} exited ${result.exitCode ?? result.signalCode}; ${result.stderr.trim().split("\n").at(-1) ?? ""}`;
}

/**
 * Runs one grading call and files its verdicts.
 * @param options The pass.
 * @param runner The chosen runner.
 * @param layout The grading layout.
 * @param session The session, updated in place.
 * @param runs The anonymous ids to grade.
 * @returns The call record.
 */
async function gradeChunk(
	options: GradingOptions,
	runner: GraderRunner,
	layout: GraderLayout,
	session: GradingSession,
	runs: readonly string[],
): Promise<GradingCall> {
	const index = session.calls.length + 1;
	const images = runs.map((run) => imagesForRun(layout.workspace, run));
	const files = {
		prompt: path.join(layout.root, `prompt-${index}.md`),
		verdict: path.join(layout.root, `verdict-${index}.json`),
		events: path.join(layout.root, `grader-${index}.jsonl`),
	};
	const prompt = graderPrompt({
		rubric: options.loaded.rubric,
		layout: {
			flask: "flask",
			runs: "runs",
			skill: SKILL_DIRECTORY,
			verdictFile: path.basename(files.verdict),
		},
		revisions: { ...options.loaded.pins.flask.revisions },
		runs,
		continuing: session.threadId !== null,
		images,
		delivery: runner.delivery,
	});
	fs.writeFileSync(files.prompt, prompt);
	const outcome: GraderCallOutcome = await runner.call({
		workspace: layout.workspace,
		prompt,
		schemaFile: layout.schema,
		verdictFile: files.verdict,
		images,
		sessionId: session.threadId,
		timeoutMs: SKILL_EVAL_GRADER_TIMEOUT_MS,
		signal: options.signal,
	});
	fs.writeFileSync(files.events, outcome.events);
	session.threadId ??= outcome.sessionId;
	const filing = fileVerdicts(layout, files.verdict, runs, outcome.delivered);
	const call: GradingCall = {
		index,
		runs: [...runs],
		promptFile: files.prompt,
		verdictFile: files.verdict,
		eventsFile: files.events,
		exitCode: outcome.result.exitCode,
		usage: outcome.usage,
		callUsage: callUsageFrom(session.calls, outcome.usage, runner.usageSemantics),
		raw: outcome.raw,
		graded: filing.graded,
		error: callError(runner.name, filing, outcome.failure, outcome.result),
	};
	session.calls.push(call);
	fs.writeFileSync(layout.session, `${JSON.stringify(session, null, "\t")}\n`);
	options.log(
		`call ${call.index}: graded ${call.graded.length}/${call.runs.length}${call.error === null ? "" : ` (${call.error})`}`,
	);
	return call;
}

/**
 * The ids in chunks of the given size.
 * @param ids The ids.
 * @param size The chunk size.
 * @returns The chunks.
 */
function chunked(ids: readonly string[], size: number): string[][] {
	return Array.from({ length: Math.ceil(ids.length / Math.max(1, size)) }, (_, index) =>
		ids.slice(index * size, (index + 1) * size),
	);
}

/**
 * Refuses an executable whose version is not the pinned one.
 * @param runner The runner.
 */
async function assertPinnedVersion(runner: GraderRunner): Promise<void> {
	const version = await executableVersion(runner.executable);
	if (version !== runner.pinnedVersion)
		throw new Error(
			`Grading requires ${runner.name} ${runner.pinnedVersion}; the executable reports ${version}. Choose the pinned executable with --${runner.name}, or repin with \`bun run eval:skill pin\`.`,
		);
}

/**
 * Grades every bundled run of a batch that the chosen grader has no verdict
 * for yet, in one session, in chunks.
 * @param options The pass.
 * @returns The session and the grader's total usage.
 */
async function gradeBatch(
	options: GradingOptions,
): Promise<{ readonly session: GradingSession; readonly usage: Usage | null }> {
	assertBatchInputs(options.batchRoot, options.loaded);
	const runner = runnerFor(options);
	await assertPinnedVersion(runner);
	const layout = prepareGraderLayout(options.batchRoot, options.grader);
	fs.writeFileSync(layout.schema, `${JSON.stringify(GRADER_OUTPUT_JSON_SCHEMA, null, "\t")}\n`);
	runner.prepare(layout.root, layout.workspace);
	const runs = bundledRuns(options.batchRoot);
	stageSkill(options, layout.workspace);
	await stageFlask(options, [...new Set(runs.map((run) => run.revision))], layout.workspace);
	for (const run of runs) stageRun(run, layout.workspace);
	const session = readSession(layout.session);
	if (session.runner !== undefined && session.runner !== runner.name)
		throw new Error(`${layout.session} belongs to the ${session.runner} grader`);
	session.runner = runner.name;
	session.version = runner.pinnedVersion;
	session.settings = { ...runner.settings };
	const pending = runs
		.map((run) => run.id)
		.filter((id) => !fs.existsSync(path.join(layout.verdicts, `${id}.json`)));
	options.log(
		`${runner.name}: ${runs.length} runs staged, ${pending.length} to grade, chunks of ${options.chunkSize}`,
	);
	await sequentially(chunked(pending, options.chunkSize), async (chunk) => {
		if (!options.signal.aborted) await gradeChunk(options, runner, layout, session, chunk);
	});
	const usage = sessionUsage(session.calls, runner.usageSemantics);
	fs.writeFileSync(path.join(layout.root, "usage.json"), `${JSON.stringify(usage, null, "\t")}\n`);
	return { session, usage };
}

/**
 * The verdict one grader filed for one run, if any.
 * @param batchRoot The batch.
 * @param grader The grader.
 * @param id The anonymous id.
 * @returns The verdict, or null.
 */
function filedVerdict(batchRoot: string, grader: GraderName, id: string): RunVerdict | null {
	const file = path.join(graderLayout(batchRoot, grader).verdicts, `${id}.json`);
	return fs.existsSync(file)
		? RunVerdictSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")))
		: null;
}

/**
 * The grader's usage as last written, under the semantics it recorded.
 * @param batchRoot The batch.
 * @param grader The grader.
 * @returns The usage, or null.
 */
function graderUsage(batchRoot: string, grader: GraderName): Usage | null {
	const layout = graderLayout(batchRoot, grader);
	if (fs.existsSync(layout.session)) {
		const session = readSession(layout.session);
		return sessionUsage(session.calls, semanticsOf(session));
	}
	const file = path.join(layout.root, "usage.json");
	return fs.existsSync(file)
		? UsageSchema.nullable().parse(JSON.parse(fs.readFileSync(file, "utf8")))
		: null;
}

/**
 * Who graded, as the session recorded it.
 * @param batchRoot The batch.
 * @param grader The grader.
 * @returns The identity, or null when the grader has no session here.
 */
function graderIdentity(batchRoot: string, grader: GraderName): GraderIdentity | null {
	const layout = graderLayout(batchRoot, grader);
	if (!fs.existsSync(layout.session)) return null;
	const session = readSession(layout.session);
	const model = session.settings?.["model"];
	return {
		name: grader,
		semantics: semanticsOf(session),
		model: typeof model === "string" ? model : null,
	};
}

export {
	bundledRuns,
	chunked,
	filedVerdict,
	gradeBatch,
	graderIdentity,
	graderUsage,
	type GraderIdentity,
	type GradingOptions,
};
