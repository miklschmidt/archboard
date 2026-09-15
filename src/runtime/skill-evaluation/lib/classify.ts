// How the harness reads what an author ran: each command's class (reading the
// skill, asking for help, running the CLI, reading Flask, reading the archboard
// product itself), whether it is a write, and whether it reached for material
// it was being measured against.

import path from "node:path";
import type { CommandRecord } from "@/runtime/skill-evaluation/lib/events";

type CommandClass =
	| "discovery"
	| "operation"
	| "code-investigation"
	| "product-source"
	| "setup"
	| "ambiguous";

/**
 * Material an author must not read: the scenario definitions, fixtures, rubric
 * and coverage it is being measured against; the harness's own source; and the
 * private world of another run of the same batch.
 */
type ExposureKind = "evaluation-inputs" | "harness-source" | "other-run";

/** A command with how the harness read it, and why. */
interface ClassifiedCommand extends CommandRecord {
	readonly class: CommandClass;
	readonly rule: string;
	/** True for an archboard write: semantic new, edit, branch, resolve or adopt. */
	readonly write: boolean;
	/** The evaluation material this command reached for, when it reached for any. */
	readonly exposure: ExposureKind | null;
}

/** Where the evaluation material lives, so a command that touches it is seen. */
interface ExposureRoots {
	/** The canonical inputs: evals.json, the fixtures, the rubric, the coverage. */
	readonly evaluationInputs: string;
	/** The harness's source. */
	readonly harnessSource: string;
	/** The batch every run of this comparison lives under. */
	readonly batchRoot: string;
	/** This run's own directory, which it may of course read. */
	readonly runRoot: string;
}

/** What the classifier knows about where the run happened. */
interface ClassificationContext {
	readonly skillRoot: string;
	readonly checkoutRoot: string;
	/** The archboard checkout whose CLI the run used; its source is the product, not documentation. */
	readonly archboardRoot?: string | undefined;
	readonly vault: string;
	/** Absent only in tests of the classes alone; a run always knows its roots. */
	readonly exposure?: ExposureRoots | undefined;
}

/**
 * The command without its `bash -lc` wrapper and outer quotes.
 * @param command The command as recorded.
 * @returns The inner script.
 */
