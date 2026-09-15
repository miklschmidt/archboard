#!/usr/bin/env bun
// The on-demand skill evaluation. Not part of `bun run check`: every author
// run and the grading session call a model, and a human decides when that
// happens. See evals/README.md.
//
//   bun run eval:skill run   [--arm baseline|candidate] [--scenario S01,S02] [--repetitions 3] [--concurrency 3] [--resume <batch-dir>]
//   bun run eval:skill grade <batch-dir> --grader codex|claude [--chunk 6] [--codex <exe>] [--claude <exe>]
//   bun run eval:skill report <batch-dir>
//   bun run eval:skill check            (validates the canonical inputs only; no model)
//   bun run eval:skill pin              (rewrites the version pins from the codex and claude on PATH; no model)

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, InvalidArgumentError } from "commander";
import {
	ARMS,
	GRADER_NAMES,
	executableVersion,
	gradeBatch,
	loadSuite,
	pinVersions,
	resumeSelection,
	runBatch,
	writeReport,
	type Arm,
	type BatchOptions,
	type GraderName,
	type LoadedSuite,
} from "@/runtime/skill-evaluation/index";

/**
 * One arm as typed, refused when it is not one.
 * @param text The text.
 * @returns The arm.
 */
function chosenArm(text: string): Arm {
	const arm = ARMS.find((candidate) => candidate === text);
	if (arm === undefined)
		throw new InvalidArgumentError(`unknown arm "${text}"; use baseline or candidate`);
	return arm;
}

/**
 * One grader name as typed, refused when it is not one.
 * @param text The text.
 * @returns The grader.
 */
function chosenGrader(text: string): GraderName {
	const name = GRADER_NAMES.find((candidate) => candidate === text);
	if (name === undefined)
		throw new InvalidArgumentError(`unknown grader "${text}"; use ${GRADER_NAMES.join(" or ")}`);
	return name;
}

/**
 * The executable to grade with: the one named for the chosen grader, else
 * the grader's own name found on PATH.
 * @param grader The grader.
 * @param named The executables named on the command line.
 * @returns The executable.
 */
function graderExecutable(grader: GraderName, named: GradeOptions): string {
	const explicit = named[grader];
	if (explicit !== undefined) return explicit;
	const found = onPath(grader);
	if (found === null)
		throw new Error(`no ${grader} on PATH; name one with --${grader} <executable>`);
	return found;
}

/**
 * An executable found on PATH.
 * @param name The executable name.
 * @returns Its path, or null when absent.
 */
function onPath(name: string): string | null {
	return Bun.which(name);
}

const checkout = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(checkout, ".skill-evals");

/**
 * A comma-separated list with no empty entries.
 * @param text The option value.
 * @returns Its entries.
 */
function commaSeparated(text: string): string[] {
	const values = text.split(",").map((value) => value.trim());
	if (values.length === 0 || values.some((value) => value === ""))
		throw new InvalidArgumentError("must be a comma-separated list with no empty entries");
	return values;
}

/**
 * A comma-separated selection of evaluation arms.
 * @param text The option value.
 * @returns The arms.
 */
function selectedArms(text: string): Arm[] {
	return commaSeparated(text).map(chosenArm);
}

/**
 * A positive integer option.
 * @param text The option value.
 * @returns The integer.
 */
function positiveInteger(text: string): number {
	const value = Number(text);
	if (!Number.isSafeInteger(value) || value < 1)
		throw new InvalidArgumentError("must be a positive integer");
	return value;
}

/**
 * A controller aborted by SIGINT or SIGTERM, so every owned process stops.
 * @returns The controller.
 */
function cancellation(): AbortController {
	const controller = new AbortController();
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.on(signal, () => {
			console.error(`\n${signal}: stopping every owned process`);
			controller.abort();
		});
	}
	return controller;
}

/**
 * The validated canonical evaluation inputs.
 * @returns The complete suite.
 */
const loadedSuite = () => loadSuite(join(checkout, "evals"));
/**
 * Prints one progress line to stderr.
 * @param line The line.
 */
const log = (line: string): void => {
	console.error(`[${new Date().toISOString()}] ${line}`);
};

interface RunOptions {
	readonly arm?: Arm[] | undefined;
	readonly scenario?: string[] | undefined;
	readonly repetitions?: number | undefined;
	readonly concurrency?: number | undefined;
	readonly resume?: string | undefined;
	readonly codex?: string | undefined;
}

interface GradeOptions {
	readonly chunk?: number | undefined;
	readonly grader: GraderName;
	readonly codex?: string | undefined;
	readonly claude?: string | undefined;
}

/**
 * Prefer an explicit value, then a resumed batch's value, then the default.
 * @param explicit The command-line selection.
 * @param saved The selection retained by the batch.
 * @param fallback The new-batch default.
 * @returns The selected value.
 */
function selected<T>(explicit: T | undefined, saved: T | undefined, fallback: T): T {
	if (explicit !== undefined) return explicit;
	return saved ?? fallback;
}

