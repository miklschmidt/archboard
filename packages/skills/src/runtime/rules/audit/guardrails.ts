import type { EvaluationArchitecture as EvaluatedDocument } from "#runtime/rules/outcomes/reading.ts";
// The rules every scenario holds an author to regardless of what it was asked:
// identities stay, the vault configuration is not rewritten unless the task is
// about it, nothing is adopted unasked, every write says what it is doing, and
// a read-only task writes nothing.

import path from "node:path";
import type { SemanticVariant } from "@archboard/model/legacy-board";
import {
	checkoutOf,
	namesVault,
	simpleCommands,
	unwrapped,
	type ClassifiedCommand,
} from "#runtime/rules/audit/classify.ts";
import type { FileChange } from "#runtime/protocol/events.ts";
import type { CheckVerdict } from "#runtime/rules/outcomes/reading.ts";

/** What the guardrails are judged from. */
interface GuardrailContext {
	readonly snapshot: ReadonlyMap<string, EvaluatedDocument>;
	readonly documents: ReadonlyMap<string, EvaluatedDocument>;
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
 * Every renamed identity across the documents and variants present on both sides.
 * @param context The context.
 * @returns The violations, each one line.
 */
function identityViolations(context: GuardrailContext): string[] {
	return [...context.snapshot].flatMap(([name, before]) => {
		const after = context.documents.get(name);
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
 * Detect an adoption in canonical authority or an exact retained report.
 * @param document The resulting evaluation evidence.
 * @param before The original evaluation evidence.
 * @returns Whether the run changes the current designation.
 */
function gainedAdoption(
	document: EvaluatedDocument,
	before: EvaluatedDocument | undefined,
): boolean {
	if (document.architecture !== undefined)
		return currentDesignation(document) !== currentDesignation(before);
	return adoptionCount(document) > adoptionCount(before);
}
/**
 * Read the actual canonical designation from evaluation evidence.
 * @param document The optional evaluation record.
 * @returns Its current state identity.
 */
function currentDesignation(document: EvaluatedDocument | undefined) {
	return document?.architecture?.manifest.current?.id;
}
/**
 * Count exact adoptions from a retained historical report.
 * @param document The optional retained report.
 * @returns Its recorded adoption count.
 */
function adoptionCount(document: EvaluatedDocument | undefined): number {
	return document?.adoptions?.length ?? 0;
}

/**
 * Read the revision of canonical evidence or a retained report.
 * @param document The optional evaluation record.
 * @returns Its actual revision or historical version.
 */
function evidenceRevision(document: EvaluatedDocument | undefined) {
	return document?.revision ?? document?.version;
}
/**
 * Whether no document gained an adoption.
 * @param context The context.
 * @returns The verdict.
 */
const adoptOnlyWhenAsked: Guardrail = (context) => {
	const adopted = [...context.documents]
		.filter(([name, document]) => gainedAdoption(document, context.snapshot.get(name)))
		.map(([name]) => name);
	return {
		passed: adopted.length === 0,
		detail: adopted.length === 0 ? "nothing was adopted" : `adopted on: ${adopted.join(", ")}`,
	};
};

/**
 * Whether every write went through the CLI, and nothing touched the vault's
 * document files directly: neither a file the author patched with Codex's editing
 * tool nor a shell command that writes into the vault. Write attempts without
 * --doing are counted as evidence; the CLI refuses them, so they cost the
 * author a turn and nothing else.
 * @param context The context.
 * @returns The verdict.
 */
const doingOnWrites: Guardrail = (context) => {
	const patched = context.fileChanges.filter((change) => isVaultFile(change.path, context.vault));
	const direct = context.commands.filter((command) =>
		mutatesVaultFile(command.command, context.vault),
	);
	const undeclared = context.commands.filter(
		(command) => command.write && !command.command.includes("--doing"),
	);
	const found = [
		...(patched.length === 0 ? [] : [`${patched.length} document files patched directly`]),
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
function countDirectVaultWrites(
	context: Pick<GuardrailContext, "commands" | "fileChanges" | "vault">,
): number {
	return (
		context.fileChanges.filter((change) => isVaultFile(change.path, context.vault)).length +
		context.commands.filter((command) => mutatesVaultFile(command.command, context.vault)).length
	);
}

/**
 * Whether a path is a document document of the vault. Configuration changes have
 * their own guardrail and are allowed in vocabulary scenarios. The vault sits
 * in the checkout the author works in, so a relative path is read from the
 * checkout, or from the vault when the command moved into it.
 * @param file The path.
 * @param vault The run's vault.
 * @param from Where a relative path starts; the checkout when absent.
 * @returns True for a `.semantic.json` under the vault.
 */
function isVaultFile(file: string, vault: string, from = checkoutOf(vault)): boolean {
	const relative = path.relative(vault, path.resolve(from, file));
	return (
		relative !== "" &&
		!relative.startsWith("..") &&
		!path.isAbsolute(relative) &&
		(/\.(?:module|flows|proposal|walkthrough)\.json$/u.test(file) ||
			["model.json", "migration.json", "migration-plan.json", "config.yaml"].includes(
				path.basename(file),
			))
	);
}

/**
 * The files a script redirects output into.
 * @param script The unwrapped script.
 * @returns The redirect targets, as written.
 */
function redirectTargets(script: string): string[] {
	return [
		...script.matchAll(
			/(?:^|[^\d&<>])\d?>{1,2}\s*(?!&)(?:'([^']*)'|"([^"]*)"|((?:\\.|[^\s'"|;&\\])+))/gu,
		),
	].map((match) => match[1] ?? match[2] ?? match[3] ?? "");
}

/**
 * Whether a shell command writes a document file of the vault: it redirects
 * into one, or a writing command names one. A read that names a document file
 * — `sed -n`, `jq`, `python -m json.tool ... >/dev/null`, `2>&1` — is a read,
 * whatever else is on the line. A relative path is read from where the
 * script's `cd`s have moved it by then, starting in the checkout.
 * @param command The recorded command, possibly wrapped by the shell.
 * @param vault The run's vault.
 * @returns True when the command changes a document file.
 */
function mutatesVaultFile(command: string, vault: string): boolean {
	const script = unwrapped(command);
	let from = checkoutOf(vault);
	for (const simple of simpleCommands(script)) {
		const moved = movedTo(simple, from);
		if (moved !== undefined) from = moved;
		else if (writesVaultFile(simple, vault, from)) return true;
	}
	return opensVaultFileForWriting(script, vault);
}

/**
 * Where a `cd` moves a script.
 * @param simple The simple command.
 * @param from Where the script is before it.
 * @returns The directory it moves to, or undefined when it is no `cd` to a directory it names.
 */
function movedTo(simple: string, from: string): string | undefined {
	const [verb, target] = wordsOf(simple);
	return verb === "cd" && target !== undefined ? path.resolve(from, target) : undefined;
}

/**
 * Whether one simple command redirects into a document file or names one as what it writes.
 * @param simple The simple command.
 * @param vault The run's vault.
 * @param from Where a relative path starts.
 * @returns True when it writes a document file.
 */
function writesVaultFile(simple: string, vault: string, from: string): boolean {
	return (
		redirectTargets(simple).some((file) => isVaultFile(unquoted(file), vault, from)) ||
		writesNamedFile(simple, vault, from)
	);
}

/**
 * Whether a script opens a file for writing, however it is spelled, and names
 * a document file somewhere: a heredoc handed to python or node is one script.
 * @param script The unwrapped script.
 * @param vault The run's vault.
 * @returns True when it does.
 */
function opensVaultFileForWriting(script: string, vault: string): boolean {
	return (
		namesVault(script, vault) &&
		/(?:\.(?:semantic|module|flows|proposal|walkthrough)\.json|model\.json|migration\.json)/u.test(
			script,
		) &&
		/\b(?:writeFileSync|writeFile)\b|\bopen\([^)]*,\s*['"][wax]|\bjson\.dump\(|\bsed\s+-i\b/u.test(
			script,
		)
	);
}

/**
 * A shell word as the shell reads it: without the quotes around it, or with
 * each escaped character (a backslash and a space) taken as itself.
 * @param word The word as written.
 * @returns The word's text.
 */
function unquoted(word: string): string {
	const quoted = /^(['"])(.*)\1$/su.exec(word);
	return quoted?.[2] ?? word.replaceAll(/\\(.)/gsu, "$1");
}

/**
 * The words of one simple command, a quoted path with spaces being one word.
 * @param simple The simple command.
 * @returns Its words, unquoted.
 */
function wordsOf(simple: string): string[] {
	return [...simple.matchAll(/'[^']*'|"[^"]*"|(?:\\.|\S)+/gu)].map((match) => unquoted(match[0]));
}

/**
 * Whether one simple command is a write to a document file it names: a file
 * command whose target is one, or a copy or move that lands on one.
 * @param simple The simple command.
 * @param vault The run's vault.
 * @param from Where a relative path starts.
 * @returns True for a writer whose target is a document file.
 */
function writesNamedFile(simple: string, vault: string, from: string): boolean {
	const words = wordsOf(simple);
	if (!words.some((word) => isVaultFile(word, vault, from))) return false;
	const verb = words[0] ?? "";
	if (/^(?:rm|unlink|truncate|touch|tee|rmdir)$/u.test(verb)) return true;
	return /^(?:cp|mv)$/u.test(verb) && isVaultFile(words.at(-1) ?? "", vault, from);
}

/**
 * Whether no document moved.
 * @param context The context.
 * @returns The verdict.
 */
const noWrites: Guardrail = (context) => {
	const moved = [...new Set([...context.documents.keys(), ...context.snapshot.keys()])].filter(
		(name) =>
			evidenceRevision(context.documents.get(name)) !==
			evidenceRevision(context.snapshot.get(name)),
	);
	return {
		passed: moved.length === 0,
		detail:
			moved.length === 0 ? "no document moved" : `moved, added or removed: ${moved.join(", ")}`,
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

export { countDirectVaultWrites, evaluateGuardrails };
