// The grading session over one batch: a read-only workspace holding the
// pinned Flask checkouts, the skill under evaluation and every anonymous run
// bundle, one grader session
// that grades the runs in chunks and is resumed rather than restarted, and
// the verdicts and the session's own usage written beside the runs. Which
// program grades is chosen here, by name, through the runner seam. An answer
// short of what the report holds a run to (every declared feature by its
// name, none invented, an observation of every capture) is asked for once
// more in the same session, and the retry is a call of the session like any
// other, so its usage counts and its record says what was asked and mended.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { SKILL_EVAL_GRADER_TIMEOUT_MS } from "@/shared/timing/timing";
import type { Usage } from "@/runtime/skill-evaluation/lib/events";
import { checkoutFlask } from "@/runtime/skill-evaluation/lib/flask";
import { claudeGrader } from "@/runtime/skill-evaluation/lib/claude-grader";
import { codexGrader } from "@/runtime/skill-evaluation/lib/codex-grader";
import {
	GRADER_OUTPUT_JSON_SCHEMA,
	graderPrompt,
	type GraderBrief,
} from "@/runtime/skill-evaluation/lib/grader";
import {
	graderRetryPrompt,
	owedRetries,
	settleRetry,
	shortAnswers,
	type ShortAnswer,
} from "@/runtime/skill-evaluation/lib/grading-retry";
import {
	UsageSchema,
	filedEvidence,
	filedVerdict,
	fileVerdict,
	fileVerdicts,
	readAnswer,
	readSession,
	semanticsOf,
	type GradingCall,
	type GradingSession,
} from "@/runtime/skill-evaluation/lib/grading-session";
import {
	graderLayout,
	prepareGraderLayout,
	type GraderLayout,
} from "@/runtime/skill-evaluation/lib/grader-layout";
import type {
	GraderCallOutcome,
	GraderIdentity,
	GraderRunner,
} from "@/runtime/skill-evaluation/lib/grader-runner";
import { callUsageFrom, sessionUsage } from "@/runtime/skill-evaluation/lib/grader-usage";
import { sequentially, type ProcessResult } from "@/runtime/skill-evaluation/lib/process";
import { imagesForRun, type RunImages } from "@/runtime/skill-evaluation/lib/grading-images";
import { BATCH_SKILL_DIRECTORY } from "@/runtime/skill-evaluation/lib/citations";
import { digestOf } from "@/runtime/skill-evaluation/lib/install";
import { assertBatchInputs } from "@/runtime/skill-evaluation/lib/provenance";
import type { GraderName, LoadedSuite } from "@/runtime/skill-evaluation/lib/suite";
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

const BundleHeadSchema = z.object({ run: z.string(), revision: z.string() }).passthrough();

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

/** One call's own files, numbered by its place in the session. */
interface CallFiles {
	readonly prompt: string;
	readonly verdict: string;
	readonly events: string;
}

/**
 * Sends one prompt to the session, starting it on the first call and
 * continuing it on every other, and keeps the prompt and the stream.
 * @param options The pass.
 * @param runner The chosen runner.
 * @param layout The grading layout.
 * @param session The session, its id taken from the first call.
 * @param images The pictures offered on this call.
 * @param prompt The prompt, given the brief's layout for this call.
 * @returns The call's number, files and outcome.
 */
