// One author run, start to finish: a private world, Flask at the pin, a
// canvas of its own, the fixture laid, the skill installed and verified, a
// snapshot, one Codex exec with the scenario's prompt, and then everything
// the checks and the grader need read back and written down. The canvas is
// stopped whatever happened.

import fs from "node:fs";
import path from "node:path";
import { SKILL_EVAL_AUTHOR_TIMEOUT_MS } from "@/shared/timing/timing";
import type { SemanticBoard } from "@/shared/semantic-board/index";
import type { CliContext } from "@/runtime/skill-evaluation/lib/archboard";
import {
	anonymousRunId,
	bundleForGrader,
	type Arm,
	type CompletedRun,
	type RunStatus,
} from "@/runtime/skill-evaluation/lib/blind";
import { startCanvas, type OwnedCanvas } from "@/runtime/skill-evaluation/lib/canvas";
import {
	captureDeclared,
	captureSummary,
	type CaptureAttempt,
} from "@/runtime/skill-evaluation/lib/captures";
import {
	classCounts,
	classifyCommands,
	exposureCounts,
	guidanceFilesRead,
	guidanceStanding,
	parseTrace,
	type ClassifiedCommand,
	type GuidanceStanding,
} from "@/runtime/skill-evaluation/lib/events";
import { checkoutFlask } from "@/runtime/skill-evaluation/lib/flask";
import {
	countDirectBoardWrites,
	evaluateGuardrails,
} from "@/runtime/skill-evaluation/lib/guardrails";
import { installSkill, type InstallRecord } from "@/runtime/skill-evaluation/lib/install";
import {
	authorConfigToml,
	fillCodexHome,
	operatorAuthFile,
	prepareRunDirectory,
	runEnvironment,
	writeCliWrapper,
	type RunPaths,
} from "@/runtime/skill-evaluation/lib/isolation";
import {
	evaluateOutcomes,
	inspectionRequests,
	renderRequests,
} from "@/runtime/skill-evaluation/lib/outcomes";
import {
	runProcess,
	sequentially,
	type ProcessResult,
} from "@/runtime/skill-evaluation/lib/process";
import type { Reading } from "@/runtime/skill-evaluation/lib/reading";
import type { Fixture, Pins, Scenario } from "@/runtime/skill-evaluation/lib/suite";
import {
	inspectGroup,
	layFixture,
	readConfigurationText,
	readPolicy,
	readVault,
	renderBoard,
	vaultDiagnostics,
	writeBoards,
	writeVaultConfiguration,
} from "@/runtime/skill-evaluation/lib/vault";

/** What one run is asked to do. */
interface RunJob {
	readonly arm: Arm;
	readonly scenario: Scenario;
	readonly fixture: Fixture;
	readonly repetition: number;
	readonly root: string;
	/** The batch this run belongs to; every other run under it is off limits. */
	readonly batchRoot: string;
	readonly salt: string;
	readonly checkout: string;
	readonly cache: string;
	readonly pins: Pins;
	readonly frozenSkill: string;
	readonly signal: AbortSignal;
}

/** What the author process was and did, for the manifest. */
interface AuthorRecord {
	readonly argv: readonly string[];
	readonly exitCode: number | null;
	readonly timedOut: boolean;
	readonly cancelled: boolean;
	readonly durationMs: number;
	readonly threadId: string | null;
	readonly failure: string | null;
	readonly events: number;
	readonly malformedLines: number;
}

/** A run's world, once it is up. */
interface RunWorld {
	readonly paths: RunPaths;
	readonly cli: CliContext;
	readonly canvas: OwnedCanvas;
	readonly commit: string;
}

/**
 * Brings one run's world up: directory, Flask, canvas, configuration.
 * @param job The job.
 * @returns The world.
 */
async function bringUp(job: RunJob): Promise<RunWorld> {
	const paths = prepareRunDirectory(job.root);
	writeCliWrapper(paths, job.checkout);
	const commit = await checkoutFlask(
		job.cache,
		job.pins.flask.repository,
		job.pins.flask.revisions[job.scenario.flask],
		paths.flask,
		job.signal,
	);
	writeVaultConfiguration(paths.vault, job.fixture.policy);
	fillCodexHome(
		paths.codexHome,
		operatorAuthFile(),
		authorConfigToml(job.pins.codex.author, paths),
	);
	const canvas = await startCanvas(
		job.checkout,
		paths,
		runEnvironment(paths, "http://127.0.0.1:0"),
		job.signal,
	);
	const env = runEnvironment(paths, canvas.url);
	return {
		paths,
		cli: { checkout: job.checkout, env, cwd: paths.flask, signal: job.signal },
		canvas,
		commit,
	};
}

