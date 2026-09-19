// How the harness reads what an author ran: each command's class (reading the
// skill, asking for help, running the CLI, reading Flask, reading the archboard
// product itself), whether it is a write, and whether it reached for material
// it was being measured against.

import path from "node:path";
import type { CommandRecord } from "@/runtime/skill-evaluation/lib/events";
import { reachesBatchOutsideWorld, shellWords } from "@/runtime/skill-evaluation/lib/other-run";

type CommandClass =
	| "discovery"
	| "operation"
	| "code-investigation"
	| "product-source"
	| "setup"
	| "ambiguous";

/**
 * Material an author must not read: the scenario definitions, fixtures, rubric
 * and coverage it is being measured against; the harness's own source; either
 * arm's skill package as the checkout holds it; and the batch tree outside the
 * run's own world — another run, the blinding table, the batch manifest, or
 * the harness's records of this very run.
 */
type ExposureKind = "evaluation-inputs" | "harness-source" | "skill-package" | "other-run";

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
	/**
	 * Both arms' skill packages as the checkout holds them. The skill an author
	 * is given is installed in its own world; a package read here is the
	 * material under comparison, read past the install.
	 */
	readonly skillPackages: readonly string[];
	/** The batch every run of this comparison lives under. */
	readonly batchRoot: string;
	/**
	 * This run's own world, the only part of the batch tree it may read: its
	 * Flask checkout, its vault, its home. The harness's records of the run sit
	 * outside it, and reaching them is exposure like reaching another run's.
	 */
	readonly world: string;
	/**
	 * Whether a path in the batch tree exists. A command naming a literal path
	 * that exists nowhere read nothing, however it was spelled: an author that
	 * mis-expands a skill-root alias names a path beside its own world and gets
	 * "No such file or directory" back.
	 */
	readonly exists: (file: string) => boolean;
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

/** A shell option that takes the script from the next argument: `-c`, `-lc`, `-ic`. */
const SCRIPT_OPTION_RE = /^-[A-Za-z]*c[A-Za-z]*$/u;

/**
 * The script a recorded `bash -lc`, `sh -c` or `zsh -c` command hands its
 * shell, as the shell receives it: the argument after the option holding `c`,
 * with its quoting and escapes undone. A command that is not such a call, or
 * that goes on past the script, is read as recorded, less any outer quotes.
 * @param command The command as recorded.
 * @returns The inner script.
 */
function unwrapped(command: string): string {
	return (
		shellScript(shellWords(command.trim()).map((word) => word.value)) ??
		command.trim().replace(/^(['"])(.*)\1$/su, "$2")
	).trim();
}

/**
 * The script argument of a shell call, if the words are one.
 * @param words The command's words as the shell passes them.
 * @returns The word after the shell's option holding `c` when it is the last word, or undefined.
 */
function shellScript(words: readonly string[]): string | undefined {
	const [shell, ...options] = words;
	if (shell === undefined || !/^(?:.*\/)?(?:ba|z)?sh$/u.test(shell)) return undefined;
	const at = options.findIndex(
		(option) => !option.startsWith("-") || SCRIPT_OPTION_RE.test(option),
	);
	// Only a script that ends the command: words after it are arguments to it
	// or further commands, and the recorded text read whole keeps them.
	if (!SCRIPT_OPTION_RE.test(options[at] ?? "") || options.length !== at + 2) return undefined;
	return options[at + 1];
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
 *
 * The batch tree lives under the checkout, so a run reading its own vault,
 * snapshot or Flask checkout names the checkout without reading a line of the
 * product: a mention that continues into the batch root is not this.
 * @param script The command.
 * @param context Where the run happened.
 * @returns True when it does.
 */
function readsProductSource(script: string, context: ClassificationContext): boolean {
	return (
		INVESTIGATION_RE.test(script) &&
		(namesCheckoutOutsideBatch(script, context) || PRODUCT_SOURCE_RE.test(script))
	);
}

/**
 * Whether a script names the archboard checkout somewhere other than the batch
 * tree the run itself lives in.
 * @param script The command.
 * @param context Where the run happened.
 * @returns True when it names the checkout outside the batch.
 */
function namesCheckoutOutsideBatch(script: string, context: ClassificationContext): boolean {
	const root = context.archboardRoot;
	if (root === undefined) return false;
	const batchRoot = context.exposure?.batchRoot;
	for (let at = script.indexOf(root); at >= 0; at = script.indexOf(root, at + root.length)) {
		if (batchRoot === undefined || !startsWithPath(script, at, batchRoot)) return true;
	}
	return false;
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
 * Whether a script names either arm's skill package in the checkout, rather
 * than the one installed in the run's own world.
 * @param script The unwrapped script.
 * @param roots Where the packages live.
 * @returns True when it names one.
 */
function reachesSkillPackage(script: string, roots: ExposureRoots): boolean {
	return roots.skillPackages.some((packageRoot) => script.includes(packageRoot));
}

/**
 * Whether the text at a position begins with a path, rather than with a longer
 * name that merely starts the same way.
 * @param text The script.
 * @param at Where to look.
 * @param root The path.
 * @returns True when the path is what stands there.
 */
function startsWithPath(text: string, at: number, root: string): boolean {
	if (!text.startsWith(root, at)) return false;
	const next = text[at + root.length];
	return next === undefined || next === "/" || !/[\w.-]/u.test(next);
}

/**
 * Finds canonical inputs, harness source, a skill package or the batch tree
 * outside the run's world named by a script.
 * @param script The unwrapped script.
 * @param output What the command printed, which can show a path read nothing.
 * @param context Where the run happened.
 * @returns The kind of exposure, or null.
 */
function exposureOf(
	script: string,
	output: string,
	context: ClassificationContext,
): ExposureKind | null {
	const roots = context.exposure;
	if (roots === undefined) return null;
	const reached: readonly [ExposureKind, boolean][] = [
		[
			"evaluation-inputs",
			script.includes(roots.evaluationInputs) || EVALUATION_INPUT_RE.test(script),
		],
		["harness-source", script.includes(roots.harnessSource) || HARNESS_SOURCE_RE.test(script)],
		["skill-package", reachesSkillPackage(script, roots)],
		["other-run", reachesBatchOutsideWorld(script, output, roots, context.checkoutRoot)],
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
			exposure: exposureOf(script, record.output, context),
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
		"skill-package": 0,
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
 * How a run stands against the guidance its scenario names. A file the arm's
 * installed skill does not ship is not expected of it: the frozen baseline
 * can predate a recipe the candidate added, and a run cannot skip what it
 * could not read.
 * @param expected The files the scenario names, relative to the skill root.
 * @param read The files the trace read.
 * @param shipped Whether the installed skill holds a file, relative to its root.
 * @returns The standing.
 */
function guidanceStanding(
	expected: readonly string[],
	read: readonly string[],
	shipped: (file: string) => boolean,
): GuidanceStanding {
	const readable = expected.filter(shipped);
	return {
		expected: readable,
		read: [...read],
		missing: readable.filter((file) => !read.includes(file)),
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
