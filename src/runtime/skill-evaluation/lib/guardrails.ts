// The rules every scenario holds an author to regardless of what it was asked:
// identities stay, the vault configuration is not rewritten unless the task is
// about it, nothing is adopted unasked, every write says what it is doing, and
// a read-only task writes nothing.

import type { SemanticBoard, SemanticVariant } from "@/shared/semantic-board/index";
import { unwrapped, type ClassifiedCommand } from "@/runtime/skill-evaluation/lib/events";
import type { CheckVerdict } from "@/runtime/skill-evaluation/lib/reading";

/** What the guardrails are judged from. */
interface GuardrailContext {
	readonly snapshot: ReadonlyMap<string, SemanticBoard>;
	readonly boards: ReadonlyMap<string, SemanticBoard>;
	readonly configBefore: string;
	readonly configAfter: string;
	readonly commands: readonly ClassifiedCommand[];
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
 * Whether every node that kept its name kept its id.
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
 * files directly. Write attempts without --doing are counted as evidence; the
 * CLI refuses them, so they cost the author a turn and nothing else.
 * @param context The context.
 * @returns The verdict.
 */
const doingOnWrites: Guardrail = (context) => {
	const direct = context.commands.filter(
		(command) =>
			command.class !== "operation" &&
			command.command.includes(context.vault) &&
			hasBoardMutationEvidence(command.command),
	);
	const undeclared = context.commands.filter(
		(command) => command.write && !command.command.includes("--doing"),
	);
	return {
		passed: direct.length === 0,
		detail: `${direct.length === 0 ? "no direct vault mutation detected" : `${direct.length} commands require review for direct vault mutation`}; ${undeclared.length} write attempts lacked --doing`,
	};
};

/**
 * Recognize direct mutation evidence without treating an arbitrary read as a write.
 * Configuration changes have their own guardrail and are allowed in vocabulary scenarios.
 * Other ambiguous commands remain in the grader's trace for source-level inspection.
 * @param command The recorded command, possibly wrapped by the shell.
 * @returns Whether the trace supplies evidence of a direct board-file mutation.
 */
function hasBoardMutationEvidence(command: string): boolean {
	const script = unwrapped(command);
	if (script.includes("config.yaml") && !script.includes(".semantic.json")) return false;
	return />|\b(?:rm|mv|cp|tee|touch|truncate|writeFileSync|writeFile|unlink|rmdir)\b|\bsed\s+-i|\bopen\([^)]*,\s*['"][wax]/u.test(
		script,
	);
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

export { evaluateGuardrails, type GuardrailContext };
