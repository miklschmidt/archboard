// What the deterministic checks read: the vault as it stood after the fixtures
// and as it stands after the author, plus what the harness asked the CLI on
// the checks' behalf. Gathered once per run by the harness; read by pure
// functions, so a check is testable against a board built in memory.

import {
	currentVariant,
	resolveVariant,
	type SemanticBoard,
	type SemanticEdge,
	type SemanticNode,
	type SemanticVariant,
	type VariantContent,
} from "@/shared/semantic-board/index";
import type { SemanticPolicy, VaultDiagnostic } from "@/shared/semantic-policy/index";

/** One render the harness attempted because a check asked for it. */
interface RenderAttempt {
	readonly board: string;
	readonly variant?: string | undefined;
	readonly view?: string | undefined;
	readonly ok: boolean;
	readonly detail: string;
	/** Where the SVG landed, when it did. */
	readonly file?: string | undefined;
}

/** One group inspection the harness ran because a check asked for it. */
interface InspectionAttempt {
	readonly board: string;
	readonly group: string;
	readonly variant?: string | undefined;
	readonly result: InspectedGroup | null;
	readonly detail: string;
}

/** The part of `semantic inspect` a check reads. */
interface InspectedGroup {
	readonly members: readonly { readonly name: string }[];
	readonly internalEdges: readonly unknown[];
	readonly boundaryEdges: readonly { readonly direction: string }[];
	readonly neighbors: readonly { readonly name: string }[];
}

/** Everything a run's checks can see. */
interface Reading {
	/** Every board in the vault after the author ran, by name. */
	readonly boards: ReadonlyMap<string, SemanticBoard>;
	/** Every board as the fixtures left it, before the author ran. */
	readonly snapshot: ReadonlyMap<string, SemanticBoard>;
	/** The vault policy as configured after the run. */
	readonly policy: SemanticPolicy;
	/** What `archboard check` reported after the run. */
	readonly diagnostics: readonly VaultDiagnostic[];
	readonly renders: readonly RenderAttempt[];
	readonly inspections: readonly InspectionAttempt[];
}

/** What one check concluded. */
interface CheckVerdict {
	readonly check: string;
	readonly passed: boolean;
	readonly detail: string;
}

/** A verdict without its check name; the dispatcher adds that. */
type Finding = Omit<CheckVerdict, "check">;

/**
 * The variant a check names, or the current one.
 * @param board The board.
 * @param asked The variant's id or name, when the check names one.
 * @returns The variant, or undefined when the board has no such variant.
 */
function variantOf(board: SemanticBoard, asked?: string): SemanticVariant | undefined {
	return asked === undefined ? currentVariant(board) : resolveVariant(board, asked);
}

/**
 * A node by the name a check uses, on one variant's content.
 * @param content The content.
 * @param name The node's name.
 * @returns The node, or undefined.
 */
function nodeNamed(content: VariantContent, name: string): SemanticNode | undefined {
	return content.nodes.find((node) => node.name === name);
}

/**
 * The edges between two named nodes, in that direction.
 * @param content The content.
 * @param from The source's name.
 * @param to The target's name.
 * @returns Every edge from the one to the other.
 */
function edgesBetween(content: VariantContent, from: string, to: string): SemanticEdge[] {
	const source = nodeNamed(content, from);
	const target = nodeNamed(content, to);
	if (source === undefined || target === undefined) return [];
	return content.edges.filter((edge) => edge.from === source.id && edge.to === target.id);
}

/**
 * One finding: passed with a reason, or failed with one.
 * @param passed Whether the check held.
 * @param detail Why.
 * @returns The finding.
 */
function finding(passed: boolean, detail: string): Finding {
	return { passed, detail };
}

/**
 * Looks a board and variant up for a check, or says which is missing.
 * @param reading The reading.
 * @param board The board's name.
 * @param variant The variant, when named.
 * @returns The content, or a failed finding.
 */
function located(
	reading: Reading,
	board: string | undefined,
	variant: string | undefined,
): { readonly board: SemanticBoard; readonly variant: SemanticVariant } | Finding {
	const found = board === undefined ? undefined : reading.boards.get(board);
	if (found === undefined) return finding(false, `board "${board ?? "?"}" is not in the vault`);
	const chosen = variantOf(found, variant);
	if (chosen === undefined)
		return finding(false, `variant "${variant ?? "current"}" is not on "${board}"`);
	return { board: found, variant: chosen };
}

/**
 * Whether a lookup failed.
 * @param value The lookup's answer.
 * @returns True for a finding.
 */
function isFinding(value: object): value is Finding {
	return "passed" in value;
}

export {
	edgesBetween,
	finding,
	isFinding,
	located,
	nodeNamed,
	variantOf,
	type CheckVerdict,
	type Finding,
	type InspectedGroup,
	type InspectionAttempt,
	type Reading,
	type RenderAttempt,
};