async function sendCall(
	options: GradingOptions,
	runner: GraderRunner,
	layout: GraderLayout,
	session: GradingSession,
	images: readonly RunImages[],
	prompt: (brief: GraderBrief["layout"]) => string,
): Promise<{
	readonly index: number;
	readonly files: CallFiles;
	readonly outcome: GraderCallOutcome;
}> {
	const index = session.calls.length + 1;
	const files = {
		prompt: path.join(layout.root, `prompt-${index}.md`),
		verdict: path.join(layout.root, `verdict-${index}.json`),
		events: path.join(layout.root, `grader-${index}.jsonl`),
	};
	const text = prompt({
		flask: "flask",
		runs: "runs",
		skill: SKILL_DIRECTORY,
		verdictFile: path.basename(files.verdict),
	});
	fs.writeFileSync(files.prompt, text);
	const outcome = await runner.call({
		workspace: layout.workspace,
		prompt: text,
		schemaFile: layout.schema,
		verdictFile: files.verdict,
		images,
		sessionId: session.threadId,
		timeoutMs: SKILL_EVAL_GRADER_TIMEOUT_MS,
		signal: options.signal,
	});
	fs.writeFileSync(files.events, outcome.events);
	session.threadId ??= outcome.sessionId;
	return { index, files, outcome };
}

/**
 * Records a finished call in the session and writes the session.
 * @param runner The chosen runner.
 * @param layout The grading layout.
 * @param session The session, updated in place.
 * @param sent The call as sent.
 * @param fields What the call asked and filed.
 * @returns The call record.
 */
function recordCall(
	runner: GraderRunner,
	layout: GraderLayout,
	session: GradingSession,
	sent: Awaited<ReturnType<typeof sendCall>>,
	fields: Pick<GradingCall, "runs" | "graded" | "retry"> & { readonly filingError: string | null },
): GradingCall {
	const { index, files, outcome } = sent;
	const call: GradingCall = {
		index,
		runs: fields.runs,
		promptFile: files.prompt,
		verdictFile: files.verdict,
		eventsFile: files.events,
		exitCode: outcome.result.exitCode,
		usage: outcome.usage,
		callUsage: callUsageFrom(session.calls, outcome.usage, runner.usageSemantics),
		raw: outcome.raw,
		graded: fields.graded,
		error: callError(runner.name, { error: fields.filingError }, outcome.failure, outcome.result),
		...(fields.retry === undefined ? {} : { retry: fields.retry }),
	};
	session.calls.push(call);
	fs.writeFileSync(layout.session, `${JSON.stringify(session, null, "\t")}\n`);
	return call;
}

/**
 * Asks the session once more for the runs a call's answer fell short on,
 * naming what each lacks, in the same session so the grader keeps what it
 * read and saw. Never itself retried.
 * @param options The pass.
 * @param runner The chosen runner.
 * @param layout The grading layout.
 * @param session The session.
 * @param of The number of the call whose answer fell short.
 * @param shorts Its short answers.
 * @returns The retry's call record.
 */
async function retryShortAnswers(
	options: GradingOptions,
	runner: GraderRunner,
	layout: GraderLayout,
	session: GradingSession,
	of: number,
	shorts: readonly ShortAnswer[],
): Promise<GradingCall> {
	const runs = shorts.map((short) => short.shortfall.run);
	const images = shorts.map((short) => short.offered);
	const sent = await sendCall(options, runner, layout, session, images, (brief) =>
		graderRetryPrompt(
			{
				rubric: options.loaded.rubric,
				layout: brief,
				revisions: { ...options.loaded.pins.flask.revisions },
				runs,
				images,
				delivery: runner.delivery,
			},
			shorts.map((short) => short.shortfall),
		),
	);
	const answer = readAnswer(sent.files.verdict);
	const retried = shorts.map((short) => {
		const settled = settleRetry(
			short,
			answer.runs.find((verdict) => verdict.run === short.shortfall.run),
			sent.outcome.delivered,
		);
		if (settled.replacement !== null)
			fileVerdict(layout, settled.replacement.verdict, settled.replacement.images);
		return settled.record;
	});
	const call = recordCall(runner, layout, session, sent, {
		runs,
		graded: retried.filter((entry) => entry.outcome === "replaced").map((entry) => entry.run),
		retry: { of, runs: retried },
		filingError: answer.error,
	});
	options.log(
		`call ${call.index}: re-asked call ${of} for ${runs.length}, replaced ${call.graded.length}${call.error === null ? "" : ` (${call.error})`}`,
	);
	return call;
}