/**
 * The Codex command line for the author, exactly as pinned.
 * @param job The job.
 * @param paths The run.
 * @returns The argv.
 */
function authorArgv(job: RunJob, paths: RunPaths): string[] {
	const author = job.pins.codex.author;
	return [
		job.pins.codex.executable,
		"exec",
		"--json",
		"--skip-git-repo-check",
		"-C",
		paths.flask,
		"-m",
		author.model,
		"-c",
		`model_reasoning_effort=${JSON.stringify(author.reasoningEffort)}`,
		"-c",
		'approval_policy="never"',
		"-s",
		author.sandbox,
		"-o",
		paths.lastMessage,
		job.scenario.prompt,
	];
}

/**
 * Runs the author, streaming its events to the run's raw file.
 * @param job The job.
 * @param world The world.
 * @returns The process result and the argv.
 */
async function runAuthorProcess(
	job: RunJob,
	world: RunWorld,
): Promise<{ readonly result: ProcessResult; readonly argv: readonly string[] }> {
	const argv = authorArgv(job, world.paths);
	const events = fs.openSync(world.paths.authorEvents, "w");
	try {
		const result = await runProcess({
			argv,
			cwd: world.paths.flask,
			env: world.cli.env,
			timeoutMs: SKILL_EVAL_AUTHOR_TIMEOUT_MS,
			signal: job.signal,
			/**
			 * Retains the stream as it arrives.
			 * @param chunk The next piece of stdout.
			 */
			onStdout: (chunk) => {
				fs.writeSync(events, chunk);
			},
		});
		fs.writeFileSync(world.paths.authorStdout, result.stdout);
		fs.writeFileSync(world.paths.authorStderr, result.stderr);
		return { result, argv };
	} finally {
		fs.closeSync(events);
	}
}

/**
 * The status a process result amounts to.
 * @param result The result.
 * @param failure What the event stream said went wrong, if anything.
 * @returns The status.
 */
function statusOf(result: ProcessResult, failure: string | null): RunStatus {
	if (result.cancelled) return "cancelled";
	if (result.timedOut) return "timed-out";
	return result.exitCode === 0 && failure === null ? "completed" : "failed";
}

/**
 * Reads everything the checks need after the author ran.
 * @param world The world.
 * @param scenario The scenario.
 * @param snapshot The boards before the author.
 * @returns The reading.
 */
async function readAfter(
	world: RunWorld,
	scenario: Scenario,
	snapshot: ReadonlyMap<string, SemanticBoard>,
): Promise<Reading> {
	const boards = await readVault(world.cli);
	const renders = await sequentially(renderRequests(scenario.outcomes), (request, index) =>
		renderBoard(world.cli, request, path.join(world.paths.renders, `render-${index}.svg`)),
	);
	const inspections = await sequentially(inspectionRequests(scenario.outcomes), (request) =>
		inspectGroup(world.cli, request),
	);
	// Every diagram the scenario declared, as it was finally saved: the harness
	// takes the picture, the author never supplies one.
	const captures = await captureDeclared(world.cli, scenario.captures, world.paths.captures);
	return {
		boards,
		snapshot,
		policy: readPolicy(world.paths.vault),
		diagnostics: await vaultDiagnostics(world.cli),
		renders,
		inspections,
		captures,
	};
}

/**
 * Writes a JSON file in the run directory.
 * @param paths The run.
 * @param name The file's name.
 * @param value What to write.
 */
function writeJson(paths: Pick<RunPaths, "root">, name: string, value: unknown): void {
	fs.writeFileSync(path.join(paths.root, name), `${JSON.stringify(value, null, "\t")}\n`);
}

/**
 * Executes one run. A failure before or during the author is a failed run
 * with its error recorded, never a missing row.
 * @param job The job.
 * @returns The completed run, as also written to the run directory.
 */
