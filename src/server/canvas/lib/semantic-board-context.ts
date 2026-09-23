// A semantic board, read as the context an agent is given.
//
// Everything an agent is told about a board comes through here, and everything
// here is meaning: which architectural state is on screen, which of its views,
// which of its subjects somebody picked out, what that state differs from its
// predecessor by, and what it is waiting on. Nothing in this file knows where
// anything was drawn, and there is no way for a coordinate to reach an agent
// through it (ADR 0023).
//
// The pane says what it is reading; this module decides what that means. An id
// the pane reports is resolved against the variant rather than believed: the
// board can have moved on since the picture was drawn, and an id that names
// nothing now is reported as an ambiguity rather than passed on as though an
// agent could act on it.

import {
	compareVariants,
	currentVariant,
	findVariant,
	resolveVariant,
	findView,
	scopedContent,
	subjectsOf,
	type SemanticBoard,
	type SemanticVariant,
	type SubjectKind,
	type VariantContent,
	type VariantComparison,
} from "@/shared/semantic-board/index";
import type {
	SemanticArchitectureInput,
	SemanticDifferenceInput,
	SemanticIssueInput,
	SemanticReconciliationInput,
	SemanticSubjectInput,
} from "@/runtime/codex-semantic-context";
import { parseBoardKey } from "@/runtime/engine/board";
import { semanticBoardAddress } from "@/runtime/semantic-board-store";
import { describeVariant, unbuiltSentence } from "@/server/canvas/lib/semantic-board-description";
import type { SemanticPaneContext } from "@/shared/semantic-pane-context/index";

/** What the board says, and anything about the reading that was not right. */
interface BoardContext {
	readonly architecture: SemanticArchitectureInput;
	readonly description: string;
	/** Things an agent should know were not as the pane reported them. */
	readonly ambiguity: readonly string[];
}

/** One subject of a variant: what kind it is and what it is called. */
interface NamedSubject {
	readonly kind: SubjectKind;
	readonly name: string | null;
}

/**
 * Every subject of a variant, by identity, with the word a person would use
 * for it.
 *
 * Which subjects a variant has, and what kind each one is, comes from the board
 * contract's own enumerator rather than from a second walk written out here: a
 * list of kinds kept in two places is a list that will be missing one the day a
 * kind is added, and this side would then quietly stop seeing it.
 * @param content The variant's content.
 * @returns Each subject's kind and name, by id.
 */
function namedSubjects(content: VariantContent): Map<string, NamedSubject> {
	const labels = labelsById(content);
	const named = new Map<string, NamedSubject>();
	for (const subject of subjectsOf(content)) {
		named.set(subject.id, { kind: subject.kind, name: labels.get(subject.id) ?? null });
	}
	return named;
}

/**
 * What each subject is called, by identity.
 *
 * Only the labels: which subjects a variant has, and what kind each one is, is
 * `subjectsOf`'s answer and is not repeated here. This walk exists because the
 * word a person reads lives in a different field on every kind — a node's
 * `name`, an edge's `label`, a beat's `heading` — and the canonical enumerator
 * does not carry it. If it ever does, this function goes and `namedSubjects`
 * becomes a rename.
 * @param content The variant's content.
 * @returns The label of every subject that has one.
 */
function labelsById(content: VariantContent): Map<string, string> {
	const labels = new Map<string, string>();
	for (const node of content.nodes) {
		labels.set(node.id, node.name);
	}
	for (const edge of content.edges) {
		if (edge.label !== undefined) {
			labels.set(edge.id, edge.label);
		}
	}
	toldLabels(content, labels);
	return labels;
}

/**
 * The labels of the two kinds that hold ordered content of their own.
 * @param content The variant's content.
 * @param labels The labels so far, added to in place.
 */
function toldLabels(content: VariantContent, labels: Map<string, string>): void {
	for (const flow of content.flows) {
		labels.set(flow.id, flow.name);
		for (const step of flow.steps) {
			labels.set(step.id, step.label);
		}
	}
	for (const walkthrough of content.walkthroughs) {
		labels.set(walkthrough.id, walkthrough.name);
		for (const beat of walkthrough.beats) {
			labels.set(beat.id, beat.heading);
		}
	}
}

