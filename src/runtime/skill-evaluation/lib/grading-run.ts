// The grading session over one batch: a read-only workspace holding the
// pinned Flask checkouts and every anonymous run bundle, one Codex thread
// that grades the runs in chunks and is resumed rather than restarted, and
// the verdicts and the session's own usage written beside the runs.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { SKILL_EVAL_GRADER_TIMEOUT_MS } from "@/shared/timing/timing";
import { parseTrace, type Usage } from "@/runtime/skill-evaluation/lib/events";
import { codexVersion } from "@/runtime/skill-evaluation/lib/batch";
import { checkoutFlask } from "@/runtime/skill-evaluation/lib/flask";
import {
	FiledVerdictSchema,
	GRADER_OUTPUT_JSON_SCHEMA,
	graderPrompt,
	parseGraderOutput,
	type RunVerdict,
} from "@/runtime/skill-evaluation/lib/grader";
import {
	fillCodexHome,
	graderConfigToml,
	operatorAuthFile,
} from "@/runtime/skill-evaluation/lib/isolation";
import {
	runProcess,
	sequentially,
	type ProcessResult,
} from "@/runtime/skill-evaluation/lib/process";
import {
	fileImageReceipt,
	imagesForRun,
	type RunImages,
} from "@/runtime/skill-evaluation/lib/grading-images";
import { sumUsage } from "@/runtime/skill-evaluation/lib/report";
import { assertBatchInputs } from "@/runtime/skill-evaluation/lib/provenance";
import type { LoadedSuite } from "@/runtime/skill-evaluation/lib/suite";

/** What a grading pass is given. */
interface GradingOptions {
	readonly batchRoot: string;
	readonly checkout: string;
	readonly cache: string;
	readonly loaded: LoadedSuite;
	readonly chunkSize: number;
	readonly signal: AbortSignal;
	readonly log: (line: string) => void;
	readonly codexExecutable?: string | undefined;
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
	 * What the call's turn.completed reported. In a resumed thread that is the
	 * thread's cumulative usage so far, not this call's own (pins.json,
	 * usageSemantics); `callUsage` is this call's share.
	 */
	usage: UsageSchema.nullable(),
	/** This call's own usage: the difference from the previous reading of the same thread. Absent in sessions recorded before TASK-212. */
	callUsage: UsageSchema.nullable().optional(),
	graded: z.array(z.string()),
	error: z.string().nullable(),
});
type GradingCall = z.infer<typeof CallSchema>;
const SessionSchema = z.object({ threadId: z.string().nullable(), calls: z.array(CallSchema) });
type GradingSession = z.infer<typeof SessionSchema>;
const BundleHeadSchema = z.object({ run: z.string(), revision: z.string() }).passthrough();
/** A filed verdict, read leniently: one filed before captures existed carries no visual answer. */
const RunVerdictSchema = FiledVerdictSchema;

/** Where a grading pass keeps things. */
interface GradingPaths {
	readonly root: string;
	readonly workspace: string;
	readonly codexHome: string;
	readonly verdicts: string;
	readonly session: string;
	readonly schema: string;
}

/** One bundled run, found under the batch. */
interface BundledRun {
	readonly id: string;
	readonly directory: string;
	readonly revision: string;
}

/**
 * The grading directory's layout, created if absent.
 * @param batchRoot The batch.
 * @returns The paths.
 */
function gradingPaths(batchRoot: string): GradingPaths {
	const root = path.join(batchRoot, "grader");
	const paths: GradingPaths = {
		root,
		workspace: path.join(root, "workspace"),
		codexHome: path.join(root, "codex-home"),
		verdicts: path.join(root, "verdicts"),
		session: path.join(root, "session.json"),
		schema: path.join(root, "output-schema.json"),
	};
	for (const directory of [paths.workspace, paths.codexHome, paths.verdicts])
		fs.mkdirSync(directory, { recursive: true });
	return paths;
}

/**
 * Every run directory of the batch that finished with a bundle.
 * @param batchRoot The batch.
 * @returns Run directories with their anonymous ids and revisions.
 */