async function executeRun(job: RunJob): Promise<CompletedRun> {
	const id = anonymousRunId(job.salt, job.arm, job.scenario.id, job.repetition);
	const startedAt = new Date().toISOString();
	let world: RunWorld | null = null;
	try {
		world = await bringUp(job);
		const install: InstallRecord = await installSkill(
			job.arm,
			world.cli,
			world.paths,
			job.frozenSkill,
		);
		await layFixture(world.cli, job.fixture, world.paths.flask);
		const snapshot = await readVault(world.cli);
		writeBoards(snapshot, world.paths.snapshot);
		const configBefore = readConfigurationText(world.paths.vault);
		const { result, argv } = await runAuthorProcess(job, world);
		const trace = parseTrace(fs.readFileSync(world.paths.authorEvents, "utf8"));
		const commands = classifyCommands(trace.commands, {
			skillRoot: install.skillRoot,
			checkoutRoot: world.paths.flask,
			archboardRoot: job.checkout,
			vault: world.paths.vault,
			exposure: {
				evaluationInputs: path.join(job.checkout, "evals"),
				harnessSource: path.join(job.checkout, "src", "runtime", "skill-evaluation"),
				batchRoot: job.batchRoot,
				runRoot: job.root,
			},
		});
		const guidance = guidanceStanding(
			job.scenario.guidance,
			guidanceFilesRead(trace.commands, { skillRoot: install.skillRoot }),
		);
		const reading = await readAfter(world, job.scenario, snapshot);
		writeBoards(reading.boards, world.paths.boards);
		const completed = assemble(job, id, world, install, {
			result,
			argv,
			trace,
			commands,
			guidance,
			reading,
			configBefore,
			startedAt,
		});
		return completed;
	} catch (error) {
		return await failedRun(job, id, world, error, startedAt);
	} finally {
		await world?.canvas.stop();
	}
}

/** What assemble() has to hand. */
interface Gathered {
	readonly result: ProcessResult;
	readonly argv: readonly string[];
	readonly trace: ReturnType<typeof parseTrace>;
	readonly commands: readonly ClassifiedCommand[];
	readonly guidance: GuidanceStanding;
	readonly reading: Reading;
	readonly configBefore: string;
	readonly startedAt: string;
}

/**
 * Judges a finished author run and writes the run directory.
 * @param job The job.
 * @param id The anonymous id.
 * @param world The world.
 * @param install What was installed.
 * @param gathered What was read.
 * @returns The completed run.
 */
function assemble(
	job: RunJob,
	id: string,
	world: RunWorld,
	install: InstallRecord,
	gathered: Gathered,
): CompletedRun {
	const { result, trace, commands, guidance, reading } = gathered;
	const outcomes = evaluateOutcomes(job.scenario.outcomes, reading);
	const guardrails = evaluateGuardrails(job.scenario.guardrails, {
		snapshot: reading.snapshot,
		boards: reading.boards,
		configBefore: gathered.configBefore,
		configAfter: readConfigurationText(world.paths.vault),
		commands,
		fileChanges: trace.fileChanges,
		vault: world.paths.vault,
	});
	const directWrites = countDirectBoardWrites({
		commands,
		fileChanges: trace.fileChanges,
		vault: world.paths.vault,
	});
	const finalMessage = fs.existsSync(world.paths.lastMessage)
		? fs.readFileSync(world.paths.lastMessage, "utf8")
		: (trace.messages.at(-1) ?? null);
	const run: CompletedRun = {
		arm: job.arm,
		scenario: job.scenario,
		repetition: job.repetition,
		status: statusOf(result, trace.failure),
		exitCode: result.exitCode,
		durationMs: result.durationMs,
		finalMessage,
		usage: trace.usage,
		commands,
		fileChanges: trace.fileChanges,
		boards: reading.boards,
		snapshot: reading.snapshot,
		policy: reading.policy,
		inspections: reading.inspections,
		renders: reading.renders.filter((render) => render.ok),
		captures: reading.captures,
		outcomes,
		guardrails,
		privatePaths: [world.paths.root, install.skillRoot, world.paths.home],
	};
	const author: AuthorRecord = {
		argv: gathered.argv,
		exitCode: result.exitCode,
		timedOut: result.timedOut,
		cancelled: result.cancelled,
		durationMs: result.durationMs,
		threadId: trace.threadId,
		failure: trace.failure,
		events: trace.events,
		malformedLines: trace.malformedLines,
	};
	writeJson(world.paths, "outcomes.json", outcomes);
	writeJson(world.paths, "guardrails.json", guardrails);
	writeJson(world.paths, "commands.json", commands);
	writeJson(world.paths, "file-changes.json", trace.fileChanges);
	writeJson(world.paths, "bundle.json", bundleForGrader(run, id));
	writeJson(world.paths, "run.json", {
		run: id,
		arm: job.arm,
		scenario: job.scenario.id,
		workflow: job.scenario.workflow,
		report: job.scenario.report,
		repetition: job.repetition,
		status: run.status,
		error: null,
		startedAt: gathered.startedAt,
		finishedAt: new Date().toISOString(),
		flask: { revision: job.scenario.flask, commit: world.commit },
		canvas: { url: world.canvas.url, pid: world.canvas.pid },
		codex: {
			executable: job.pins.codex.executable,
			version: job.pins.codex.version,
			...job.pins.codex.author,
		},
		install,
		author,
		usage: run.usage,
		commandCounts: classCounts(commands),
		directWrites,
		exposure: exposureCounts(commands),
		guidance,
		captures: captureSummary(reading.captures),
		outcomesPassed: outcomes.every((verdict) => verdict.passed),
		guardrailsPassed: guardrails.every((verdict) => verdict.passed),
	});
	return run;
}