/**
 * Runs one grading call and files its verdicts; when an answer falls short of
 * the harness's obligations, asks the session once more for those runs.
 * @param options The pass.
 * @param runner The chosen runner.
 * @param layout The grading layout.
 * @param session The session, updated in place.
 * @param runs The runs to grade.
 * @returns The call record, and the retry's when there was one.
 */
async function gradeChunk(
	options: GradingOptions,
	runner: GraderRunner,
	layout: GraderLayout,
	session: GradingSession,
	runs: readonly BundledRun[],
): Promise<GradingCall[]> {
	const ids = runs.map((run) => run.id);
	const images = ids.map((run) => imagesForRun(layout.workspace, run));
	const sent = await sendCall(options, runner, layout, session, images, (brief) =>
		graderPrompt({
			rubric: options.loaded.rubric,
			layout: brief,
			revisions: { ...options.loaded.pins.flask.revisions },
			runs: ids,
			continuing: session.threadId !== null,
			images,
			delivery: runner.delivery,
		}),
	);
	const filing = fileVerdicts(layout, sent.files.verdict, ids, sent.outcome.delivered);
	const call = recordCall(runner, layout, session, sent, {
		runs: ids,
		graded: filing.filed.map((verdict) => verdict.run),
		filingError: filing.error,
	});
	options.log(
		`call ${call.index}: graded ${call.graded.length}/${call.runs.length}${call.error === null ? "" : ` (${call.error})`}`,
	);
	const shorts = shortAnswers(options.loaded, runs, filing.filed, images, sent.outcome.delivered);
	if (shorts.length === 0 || options.signal.aborted) return [call];
	// Only the same session can be asked again: a fresh one has read nothing.
	if (session.threadId === null) {
		options.log(`call ${call.index}: ${shorts.length} answers fell short; no session to re-ask`);
		return [call];
	}
	return [call, await retryShortAnswers(options, runner, layout, session, call.index, shorts)];
}

/**
 * Asks the session once for every filed verdict still owed its retry, in
 * chunks, each retry naming the call that filed its verdicts.
 * @param options The pass.
 * @param runner The chosen runner.
 * @param layout The grading layout.
 * @param session The session.
 * @param runs Every bundled run.
 */
async function retryOwed(
	options: GradingOptions,
	runner: GraderRunner,
	layout: GraderLayout,
	session: GradingSession,
	runs: readonly BundledRun[],
): Promise<void> {
	if (session.threadId === null) return;
	const owed = [
		...owedRetries(
			options.loaded,
			session.calls,
			runs,
			filedEvidence(options.batchRoot, options.grader),
		),
	].flatMap(([of, shorts]) => chunked(shorts, options.chunkSize).map((chunk) => ({ of, chunk })));
	if (owed.length > 0)
		options.log(`${runner.name}: ${owed.length} retries owed from earlier calls`);
	await sequentially(owed, async ({ of, chunk }) => {
		if (!options.signal.aborted)
			await retryShortAnswers(options, runner, layout, session, of, chunk);
	});
}

/**
 * The items in chunks of the given size.
 * @param ids The items.
 * @param size The chunk size.
 * @returns The chunks.
 */
function chunked<T>(ids: readonly T[], size: number): T[][] {
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
	const pending = runs.filter(
		(run) => !fs.existsSync(path.join(layout.verdicts, `${run.id}.json`)),
	);
	options.log(
		`${runner.name}: ${runs.length} runs staged, ${pending.length} to grade, chunks of ${options.chunkSize}`,
	);
	await sequentially(chunked(pending, options.chunkSize), async (chunk) => {
		if (!options.signal.aborted) await gradeChunk(options, runner, layout, session, chunk);
	});
	await retryOwed(options, runner, layout, session, runs);
	const usage = sessionUsage(session.calls, runner.usageSemantics);
	fs.writeFileSync(path.join(layout.root, "usage.json"), `${JSON.stringify(usage, null, "\t")}\n`);
	return { session, usage };
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