/** A report that may be resolved against this board, or why it may not be. */
interface ReportAbout {
	readonly report: SemanticPaneContext | null;
	/** Why the report was set aside, in a sentence, or null when it was not. */
	readonly mismatch: string | null;
}

/**
 * Whether the pane's report is about the board being read.
 *
 * A pane moving from one board to another registers on the new one before its
 * first report about it arrives, so for a moment the registry says B and the
 * pane's last report still says A. Resolving A's variant, view and selection
 * against B's document would hand an agent ids from one architecture as though
 * they named subjects of another — and the ids might even resolve, meaning
 * something else entirely. So the check is here, where the resolving happens,
 * rather than only in the caller: anything that resolves a report against a
 * board goes through this function.
 * @param board The board being read.
 * @param pane The pane's report, or null when it has not reported.
 * @returns The report to resolve, or why none may be.
 */
function reportAbout(board: SemanticBoard, pane: SemanticPaneContext | null): ReportAbout {
	if (pane === null) {
		return { report: null, mismatch: null };
	}
	const reported = aggregateOf(pane.board);
	if (reported === semanticBoardAddress(board.name).key) {
		return { report: pane, mismatch: null };
	}
	const said = reported === null ? "no board" : `board "${reported}"`;
	return {
		report: null,
		mismatch:
			`the pane last reported ${said} and this is "${board.name}", so nothing it selected has ` +
			"been resolved: those ids belong to a different architecture",
	};
}

/**
 * The aggregate a spelling addresses, with any variant on it spent.
 *
 * A board and a variant of it are one document, and an address a person types
 * can name both — `payments@proposed`. Everything that keys off a board — the
 * lease, the claim, the note, a pane's context — keys off the aggregate, so a
 * comparison that kept the variant would make two panes on two variants of one
 * board look like panes on two boards.
 *
 * The split is `parseBoardKey`'s, not one of its own: the address grammar has an
 * owner, and a second place that knows where a variant begins is a second place
 * to fix the day the grammar moves.
 * @param spelling A board name or key, with or without a variant.
 * @returns The aggregate's key.
 */
function aggregateKey(spelling: string): string {
	return semanticBoardAddress(parseBoardKey(spelling).board).key;
}

/**
 * The aggregate a report names, whatever spelling it arrived in.
 *
 * A board and a variant of it are one document, and which variant a pane is
 * showing is its own field on the report. But an address a person types can
 * carry both — `payments@proposed` — and a pane that passes its address through
 * as the key would otherwise look like a report about a board called
 * `payments@proposed`, which is not a board at all. Two panes showing two
 * variants of one board are the ordinary case and both are reading it.
 *
 * The name is what the aggregate is resolved from, because the contract says the
 * name is what every command spells the board with. A key that disagrees with
 * its own name is not normalised into agreement: the report says two things and
 * only its author can say which was meant.
 * @param reported The board the pane says it is reading, or null.
 * @returns The aggregate's key, or null when there is none or the report disagrees with itself.
 */
function aggregateOf(reported: SemanticPaneContext["board"]): string | null {
	if (reported === null) {
		return null;
	}
	const fromName = aggregateKey(reported.name);
	// A key carrying a variant is the one disagreement that is not a disagreement:
	// it addresses the same aggregate, and the variant it names is reported
	// separately anyway.
	return fromName === aggregateKey(reported.key) ? fromName : null;
}

/**
 * The variant a pane says it is reading.
 *
 * Only the one it actually names. A pane that has not said is not assumed to be
 * showing the board's current variant: it may be about to draw a proposal, and
 * an agent told "you are looking at the current architecture" would answer a
 * question about the wrong one — with ids that resolve, because a proposal
 * shares its predecessor's identities.
 * @param board The board.
 * @param pane What the pane said it was reading, or null.
 * @returns The variant, or undefined when it named one the board does not have.
 */
function readingVariant(
	board: SemanticBoard,
	pane: SemanticPaneContext | null,
): SemanticVariant | undefined {
	// Nothing on screen is reading it, so the board's own current architecture is
	// what is true of it. That is not a pane's reading and is never described as
	// one: it is the answer to "what does this board say now", which is the
	// question a change on a board nobody is looking at asks. A pane that HAS
	// reported without naming a variant is a different case and stays unresolved
	// — it is about to draw something, and guessing which variant would put words
	// in its mouth.
	if (pane === null) {
		return currentVariant(board);
	}
	const asked = pane.variant?.id ?? null;
	return asked === null ? undefined : findVariant(board, asked);
}