function bundledRuns(batchRoot: string): BundledRun[] {
	const runs = path.join(batchRoot, "runs");
	if (!fs.existsSync(runs)) return [];
	return fs
		.readdirSync(runs, { recursive: true })
		.map(String)
		.filter((entry) => entry.endsWith("bundle.json"))
		.map((entry) => {
			const directory = path.join(runs, path.dirname(entry));
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
 * The Codex command line for one grading call: a new thread for the first,
 * the same thread resumed for the rest.
 * @param options The pass.
 * @param paths The grading paths.
 * @param threadId The session's thread, once it has one.
 * @param files The prompt to send and the verdict file to fill.
 * @param files.prompt The prompt file.
 * @param files.verdict The verdict file.
 * @param files.images Validated images attached to this call, including resumptions.
 * @returns The argv.
 */
function graderArgv(
	options: GradingOptions,
	paths: GradingPaths,
	threadId: string | null,
	files: {
		readonly prompt: string;
		readonly verdict: string;
		readonly images: readonly RunImages[];
	},
): string[] {
	const grader = options.loaded.pins.codex.grader;
	const prompt = fs.readFileSync(files.prompt, "utf8");
	const shared = [
		...files.images.flatMap((run) =>
			run.images.flatMap((image) => ["--image", path.join(paths.workspace, image.file)]),
		),
		"--json",
		"--skip-git-repo-check",
		"-m",
		grader.model,
		"-c",
		`model_reasoning_effort=${JSON.stringify(grader.reasoningEffort)}`,
		"-c",
		'approval_policy="never"',
		"--output-schema",
		paths.schema,
		"-o",
		files.verdict,
	];
	return threadId === null
		? [
				options.codexExecutable ?? options.loaded.pins.codex.executable,
				"exec",
				...shared,
				"-C",
				paths.workspace,
				"-s",
				grader.sandbox,
				prompt,
			]
		: [
				options.codexExecutable ?? options.loaded.pins.codex.executable,
				"exec",
				"resume",
				threadId,
				...shared,
				prompt,
			];
}

/**
 * Files each run's verdict from a call's structured answer.
 * @param paths The grading paths.
 * @param verdictFile The answer file.
 * @param asked The runs the call was asked to grade.
 * @param images Delivery evidence, only when the call completed successfully.
 * @returns What was filed, and what went wrong reading the answer.
 */
function fileVerdicts(
	paths: GradingPaths,
	verdictFile: string,
	asked: readonly string[],
	images: readonly RunImages[] | null,
): { readonly graded: string[]; readonly error: string | null } {
	if (!fs.existsSync(verdictFile))
		return { graded: [], error: "the grader wrote no final message" };
	try {
		const output = parseGraderOutput(fs.readFileSync(verdictFile, "utf8"));
		const graded = output.runs
			.filter((verdict) => asked.includes(verdict.run))
			.map((verdict) => {
				fs.writeFileSync(
					path.join(paths.verdicts, `${verdict.run}.json`),
					`${JSON.stringify(verdict, null, "\t")}\n`,
				);
				fileImageReceipt(
					path.join(paths.verdicts, `${verdict.run}.json`),
					images?.find((run) => run.run === verdict.run) ?? null,
				);
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
 * Why a call went wrong, if it did: the filing error, the stream's failure,
 * or a non-zero exit.
 * @param filing What filing the verdicts said.
 * @param filing.error The filing error, if any.
 * @param failure What the event stream said.
 * @param result The process result.
 * @returns The error, or null.
 */
function callError(
	filing: { readonly error: string | null },
	failure: string | null,
	result: ProcessResult,
): string | null {
	if (filing.error !== null) return filing.error;
	if (failure !== null) return failure;
	return result.exitCode === 0
		? null
		: `codex exited ${result.exitCode ?? result.signalCode}; ${result.stderr.trim().split("\n").at(-1) ?? ""}`;
}

/**
 * Runs one grading call and files its verdicts.
 * @param options The pass.
 * @param paths The grading paths.
 * @param session The session, updated in place.
 * @param runs The anonymous ids to grade.
 * @returns The call record.
 */
async function gradeChunk(
	options: GradingOptions,
	paths: GradingPaths,
	session: GradingSession,
	runs: readonly string[],
): Promise<GradingCall> {
	const index = session.calls.length + 1;
	const images = runs.map((run) => imagesForRun(paths.workspace, run));
	const files = {
		images,
		prompt: path.join(paths.root, `prompt-${index}.md`),
		verdict: path.join(paths.root, `verdict-${index}.json`),
		events: path.join(paths.root, `grader-${index}.jsonl`),
	};
	fs.writeFileSync(
		files.prompt,
		graderPrompt({
			rubric: options.loaded.rubric,
			layout: { flask: "flask", runs: "runs", verdictFile: path.basename(files.verdict) },
			revisions: { ...options.loaded.pins.flask.revisions },
			runs,
			continuing: session.threadId !== null,
			images,
		}),
	);
	const result = await runProcess({
		argv: graderArgv(options, paths, session.threadId, files),
		cwd: paths.workspace,
		env: {
			PATH: process.env["PATH"] ?? "",
			HOME: process.env["HOME"] ?? "",
			CODEX_HOME: paths.codexHome,
		},
		timeoutMs: SKILL_EVAL_GRADER_TIMEOUT_MS,
		signal: options.signal,
	});
	fs.writeFileSync(files.events, result.stdout);
	const trace = parseTrace(result.stdout);
	session.threadId ??= trace.threadId;
	const filing = fileVerdicts(
		paths,
		files.verdict,
		runs,
		deliveredImages(result, trace.failure, images),
	);
	const call: GradingCall = {
		index,
		runs: [...runs],
		promptFile: files.prompt,
		verdictFile: files.verdict,
		eventsFile: files.events,
		exitCode: result.exitCode,
		usage: trace.usage,
		callUsage: callUsageFrom(session.calls, trace.usage),
		graded: filing.graded,
		error: callError(filing, trace.failure, result),
	};
	session.calls.push(call);
	fs.writeFileSync(paths.session, `${JSON.stringify(session, null, "\t")}\n`);
	options.log(
		`call ${call.index}: graded ${call.graded.length}/${call.runs.length}${call.error === null ? "" : ` (${call.error})`}`,
	);
	return call;
}

/**
 * Image delivery only stands after a successful, uninterrupted call.
 * @param result The process outcome.
 * @param failure The protocol failure, if any.
 * @param images The supplied attachments.
 * @returns Delivery evidence or null when the call could not establish it.
 */
function deliveredImages(
	result: ProcessResult,
	failure: string | null,
	images: readonly RunImages[],
): readonly RunImages[] | null {
	return result.exitCode === 0 && !result.timedOut && failure === null ? images : null;
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
 * Grades every bundled run of a batch that has no verdict yet, in one
 * session, in chunks.
 * @param options The pass.
 * @returns The session and the grader's total usage.
 */
async function gradeBatch(
	options: GradingOptions,
): Promise<{ readonly session: GradingSession; readonly usage: Usage | null }> {
	assertBatchInputs(options.batchRoot, options.loaded);
	const version = await codexVersion(
		options.codexExecutable ?? options.loaded.pins.codex.executable,
	);
	if (version !== options.loaded.pins.codex.version)
		throw new Error(
			`Grading requires Codex ${options.loaded.pins.codex.version}; the executable reports ${version}. Choose the pinned executable with --codex.`,
		);
	const paths = gradingPaths(options.batchRoot);
	fs.writeFileSync(paths.schema, `${JSON.stringify(GRADER_OUTPUT_JSON_SCHEMA, null, "\t")}\n`);
	fillCodexHome(
		paths.codexHome,
		operatorAuthFile(),
		graderConfigToml(options.loaded.pins.codex.grader, paths.workspace),
	);
	const runs = bundledRuns(options.batchRoot);
	await stageFlask(options, [...new Set(runs.map((run) => run.revision))], paths.workspace);
	for (const run of runs) stageRun(run, paths.workspace);
	const session = readSession(paths.session);
	const pending = runs
		.map((run) => run.id)
		.filter((id) => !fs.existsSync(path.join(paths.verdicts, `${id}.json`)));
	options.log(
		`${runs.length} runs staged, ${pending.length} to grade, chunks of ${options.chunkSize}`,
	);
	await sequentially(chunked(pending, options.chunkSize), async (chunk) => {
		if (!options.signal.aborted) await gradeChunk(options, paths, session, chunk);
	});
	const usage = sessionUsage(session.calls);
	fs.writeFileSync(path.join(paths.root, "usage.json"), `${JSON.stringify(usage, null, "\t")}\n`);
	return { session, usage };
}

/**
 * The difference between two cumulative readings, field by field.
 * @param now The later reading.
 * @param before The earlier one.
 * @returns What happened in between.
 */
function usageSince(now: Usage, before: Usage): Usage {
	/**
	 * One optional field's difference, unavailable when either side is.
	 * @param pick The field.
	 * @returns The difference or null.
	 */
	const optional = (pick: (usage: Usage) => number | null): number | null => {
		const later = pick(now);
		const earlier = pick(before);
		return later === null || earlier === null ? null : later - earlier;
	};
	return {
		input: now.input - before.input,
		cached: now.cached - before.cached,
		cacheWrite: optional((usage) => usage.cacheWrite),
		output: now.output - before.output,
		reasoning: optional((usage) => usage.reasoning),
		total: now.total - before.total,
	};
}

/**
 * The last cumulative reading a session's earlier calls gave.
 * @param calls The calls so far.
 * @returns The reading, or null when none gave one.
 */
function lastReading(calls: readonly { readonly usage: Usage | null }[]): Usage | null {
	return calls.map((call) => call.usage).findLast((usage) => usage !== null) ?? null;
}

/**
 * One call's own usage, read off the thread's cumulative counter.
 *
 * Codex's `turn.completed` usage is the thread's `total_token_usage`: a resumed
 * call reports everything the thread has cost so far, itself included. This
 * call's share is therefore the growth since the previous reading. A reading
 * smaller than the previous one is not a continuation — the thread was
 * started afresh — and then the reading is the call's own.
 * @param earlier The session's earlier calls.
 * @param reported What this call reported.
 * @returns This call's usage, or null when it reported none.
 */
function callUsageFrom(
	earlier: readonly { readonly usage: Usage | null }[],
	reported: Usage | null,
): Usage | null {
	if (reported === null) return null;
	const previous = lastReading(earlier);
	return previous === null || reported.total < previous.total
		? reported
		: usageSince(reported, previous);
}

/**
 * What one grading session cost in total, under the same semantics: the last
 * reading of each run of cumulative readings, added up. One thread resumed
 * throughout is one reading, its last; summing the calls would count the
 * first call's tokens once per call.
 * @param calls The session's calls, in order.
 * @returns The session's usage, or null when no call reported any.
 */
function sessionUsage(calls: readonly { readonly usage: Usage | null }[]): Usage | null {
	const readings = calls.map((call) => call.usage).filter((usage) => usage !== null);
	// A reading ends a run of cumulative readings when the next one is smaller.
	const ends = readings.filter((reading, index) => {
		const next = readings[index + 1];
		return next === undefined || next.total < reading.total;
	});
	return ends.length === 0 ? null : sumUsage(ends);
}

/**
 * The verdict filed for one run, if any.
 * @param batchRoot The batch.
 * @param id The anonymous id.
 * @returns The verdict, or null.
 */
function filedVerdict(batchRoot: string, id: string): RunVerdict | null {
	const file = path.join(batchRoot, "grader", "verdicts", `${id}.json`);
	return fs.existsSync(file)
		? RunVerdictSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")))
		: null;
}

/**
 * The grader's usage as last written.
 * @param batchRoot The batch.
 * @returns The usage, or null.
 */
function graderUsage(batchRoot: string): Usage | null {
	const sessionFile = path.join(batchRoot, "grader", "session.json");
	if (fs.existsSync(sessionFile)) {
		const session = readSession(sessionFile);
		return sessionUsage(session.calls);
	}
	const file = path.join(batchRoot, "grader", "usage.json");
	return fs.existsSync(file)
		? UsageSchema.nullable().parse(JSON.parse(fs.readFileSync(file, "utf8")))
		: null;
}

export {
	bundledRuns,
	callUsageFrom,
	chunked,
	filedVerdict,
	gradeBatch,
	graderArgv,
	graderUsage,
	sessionUsage,
	type GradingOptions,
};