function unwrapped(command: string): string {
	const match = /^(?:\S*\/)?(?:ba|z)?sh\s+-l?c\s+(.*)$/su.exec(command.trim());
	const inner = match?.[1] ?? command;
	return inner.replace(/^(['"])(.*)\1$/su, "$2").trim();
}

const WRITE_RE = /\barchboard\s+semantic\s+(?:new|edit|branch|resolve|adopt)\b/u;
const HELP_RE = /\barchboard\b(?:\s+\S+)*\s+(?:help|--help|-h)\b|\barchboard\s+help\b/u;
/** The harness's own source, by its module name. */
const HARNESS_SOURCE_RE = /\bskill-evaluation\//u;
/** The words that begin a read of evaluation inputs by their canonical names. */
const EVALUATION_INPUT_RE =
	/\bevals\/(?:evals\.json|pins\.json|coverage\.json|rubric\.md|README\.md|fixtures\/S\d{2}\.json)\b/u;
const OPERATION_RE =
	/\barchboard\s+(?:semantic|repo|check|claim|release|start|stop|status|install-skill|browser)\b/u;
const INVESTIGATION_RE =
	/\b(?:rg|grep|cat|sed|head|tail|less|find|ls|tree|python3?|awk|wc|bat|fd|git\s+(?:log|show|grep|ls-files|blame|diff))\b/u;
const SOURCE_RE = /\b(?:src|tests|docs)\/|\.(?:py|rst|toml|cfg|md|txt)\b/u;
/** The archboard product by its module layout, wherever the checkout sits. */
const PRODUCT_SOURCE_RE = /\bsrc\/(?:runtime|cli|server|shared|frontend)\//u;
const SETUP_RE =
	/^(?:cd|export|env|echo|pwd|which|mkdir|true|printf|set|type|command\s+-v|source|\.)\b/u;

/** One classification rule: the first whose test holds decides. */
interface Rule {
	readonly class: CommandClass;
	readonly rule: string;
	readonly test: (script: string, context: ClassificationContext) => boolean;
}

/**
 * Whether a command reads the installed skill.
 * @param script The command.
 * @param context Where the run happened.
 * @returns True when it does.
 */
function readsSkill(script: string, context: ClassificationContext): boolean {
	return script.includes(context.skillRoot) || /skills\/archboard\b/u.test(script);
}

/**
 * Whether a command asks the CLI for help.
 * @param script The command.
 * @returns True when it does.
 */
function asksHelp(script: string): boolean {
	return HELP_RE.test(script);
}

/**
 * Whether a command reads the vault vocabulary.
 * @param script The command.
 * @param context Where the run happened.
 * @returns True when it does.
 */
function readsVocabulary(script: string, context: ClassificationContext): boolean {
	return (
		/\barchboard\s+semantic\s+config\b/u.test(script) ||
		(INVESTIGATION_RE.test(script) &&
			script.includes(context.vault) &&
			/\bconfig\.ya?ml\b/u.test(script))
	);
}

/**
 * Whether a command runs a known archboard command.
 * @param script The command.
 * @returns True when it does.
 */
function runsArchboard(script: string): boolean {
	return OPERATION_RE.test(script);
}

/**
 * Whether a command mentions archboard at all.
 * @param script The command.
 * @returns True when it does.
 */
function mentionsArchboard(script: string): boolean {
	return /\barchboard\b/u.test(script);
}

/**
 * Whether a command reads the checkout.
 * @param script The command.
 * @param context Where the run happened.
 * @returns True when it does.
 */
function readsCheckout(script: string, context: ClassificationContext): boolean {
	return (
		INVESTIGATION_RE.test(script) &&
		(script.includes(context.checkoutRoot) || SOURCE_RE.test(script))
	);
}

/**
 * Whether a command reads the archboard product's source: the checkout whose
 * CLI the run uses, or the product's module layout wherever it sits. The
 * installed skill is matched first and is not this; a read that lands here
 * went past the skill, the generated schemas and `--help` to how the product
 * is built.
 * @param script The command.
 * @param context Where the run happened.
 * @returns True when it does.
 */
function readsProductSource(script: string, context: ClassificationContext): boolean {
	return (
		INVESTIGATION_RE.test(script) &&
		((context.archboardRoot !== undefined && script.includes(context.archboardRoot)) ||
			PRODUCT_SOURCE_RE.test(script))
	);
}

/**
 * Whether a command is shell setup.
 * @param script The command.
 * @returns True when it is.
 */
function isSetup(script: string): boolean {
	return SETUP_RE.test(script);
}

const RULES: readonly Rule[] = [
	{ class: "discovery", rule: "reads the installed skill", test: readsSkill },
	{ class: "discovery", rule: "asks the CLI for help", test: asksHelp },
	{ class: "discovery", rule: "reads the vault vocabulary", test: readsVocabulary },
	{ class: "operation", rule: "runs an archboard command", test: runsArchboard },
	{ class: "product-source", rule: "reads the archboard source", test: readsProductSource },
	{
		class: "ambiguous",
		rule: "mentions archboard outside a known command",
		test: mentionsArchboard,
	},
	{ class: "code-investigation", rule: "reads the checkout", test: readsCheckout },
	{ class: "setup", rule: "shell setup", test: isSetup },
];

/**
 * Splits a script at shell operators and removes leading environment assignments.
 * @param script The unwrapped script.
 * @returns The trimmed simple commands.
 */
function simpleCommands(script: string): string[] {
	return script
		.split(/\s*(?:&&|\|\||[;|\n])\s*/u)
		.map((part) => part.replace(/^(?:\s*[A-Z_][A-Z0-9_]*=(?:'[^']*'|"[^"]*"|\S+)\s+)*/u, "").trim())
		.filter((part) => part !== "");
}

/**
 * Whether a simple command invokes an archboard write without asking for help.
 * @param script The unwrapped script.
 * @returns True for an invocation rather than a textual mention.
 */
function invokesWrite(script: string): boolean {
	return simpleCommands(script).some(
		(command) =>
			/^archboard\s+semantic\s+(?:new|edit|branch|resolve|adopt)\b/u.test(command) &&
			!HELP_RE.test(command),
	);
}

/**
 * Whether a script reaches into a directory another run of the batch owns.
 * @param script The unwrapped script.
 * @param roots Where the batch and this run live.
 * @param cwd The author's working directory.
 * @returns True when it names a run directory that is not this run's.
 */
function reachesAnotherRun(script: string, roots: ExposureRoots, cwd: string): boolean {
	const runs = `${roots.batchRoot}/runs/`;
	let at = script.indexOf(runs);
	while (at >= 0) {
		if (!script.startsWith(roots.runRoot, at)) return true;
		at = script.indexOf(runs, at + runs.length);
	}
	return relativePathWords(script).some((word) => {
		const reached = path.resolve(cwd, word);
		return inside(runs, reached) && !inside(roots.runRoot, reached);
	});
}

/**
 * Finds shell words that explicitly spell a path relative to the author's cwd.
 * @param script The unwrapped shell script.
 * @returns Relative path words without shell quoting.
 */
function relativePathWords(script: string): string[] {
	return [...script.matchAll(/'([^']*)'|"([^"$`]*)"|([^\s'"|;&<>]+)/gu)]
		.map((match) => (match[1] ?? match[2] ?? match[3] ?? "").replaceAll("\\ ", " "))
		.filter((word) => word.startsWith("../") || word.startsWith("./"));
}

/**
 * Tests whether a resolved path is the directory or one of its descendants.
 * @param directory The containing directory.
 * @param target The resolved path to test.
 * @returns True when target is inside directory.
 */
function inside(directory: string, target: string): boolean {
	const relative = path.relative(directory, target);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Finds canonical inputs, harness source or another run named by a script.
 * @param script The unwrapped script.
 * @param context Where the run happened.
 * @returns The kind of exposure, or null.
 */
function exposureOf(script: string, context: ClassificationContext): ExposureKind | null {
	const roots = context.exposure;
	if (roots === undefined) return null;
	const reached: readonly [ExposureKind, boolean][] = [
		[
			"evaluation-inputs",
			script.includes(roots.evaluationInputs) || EVALUATION_INPUT_RE.test(script),
		],
		["harness-source", script.includes(roots.harnessSource) || HARNESS_SOURCE_RE.test(script)],
		["other-run", reachesAnotherRun(script, roots, context.checkoutRoot)],
	];
	return reached.find(([, found]) => found)?.[0] ?? null;
}

/**
 * Every command of a trace, classified with the rule that decided it.
 * @param commands The commands.
 * @param context Where the run happened.
 * @returns The classified commands, in order.
 */
function classifyCommands(
	commands: readonly CommandRecord[],
	context: ClassificationContext,
): ClassifiedCommand[] {
	return commands.map((record) => {
		const script = unwrapped(record.command);
		const decided = RULES.find((rule) => rule.test(script, context));
		return {
			...record,
			class: decided?.class ?? "ambiguous",
			rule: decided?.rule ?? "no rule matched",
			write: WRITE_RE.test(script) && invokesWrite(script),
			exposure: exposureOf(script, context),
		};
	});
}

/**
 * How many commands reached for each kind of evaluation material.
 * @param commands The classified commands.
 * @returns Counts by kind, every kind present.
 */
function exposureCounts(commands: readonly ClassifiedCommand[]): Record<ExposureKind, number> {
	const counts: Record<ExposureKind, number> = {
		"evaluation-inputs": 0,
		"harness-source": 0,
		"other-run": 0,
	};
	for (const command of commands) {
		if (command.exposure !== null) counts[command.exposure] += 1;
	}
	return counts;
}

/**
 * How many commands fell in each class.
 * @param commands The classified commands.
 * @returns Counts by class, every class present.
 */
function classCounts(commands: readonly ClassifiedCommand[]): Record<CommandClass, number> {
	const counts: Record<CommandClass, number> = {
		discovery: 0,
		operation: 0,
		"code-investigation": 0,
		"product-source": 0,
		setup: 0,
		ambiguous: 0,
	};
	for (const command of commands) counts[command.class] += 1;
	return counts;
}

/** Whether a run read the guidance its scenario names: the files, what it read, what it did not. */
interface GuidanceStanding {
	readonly expected: readonly string[];
	readonly read: readonly string[];
	readonly missing: readonly string[];
}

/**
 * The files of the installed skill a trace names, relative to the skill root:
 * a read by absolute path, or by the `skills/archboard/` tail an install keeps.
 * @param commands The commands as recorded.
 * @param context Where the run happened.
 * @returns The relative paths, sorted, each once.
 */
function guidanceFilesRead(
	commands: readonly CommandRecord[],
	context: Pick<ClassificationContext, "skillRoot">,
): string[] {
	const roots = [...new Set([context.skillRoot, "skills/archboard"])].map((root) =>
		root.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"),
	);
	const found = new Set<string>();
	for (const record of commands) {
		const script = unwrapped(record.command);
		for (const root of roots) {
			for (const match of script.matchAll(
				new RegExp(`${root}/([A-Za-z0-9_./-]+\\.(?:md|json))`, "gu"),
			))
				found.add(path.posix.normalize(match[1] ?? ""));
		}
	}
	return [...found].toSorted();
}

/**
 * How a run stands against the guidance its scenario names.
 * @param expected The files the scenario names, relative to the skill root.
 * @param read The files the trace read.
 * @returns The standing.
 */
function guidanceStanding(expected: readonly string[], read: readonly string[]): GuidanceStanding {
	return {
		expected: [...expected],
		read: [...read],
		missing: expected.filter((file) => !read.includes(file)),
	};
}

export {
	classCounts,
	classifyCommands,
	exposureCounts,
	guidanceFilesRead,
	guidanceStanding,
	simpleCommands,
	unwrapped,
	type ClassificationContext,
	type ClassifiedCommand,
	type CommandClass,
	type ExposureKind,
	type ExposureRoots,
	type GuidanceStanding,
};