/**
 * The context for a pane that has not said which variant it is showing.
 *
 * Nothing is attributed to the pane, because nothing is known: no variant, no
 * view, no selection, and none of the things derived from them. What the board
 * currently is remains useful and true, so it is offered as information rather
 * than asserted as the reading — the difference between "its current
 * architecture is X" and "this pane is showing X", which is the whole of what
 * this function exists to keep apart.
 * @param board The board.
 * @returns The context.
 */
function notYetDrawn(board: SemanticBoard): BoardContext {
	const current = currentVariant(board);
	const currently =
		current === undefined
			? unbuiltSentence(board)
			: ` Its current architecture is "${current.name}".`;
	return {
		architecture: NOTHING_READ,
		description: `"${board.name}" is open in a pane that has not drawn yet.${currently}`,
		ambiguity: [
			"the pane has not said which variant it is showing, so nothing has been resolved " +
				"against one; do not answer as though it were showing any particular variant until it says",
		],
	};
}

/**
 * The context for a board nothing on screen is reading and nobody has built.
 *
 * Nothing on screen names a variant and there is no current one to describe,
 * so what is true of it is that nothing it describes is built. Which proposal
 * to talk about is for the agent to ask, not for this to pick (ADR 0031).
 * @param board The board.
 * @param mismatch Why a pane's report was set aside, or null.
 * @returns The context.
 */
function unreadAndUnbuilt(board: SemanticBoard, mismatch: string | null): BoardContext {
	return {
		architecture: NOTHING_READ,
		description: `Nothing on screen is reading "${board.name}".${unbuiltSentence(board)}`,
		ambiguity: mismatch === null ? [] : [mismatch],
	};
}

/**
 * What the pane picked out, resolved against the variant it is reading.
 *
 * A stated kind or name is ignored rather than trusted: the board is open here,
 * and a pane that drew a subject before somebody removed it would otherwise
 * have an agent talking about something that is not there.
 * @param pane What the pane said it was reading, or null.
 * @param subjects Every subject of the variant, by id.
 * @returns The selection as the board sees it, and what could not be resolved.
 */
function resolvedSelection(
	pane: SemanticPaneContext | null,
	subjects: ReadonlyMap<string, NamedSubject>,
): { selection: SemanticSubjectInput[]; ambiguity: string[] } {
	const selection: SemanticSubjectInput[] = [];
	const ambiguity: string[] = [];
	for (const picked of pane?.selection ?? []) {
		const found = subjects.get(picked.id);
		if (found === undefined) {
			ambiguity.push(
				`the pane has "${picked.id}" selected and the variant it is reading has no such subject; ` +
					"it was drawn before the board moved",
			);
			continue;
		}
		selection.push({ kind: found.kind, id: picked.id, name: found.name });
	}
	return { selection, ambiguity };
}

/**
 * The view the pane is reading the variant through.
 * @param pane What the pane said it was reading, or null.
 * @param board The board that owns the shared views.
 * @returns The view, or null when the variant is read whole or the view has gone.
 */
function readingView(
	pane: SemanticPaneContext | null,
	board: SemanticBoard,
): SemanticArchitectureInput["view"] {
	const asked = pane?.view?.id ?? null;
	if (asked === null) {
		return null;
	}
	const view = findView(board, asked);
	return view === undefined ? null : { id: view.id, name: view.name, grammar: view.grammar };
}

/**
 * Every subject that differs from the predecessor, with the counts whole.
 *
 * The counts are of the comparison and not of the list: a brief that had to
 * drop half the subjects still says how many there were, because an agent shown
 * a short list with no count would believe it had seen everything.
 * @param comparison The comparison against the predecessor.
 * @param subjects Every subject of this variant, by id, for a name.
 * @param predecessor Every subject of the predecessor, for naming what went.
 * @returns The differences.
 */