/**
 * What a failed run can still show: the declared diagrams as the vault holds
 * them at the point of failure, when the canvas is still there to draw them.
 * A capture that cannot be taken is recorded as such, never invented.
 * @param job The job.
 * @param world The world, if it got that far.
 * @returns Every declaration, including why an unavailable capture was not taken.
 */
async function partialCaptures(job: RunJob, world: RunWorld | null): Promise<CaptureAttempt[]> {
	return sequentially(job.scenario.captures, async (declaration) => {
		let detail = "the run failed before its canvas was ready";
		if (job.signal.aborted) detail = "the run was cancelled";
		else if (world !== null) {
			try {
				const [capture] = await captureDeclared(world.cli, [declaration], world.paths.captures);
				if (capture !== undefined) return capture;
			} catch (error) {
				detail = error instanceof Error ? error.message : String(error);
			}
		}
		return {
			...declaration,
			ok: false,
			detail: `not captured after the run failed: ${detail}`,
			tiles: [],
		};
	});
}

/**
 * A run that could not be carried out, written down as such.
 * @param job The job.
 * @param id The anonymous id.
 * @param world The world, if it got that far.
 * @param error What went wrong.
 * @param startedAt When it started.
 * @returns The failed run.
 */
async function failedRun(
	job: RunJob,
	id: string,
	world: RunWorld | null,
	error: unknown,
	startedAt: string,
): Promise<CompletedRun> {
	const message = error instanceof Error ? error.message : String(error);
	const status: RunStatus = job.signal.aborted ? "cancelled" : "failed";
	const captures = await partialCaptures(job, world);
	fs.mkdirSync(job.root, { recursive: true });
	fs.writeFileSync(
		path.join(job.root, "run.json"),
		`${JSON.stringify({ run: id, arm: job.arm, scenario: job.scenario.id, workflow: job.scenario.workflow, report: job.scenario.report, repetition: job.repetition, status, error: message, startedAt, finishedAt: new Date().toISOString(), usage: null, commandCounts: classCounts([]), directWrites: 0, exposure: exposureCounts([]), captures: captureSummary(captures), outcomesPassed: false, guardrailsPassed: false }, null, "\t")}\n`,
	);
	const run: CompletedRun = {
		arm: job.arm,
		scenario: job.scenario,
		repetition: job.repetition,
		status,
		exitCode: null,
		durationMs: 0,
		finalMessage: null,
		usage: null,
		commands: [],
		fileChanges: [],
		boards: new Map(),
		snapshot: new Map(),
		policy: null,
		inspections: [],
		renders: [],
		captures,
		outcomes: [{ check: "run", passed: false, detail: message }],
		guardrails: [],
		privatePaths: world === null ? [job.root] : [world.paths.root, world.paths.home],
	};
	writeJson(job, "bundle.json", bundleForGrader(run, id));
	return run;
}

export { authorArgv, executeRun, statusOf, type RunJob };