/**
 * Resolve a run's job selection, retaining immutable choices when resuming.
 * @param options The parsed command line.
 * @param loaded The canonical suite.
 * @returns The batch options controlled by the command line.
 */
function runSelection(
	options: RunOptions,
	loaded: LoadedSuite,
): Pick<
	BatchOptions,
	"arms" | "scenarios" | "repetitions" | "concurrency" | "codexExecutable" | "resume"
> {
	const resume = options.resume === undefined ? undefined : resolve(options.resume);
	const saved = resume === undefined ? undefined : resumeSelection(resume);
	const inherited = saved ?? {
		arms: undefined,
		scenarios: undefined,
		repetitions: undefined,
		codexExecutable: undefined,
	};
	return {
		arms: selected(options.arm, inherited.arms, [...ARMS]),
		scenarios: selected(
			options.scenario,
			inherited.scenarios,
			loaded.suite.evals.map((scenario) => scenario.id),
		),
		repetitions: selected(options.repetitions, inherited.repetitions, loaded.pins.repetitions),
		concurrency: options.concurrency ?? loaded.pins.defaultConcurrency,
		codexExecutable: selected(
			options.codex,
			inherited.codexExecutable,
			loaded.pins.codex.executable,
		),
		resume,
	};
}

const program = new Command()
	.name("bun run eval:skill")
	.description("Run and report the on-demand archboard skill evaluation")
	.showHelpAfterError()
	.action(() => program.outputHelp());

program
	.command("check")
	.description("Validate the canonical inputs without calling a model")
	.action(() => {
		const loaded = loadedSuite();
		console.log(
			`suite ok: ${loaded.suite.evals.length} scenarios, ${loaded.fixtures.size} fixtures, ${loaded.coverage.parts.length} coverage parts`,
		);
	});

program
	.command("run")
	.description("Run selected or all author scenarios")
	.option("--arm <arms>", "comma-separated baseline or candidate arms", selectedArms)
	.option("--scenario <ids>", "comma-separated scenario ids", commaSeparated)
	.option("--repetitions <count>", "runs per scenario and arm", positiveInteger)
	.option("--concurrency <count>", "maximum parallel author runs", positiveInteger)
	.option("--resume <batch-dir>", "resume an existing batch")
	.option("--codex <executable>", "Codex executable matching the pinned version")
	.action(async (options: RunOptions) => {
		const loaded = loadedSuite();
		const batch = await runBatch({
			loaded,
			checkout,
			output,
			...runSelection(options, loaded),
			signal: cancellation().signal,
			log,
		});
		console.log(
			`batch ${batch.root}: ${batch.runs.length} runs, ${batch.runs.filter((run) => run.status === "completed").length} completed`,
		);
	});

program
	.command("grade")
	.description("Grade every run the chosen grader has not graded yet, in one shared session")
	.argument("<batch-dir>", "batch directory")
	.requiredOption(
		"--grader <name>",
		`which grader runs: ${GRADER_NAMES.join(" or ")}`,
		chosenGrader,
	)
	.option("--chunk <count>", "runs per grading call", positiveInteger, 6)
	.option("--codex <executable>", "Codex executable matching graders.json; default: codex on PATH")
	.option(
		"--claude <executable>",
		"Claude executable matching graders.json; default: claude on PATH",
	)
	.action(async (batchDirectory: string, options: GradeOptions) => {
		const loaded = loadedSuite();
		const batchRoot = resolve(batchDirectory);
		const graded = await gradeBatch({
			batchRoot,
			checkout,
			cache: join(output, "cache", "flask.git"),
			loaded,
			chunkSize: options.chunk ?? 6,
			grader: options.grader,
			executable: graderExecutable(options.grader, options),
			signal: cancellation().signal,
			log,
		});
		console.log(
			`${options.grader} grading session ${graded.session.threadId ?? "(none)"}: ${graded.session.calls.length} calls; usage ${JSON.stringify(graded.usage)}`,
		);
	});

program
	.command("pin")
	.description("Rewrite the executable version pins from the codex and claude on PATH")
	.action(async () => {
		const changes = await pinVersions(join(checkout, "evals"), {
			locate: onPath,
			versionOf: executableVersion,
		});
		for (const change of changes) {
			const outcome =
				change.from === change.to
					? `unchanged at ${change.to}`
					: `${change.from} -> ${change.to}${change.startsNewBaseline ? " (starts a new baseline)" : ""}`;
			console.log(`${change.file} ${change.key} (${change.executable}): ${outcome}`);
		}
	});

program
	.command("report")
	.description("Write reports from a completed and graded batch")
	.argument("<batch-dir>", "batch directory")
	.action((batchDirectory: string) => {
		const written = writeReport(resolve(batchDirectory), loadedSuite());
		console.log(`wrote ${written.markdown} and ${written.json}`);
	});

await program.parseAsync(process.argv);