function differencesOf(
	comparison: VariantComparison,
	subjects: ReadonlyMap<string, NamedSubject>,
	predecessor: ReadonlyMap<string, NamedSubject>,
): SemanticArchitectureInput["differences"] {
	const changed: SemanticDifferenceInput[] = [];
	const counts = { added: 0, removed: 0, changed: 0 };
	const maps = [
		comparison.nodes,
		comparison.edges,
		comparison.flows,
		comparison.steps,
		comparison.walkthroughs,
		comparison.beats,
	];
	for (const map of maps) {
		for (const [id, change] of map) {
			if (change.kind === "unchanged") {
				continue;
			}
			counts[change.kind] += 1;
			changed.push(differenceOf(id, change.kind, subjects.get(id) ?? predecessor.get(id)));
		}
	}
	return { ...counts, subjects: changed };
}

/**
 * One difference, named from whichever side still holds the subject.
 *
 * A removed subject is only in the baseline and an added one only here, so both
 * maps are asked; a subject neither map knows is drawn as a node, which is the
 * one kind that can hold another and so the safest thing to call an unknown.
 * @param id The subject's identity.
 * @param change How it differs.
 * @param found What it is, from whichever side has it.
 * @returns The difference.
 */
function differenceOf(
	id: string,
	change: "added" | "removed" | "changed",
	found: NamedSubject | undefined,
): SemanticDifferenceInput {
	return { change, kind: found?.kind ?? "node", id, name: found?.name ?? null };
}

/**
 * What this variant is waiting on: whether there is anything, how much, what it
 * is waiting on above it, and the disagreements themselves.
 *
 * The count is stated beside the issues rather than left to be counted off them,
 * because the brief may have to drop the list and a dropped list must not read
 * as an absence. The repair sentences are carried rather than reworded: the same
 * words reach the write answer and the pane, and three descriptions of one
 * disagreement is worse than none.
 * @param variant The variant.
 * @returns What it is waiting on, all zero and empty when it is waiting on nothing.
 */
function waitingOn(variant: SemanticVariant): SemanticReconciliationInput {
	const issues = issuesOf(variant);
	const blockedBy = variant.reconciliation?.blockedBy ?? null;
	return {
		required: issues.length > 0 || blockedBy !== null,
		count: issues.length,
		blockedBy,
		issues,
	};
}

/**
 * The disagreements a variant is holding, in the words the reconciliation wrote.
 * @param variant The variant.
 * @returns The issues, empty when it is waiting on nothing of its own.
 */
function issuesOf(variant: SemanticVariant): SemanticIssueInput[] {
	return (variant.reconciliation?.issues ?? []).map((issue) => ({
		subject: issue.subject,
		what: issue.what,
		kind: issue.kind,
		field: issue.field ?? null,
		repair: issue.repair,
	}));
}

/**
 * Nothing read at all: what a pane is looking at when the board would not open,
 * or when it names a variant the board does not have.
 *
 * Stated once rather than assembled wherever it is needed, because "the agent
 * was told nothing about the architecture" is one fact, and five empty fields
 * written out by hand in two places is two facts that can drift apart.
 */
const NOTHING_READ: SemanticArchitectureInput = Object.freeze({
	variant: null,
	view: null,
	selection: Object.freeze({ count: 0, subjects: [] }),
	differences: null,
	reconciliation: Object.freeze({ required: false, count: 0, blockedBy: null, issues: [] }),
});

/**
 * What a view narrows the variant to, or the whole of it.
 * @param board The board that owns the shared views.
 * @param content The variant's content.
 * @param view The view being read, or null for the whole variant.
 * @returns What is on screen.
 */
function scopedFor(
	board: SemanticBoard,
	content: VariantContent,
	view: SemanticArchitectureInput["view"],
): VariantContent {
	const found = view === null ? undefined : findView(board, view.id);
	return found === undefined ? content : scopedContent(content, found.scope);
}

/**
 * What this variant differs from the one it came from by, or nothing when it
 * came from nothing.
 * @param variant The variant being read.
 * @param predecessor The variant it was derived from, when it has one.
 * @param subjects Every subject of this variant, by id.
 * @returns The differences, or null.
 */
