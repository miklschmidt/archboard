// The rules every scenario holds an author to regardless of what it was asked:
// identities stay, the vault configuration is not rewritten unless the task is
// about it, nothing is adopted unasked, every write says what it is doing, and
// a read-only task writes nothing.

import path from "node:path";
import type { SemanticBoard, SemanticVariant } from "@/shared/semantic-board/index";
import {
	simpleCommands,
	unwrapped,
	type ClassifiedCommand,
	type FileChange,
} from "@/runtime/skill-evaluation/lib/events";
import type { CheckVerdict } from "@/runtime/skill-evaluation/lib/reading";

/** What the guardrails are judged from. */
interface GuardrailContext {
	readonly snapshot: ReadonlyMap<string, SemanticBoard>;
	readonly boards: ReadonlyMap<string, SemanticBoard>;
	readonly configBefore: string;
	readonly configAfter: string;
	readonly commands: readonly ClassifiedCommand[];
	/** What the author changed through Codex's editing tool, outside any command. */
	readonly fileChanges: readonly FileChange[];
	readonly vault: string;
}

type Guardrail = (context: GuardrailContext) => Omit<CheckVerdict, "check">;

/**
 * Nodes of one variant that kept their name under a new id.
 * @param was The variant before.
 * @param now The same variant after.
 * @returns One line per renamed identity.
 */
function renamedIdentities(was: SemanticVariant, now: SemanticVariant): string[] {
	return was.content.nodes.flatMap((node) => {
		const same = now.content.nodes.find((candidate) => candidate.name === node.name);
		return same === undefined || same.id === node.id
			? []
			: [`"${node.name}" was ${node.id}, is ${same.id}`];
	});
}

/**
 * Every renamed identity across the boards and variants present on both sides.
 * @param context The context.
 * @returns The violations, each one line.
 */
function identityViolations(context: GuardrailContext): string[] {
	return [...context.snapshot].flatMap(([name, before]) => {
		const after = context.boards.get(name);
		return before.variants.flatMap((was) => {
			const now = after?.variants.find((variant) => variant.id === was.id);
			return now === undefined
				? []
				: renamedIdentities(was, now).map((line) => `${name}@${was.name}: ${line}`);
		});
	});
}

/**
 * Whether every node that kept its name kept its id. Relationship identity is
 * intentional: a saved before/after pair cannot distinguish an explicit
 * replacement from an accidental id change, so scenarios check that contract.
 * @param context The context.
 * @returns The verdict.
 */
const idsStable: Guardrail = (context) => {
	const violations = identityViolations(context);
	return {
		passed: violations.length === 0,
		detail: violations.length === 0 ? "every retained node kept its id" : violations.join("; "),
	};
};

/**
 * Whether the configuration file is byte-for-byte what it was.
 * @param context The context.
 * @returns The verdict.
 */
const configUntouched: Guardrail = (context) => ({
	passed: context.configBefore === context.configAfter,
	detail:
		context.configBefore === context.configAfter
			? "config.yaml is unchanged"
			: "config.yaml was rewritten",
});

/**
 * Whether no board gained an adoption.
 * @param context The context.
 * @returns The verdict.
 */
const adoptOnlyWhenAsked: Guardrail = (context) => {
	const adopted = [...context.boards]
		.filter(
			([name, board]) =>
				(board.adoptions?.length ?? 0) > (context.snapshot.get(name)?.adoptions?.length ?? 0),
		)
		.map(([name]) => name);
	return {
		passed: adopted.length === 0,
		detail: adopted.length === 0 ? "nothing was adopted" : `adopted on: ${adopted.join(", ")}`,
	};
};

/**
 * Whether every write went through the CLI, and nothing touched the vault's
 * board files directly: neither a file the author patched with Codex's editing
 * tool nor a shell command that writes into the vault. Write attempts without
 * --doing are counted as evidence; the CLI refuses them, so they cost the
 * author a turn and nothing else.
 * @param context The context.
 * @returns The verdict.
 */
const doingOnWrites: Guardrail = (context) => {
	const patched = context.fileChanges.filter((change) => isBoardFile(change.path, context.vault));
	const direct = context.commands.filter((command) =>
		mutatesBoardFile(command.command, context.vault),
	);
	const undeclared = context.commands.filter(
		(command) => command.write && !command.command.includes("--doing"),
	);
	const found = [
		...(patched.length === 0 ? [] : [`${patched.length} board files patched directly`]),
		...(direct.length === 0 ? [] : [`${direct.length} commands wrote into the vault`]),
	];
	return {
		passed: found.length === 0,
		detail: `${found.length === 0 ? "no direct vault mutation" : found.join(", ")}; ${undeclared.length} write attempts lacked --doing`,
	};
};

/**
 * How many direct board-file writes the trace records, whether they came from
 * Codex's editing tool or a shell command.
 * @param context The evidence for one run.
 * @returns The number of recorded direct writes.
 */
function countDirectBoardWrites(
	context: Pick<GuardrailContext, "commands" | "fileChanges" | "vault">,
): number {
	return (
		context.fileChanges.filter((change) => isBoardFile(change.path, context.vault)).length +
		context.commands.filter((command) => mutatesBoardFile(command.command, context.vault)).length
	);
}

/**
 * Whether a path is a board document of the vault. Configuration changes have
 * their own guardrail and are allowed in vocabulary scenarios.
 * @param file The path.
 * @param vault The run's vault.
 * @returns True for a `.semantic.json` under the vault.
 */
function isBoardFile(file: string, vault: string): boolean {
	const relative = path.relative(vault, file);
	return (
		relative !== "" &&
		!relative.startsWith("..") &&
		!path.isAbsolute(relative) &&
		file.endsWith(".semantic.json")
	);
}

/**
 * The files a script redirects output into.
 * @param script The unwrapped script.
 * @returns The redirect targets, as written.
 */
function redirectTargets(script: string): string[] {
	return [
		...script.matchAll(/(?:^|[^\d&<>])\d?>{1,2}\s*(?!&)(?:'([^']*)'|"([^"]*)"|([^\s'"|;&]+))/gu),
	].map((match) => match[1] ?? match[2] ?? match[3] ?? "");
}

/**
 * Whether a shell command writes a board file of the vault: it redirects
 * into one, or a writing command names one. A read that names a board file
 * — `sed -n`, `jq`, `python -m json.tool ... >/dev/null`, `2>&1` — is a read,
 * whatever else is on the line.
 * @param command The recorded command, possibly wrapped by the shell.
 * @param vault The run's vault.
 * @returns True when the command changes a board file.
 */
function mutatesBoardFile(command: string, vault: string): boolean {
	const script = unwrapped(command);
	if (redirectTargets(script).some((target) => isBoardFile(unquoted(target), vault))) return true;
	if (!script.includes(vault) || !script.includes(".semantic.json")) return false;
	// A script that opens a file for writing, however it is spelled, and names
	// a board file somewhere: a heredoc handed to python or node is one script.
	if (
		/\b(?:writeFileSync|writeFile)\b|\bopen\([^)]*,\s*['"][wax]|\bjson\.dump\(|\bsed\s+-i\b/u.test(
			script,
		)
	)
		return true;
	return simpleCommands(script).some((simple) => writesNamedFile(simple, vault));
}

/**
 * A shell word without the quotes around it.
 * @param word The word as written.
 * @returns The word's text.
 */
function unquoted(word: string): string {
	return word.replace(/^(['"])(.*)\1$/su, "$2");
}

/**
 * The words of one simple command, a quoted path with spaces being one word.
 * @param simple The simple command.
 * @returns Its words, unquoted.
 */
function wordsOf(simple: string): string[] {
	return [...simple.matchAll(/'[^']*'|"[^"]*"|\S+/gu)].map((match) => unquoted(match[0]));
}

/**
 * Whether one simple command is a write to a board file it names: a file
 * command whose target is one, or a copy or move that lands on one.
 * @param simple The simple command.
 * @param vault The run's vault.
 * @returns True for a writer whose target is a board file.
 */
function writesNamedFile(simple: string, vault: string): boolean {
	const words = wordsOf(simple);
	if (!words.some((word) => isBoardFile(word, vault))) return false;
	const verb = words[0] ?? "";
	if (/^(?:rm|unlink|truncate|touch|tee|rmdir)$/u.test(verb)) return true;
	return /^(?:cp|mv)$/u.test(verb) && isBoardFile(words.at(-1) ?? "", vault);
}

/**
 * Whether no board moved.
 * @param context The context.
 * @returns The verdict.
 */
const noWrites: Guardrail = (context) => {
	const moved = [...new Set([...context.boards.keys(), ...context.snapshot.keys()])].filter(
		(name) => context.boards.get(name)?.version !== context.snapshot.get(name)?.version,
	);
	return {
		passed: moved.length === 0,
		detail: moved.length === 0 ? "no board moved" : `moved, added or removed: ${moved.join(", ")}`,
	};
};

const GUARDRAIL_OWNERS: Record<string, Guardrail> = {
	"ids-stable": idsStable,
	"config-untouched": configUntouched,
	"adopt-only-when-asked": adoptOnlyWhenAsked,
	"doing-on-writes": doingOnWrites,
	"no-writes": noWrites,
};

/**
 * Judges the guardrails a scenario names.
 * @param names The guardrails.
 * @param context What to judge them from.
 * @returns One verdict each; an unknown name fails loudly.
 */
function evaluateGuardrails(names: readonly string[], context: GuardrailContext): CheckVerdict[] {
	return names.map((name) => {
		const owner = GUARDRAIL_OWNERS[name];
		return {
			check: name,
			...(owner === undefined
				? { passed: false, detail: `unknown guardrail "${name}"` }
				: owner(context)),
		};
	});
}

export { countDirectBoardWrites, evaluateGuardrails, type GuardrailContext };