function differencesAgainst(
	variant: SemanticVariant,
	predecessor: SemanticVariant | undefined,
	subjects: ReadonlyMap<string, NamedSubject>,
): SemanticArchitectureInput["differences"] {
	if (predecessor === undefined) {
		return null;
	}
	return differencesOf(
		compareVariants(predecessor.content, variant.content),
		subjects,
		namedSubjects(predecessor.content),
	);
}

/**
 * The variant one variant was derived from, when it was derived from anything.
 * @param board The board.
 * @param variant The variant being read.
 * @returns Its predecessor, or nothing.
 */
function predecessorOf(
	board: SemanticBoard,
	variant: SemanticVariant,
): SemanticVariant | undefined {
	return variant.parent === undefined ? undefined : resolveVariant(board, variant.parent);
}

/**
 * Which architectural state is being read, and what its changes are measured
 * against.
 * @param variant The variant being read.
 * @param predecessor The variant it was derived from, when it has one.
 * @returns The identity.
 */
function identityOf(
	variant: SemanticVariant,
	predecessor: SemanticVariant | undefined,
): SemanticArchitectureInput["variant"] {
	return {
		id: variant.id,
		name: variant.name,
		lifecycle: variant.lifecycle,
		against: predecessor?.id ?? null,
	};
}

/**
 * The context for a pane reading a variant this board does not have.
 *
 * Which happens when the board moved under the pane. It is reported rather than
 * quietly answered about some other variant, because every id an agent would
 * then be handed would be about a different architecture.
 * @param board The board.
 * @param asked The variant the pane named.
 * @returns The context.
 */
function noSuchVariant(board: SemanticBoard, asked: string): BoardContext {
	return {
		architecture: NOTHING_READ,
		description: `"${board.name}" has no variant called "${asked}".`,
		ambiguity: [`the pane is reading a variant "${asked}" that "${board.name}" does not have`],
	};
}

/**
 * The context for a pane whose reading could not be resolved: it has not said
 * which variant it is showing, or it named one the board does not have.
 * @param board The board.
 * @param about The report that may be resolved against it, and why it may not be.
 * @returns The context.
 */
function unresolved(board: SemanticBoard, about: ReportAbout): BoardContext {
	const asked = about.report?.variant?.id ?? null;
	if (asked !== null) {
		return noSuchVariant(board, asked);
	}
	// A report set aside leaves no report, and with none only a board that has
	// no current variant is unresolved.
	return about.report === null ? unreadAndUnbuilt(board, about.mismatch) : notYetDrawn(board);
}

/**
 * What one board means, as one pane is reading it.
 * @param board The board as it stands on disk.
 * @param pane What the pane said it was reading, or null when it has not said.
 * @returns The architecture, a description of it, and anything that did not resolve.
 */
function semanticBoardContext(
	board: SemanticBoard,
	pane: SemanticPaneContext | null,
): BoardContext {
	// A report about another board contributes nothing, but the board itself is
	// still real: the agent is being asked about this one, so it is told what this
	// one currently is, with nothing attributed to a pane that was looking
	// elsewhere.
	const about = reportAbout(board, pane);
	const variant = readingVariant(board, about.report);
	if (variant === undefined) {
		return unresolved(board, about);
	}
	const view = readingView(about.report, board);
	const subjects = namedSubjects(variant.content);
	// No report, no selection: what a person pointed at in one architecture is
	// not a fact about another, and a context that borrowed one would have an
	// agent talking about something nobody had picked out.
	const picked = resolvedSelection(about.report, subjects);
	const predecessor = predecessorOf(board, variant);
	const shown = scopedFor(board, variant.content, view);
	return {
		architecture: {
			variant: identityOf(variant, predecessor),
			view,
			selection: { count: picked.selection.length, subjects: picked.selection },
			differences: differencesAgainst(variant, predecessor, subjects),
			reconciliation: waitingOn(variant),
		},
		description:
			about.report === null
				? `Nothing on screen is reading "${board.name}". ${describeVariant(variant, shown, view !== null)}`
				: `${describeVariant(variant, shown, view !== null)}${unbuiltSentence(board)}`,
		ambiguity: about.mismatch === null ? picked.ambiguity : [...picked.ambiguity, about.mismatch],
	};
}

export { type BoardContext, NOTHING_READ, aggregateKey, semanticBoardContext };
