// Checks about the family rather than one variant's content: identity kept
// across the run, versions, variants and their lifecycle, comparison against
// the predecessor, reconciliation, adoption, flows, views and walkthroughs.

import {
	currentVariant,
	findVariant,
	type SemanticBoard,
	type SemanticFlow,
	type SemanticNode,
	type SemanticVariant,
	type SemanticView,
	type VariantContent,
} from "@/shared/semantic-board/index";
import {
	beatReferences,
	beatsOf,
	missingReferences,
	referencesDetail,
	singleBeatStanding,
	walkthroughNamed,
} from "@/runtime/skill-evaluation/lib/beats";
import { fieldOf } from "@/runtime/skill-evaluation/lib/outcomes-board";
import { comparisonStanding } from "@/runtime/skill-evaluation/lib/outcomes-comparison";
import {
	namedSubject,
	namedValue,
	namesMatch,
	variantNamed,
	viewNamed,
} from "@/runtime/skill-evaluation/lib/naming";
import {
	finding,
	isFinding,
	located,
	nodeNamed,
	type Finding,
	type Reading,
} from "@/runtime/skill-evaluation/lib/reading";
import type { OutcomeCheck } from "@/runtime/skill-evaluation/lib/suite";

type Check = (check: OutcomeCheck, reading: Reading) => Finding;
type Located = { readonly board: SemanticBoard; readonly variant: SemanticVariant };

/**
 * Runs a check that needs the board and variant it names.
 * @param check The check.
 * @param reading The reading.
 * @param judge What to conclude once located.
 * @returns The finding.
 */
function onLocated(
	check: OutcomeCheck,
	reading: Reading,
	judge: (at: Located) => Finding,
): Finding {
	const at = located(reading, check.board, check.variant);
	return isFinding(at) ? at : judge(at);
}

/**
 * Runs a check that needs only the board it names.
 * @param check The check.
 * @param reading The reading.
 * @param judge What to conclude from the board.
 * @returns The finding.
 */
function onBoard(
	check: OutcomeCheck,
	reading: Reading,
	judge: (board: SemanticBoard) => Finding,
): Finding {
	const board = namedValue(reading.boards, check.board);
	return board === undefined
		? finding(false, `board "${check.board}" is not in the vault`)
		: judge(board);
}

/**
 * The named variant's content as the fixtures left it.
 * @param reading The reading.
 * @param check The board and variant.
 * @returns The content, or undefined when the snapshot lacks it.
 */
function snapshotContent(reading: Reading, check: OutcomeCheck): VariantContent | undefined {
	const before = namedValue(reading.snapshot, check.board);
	return before === undefined ? undefined : variantNamed(before, check.variant)?.content;
}

/**
 * The id a named node had before the author ran: on the named variant when it
 * was there, else on any variant of the snapshot, since a node restored from a
 * predecessor keeps the id the predecessor gave it.
 * @param reading The reading.
 * @param check The board, variant and node.
 * @returns The id, or undefined when the snapshot never held the name.
 */
function snapshotId(reading: Reading, check: OutcomeCheck): string | undefined {
	const before = namedValue(reading.snapshot, check.board);
	const contents = [
		snapshotContent(reading, check),
		...(before?.variants.map((variant) => variant.content) ?? []),
	];
	return contents
		.map((content) =>
			content === undefined ? undefined : nodeNamed(content, check.node ?? "")?.id,
		)
		.find((id) => id !== undefined);
}

/**
 * Whether a node kept the id the fixtures gave it.
 * @param check The board, variant and node.
 * @param reading The reading.
 * @returns The finding.
 */
const nodeIdRetained: Check = (check, reading) =>
	onLocated(check, reading, (at) => {
		const before = snapshotId(reading, check);
		const after = nodeNamed(at.variant.content, check.node ?? "")?.id;
		if (before === undefined)
			return finding(false, `"${check.node}" was not on the board before the run`);
		return finding(before === after, `"${check.node}" was ${before}, is ${after ?? "gone"}`);
	});

/**
 * The named node as the fixtures left it on the named variant.
 * @param reading The reading.
 * @param check The board, variant and node.
 * @returns The node, or undefined.
 */
function nodeBefore(reading: Reading, check: OutcomeCheck): SemanticNode | undefined {
	const before = snapshotContent(reading, check);
	return before === undefined ? undefined : nodeNamed(before, check.node ?? "");
}

/**
 * Whether a node's listed fields still say what they said before the run.
 * @param check The board, variant, node and fields.
 * @param reading The reading.
 * @returns The finding.
 */
const nodeFieldRetained: Check = (check, reading) =>
	onLocated(check, reading, (at) => {
		const was = nodeBefore(reading, check);
		const now = nodeNamed(at.variant.content, check.node ?? "");
		if (was === undefined || now === undefined)
			return finding(false, `"${check.node}" is missing before or after`);
		const changed = (check.fields ?? []).filter(
			(field) => JSON.stringify(fieldOf(was, field)) !== JSON.stringify(fieldOf(now, field)),
		);
		return finding(
			changed.length === 0,
			changed.length === 0 ? "the fields are as they were" : `changed: ${changed.join(", ")}`,
		);
	});

/**
 * Whether every relationship that existed before still has its id.
 * @param check The board and variant.
 * @param reading The reading.
 * @returns The finding.
 */
const edgeIdsRetained: Check = (check, reading) =>
	onLocated(check, reading, (at) => {
		const wasIds = (snapshotContent(reading, check)?.edges ?? []).map((edge) => edge.id);
		const nowIds = new Set(at.variant.content.edges.map((edge) => edge.id));
		const lost = wasIds.filter((id) => !nowIds.has(id));
		return finding(
			lost.length === 0,
			lost.length === 0
				? `${wasIds.length} relationship ids kept`
				: `relationship ids lost: ${lost.join(", ")}`,
		);
	});

/**
 * How far the board's version moved during the run.
 * @param check The board and the maximum.
 * @param reading The reading.
 * @returns The finding.
 */
const versionAdvancedBy: Check = (check, reading) =>
	onBoard(check, reading, (board) => {
		const moved = board.version - (namedValue(reading.snapshot, check.board)?.version ?? 0);
		const allowed = check.max ?? 0;
		return finding(moved <= allowed, `version moved by ${moved} (allowed ≤ ${allowed})`);
	});

/**
 * Whether the board has the stated level.
 * @param check The board and the level.
 * @param reading The reading.
 * @returns The finding.
 */
const boardLevel: Check = (check, reading) =>
	onBoard(check, reading, (board) =>
		finding(board.level === check.level, `"${check.board}" is at level ${board.level}`),
	);

/**
 * Whether the vault holds exactly the stated number of boards.
 * @param check The expected count.
 * @param reading The reading.
 * @returns The finding.
 */
const boardCount: Check = (check, reading) =>
	finding(reading.boards.size === check.expected, `${reading.boards.size} boards in the vault`);

/**
 * Whether a variant is in the lifecycle a check names, or the check names none.
 * @param variant The variant.
 * @param check The check.
 * @returns True when it matches.
 */
function lifecycleMatches(variant: SemanticVariant, check: OutcomeCheck): boolean {
	return check.lifecycle === undefined || variant.lifecycle === check.lifecycle;
}

/**
 * Whether a variant exists, in the stated lifecycle.
 * @param check The board, variant and lifecycle.
 * @param reading The reading.
 * @returns The finding.
 */
const variantExists: Check = (check, reading) =>
	onBoard(check, reading, (board) => {
		const variant =
			findVariant(board, check.variant ?? "") ??
			namedSubject(board.variants, (candidate) => candidate.name, check.variant);
		return finding(
			variant !== undefined && lifecycleMatches(variant, check),
			`"${check.variant}" is ${variant?.lifecycle ?? "absent"}`,
		);
	});

/**
 * Whether a variant is the one a check names, by id or name.
 * @param variant The variant.
 * @param asked The id or name.
 * @returns True when it is.
 */
function isNamed(variant: SemanticVariant | undefined, asked: string | undefined): boolean {
	return variant !== undefined && (variant.id === asked || namesMatch(variant.name, asked));
}

/**
 * Whether the current variant is the named one.
 * @param check The board and variant.
 * @param reading The reading.
 * @returns The finding.
 */
const currentIs: Check = (check, reading) =>
	onBoard(check, reading, (board) => {
		const current = currentVariant(board);
		return finding(isNamed(current, check.variant), `current is "${current?.name ?? "?"}"`);
	});

/**
 * The current variant's content as JSON, for equality.
 * @param board The board, if any.
 * @returns The JSON text.
 */
function currentJson(board: SemanticBoard | undefined): string {
	return JSON.stringify(board === undefined ? null : currentVariant(board)?.content);
}

/**
 * Whether the current variant's content is byte-for-byte what the fixtures left.
 * @param check The board.
 * @param reading The reading.
 * @returns The finding.
 */
const currentUntouched: Check = (check, reading) =>
	onBoard(check, reading, (board) => {
		const same = currentJson(board) === currentJson(namedValue(reading.snapshot, check.board));
		return finding(
			same,
			same ? "the current variant is unchanged" : "the current variant's content changed",
		);
	});

/**
 * Whether a variant holds no open disagreement.
 * @param check The board and variant.
 * @param reading The reading.
 * @returns The finding.
 */
const reconciliationSettled: Check = (check, reading) =>
	onLocated(check, reading, (at) => {
		const open = at.variant.reconciliation?.issues.length ?? 0;
		return finding(open === 0, `${open} disagreements open on "${check.variant}"`);
	});

/**
 * Whether the board records the stated number of adoptions, with reasons when asked.
 * @param check The board, count and reason requirement.
 * @param reading The reading.
 * @returns The finding.
 */
const adoptionsCount: Check = (check, reading) =>
	onBoard(check, reading, (board) => {
		const adoptions = board.adoptions ?? [];
		const reasons = adoptions.every((adoption) => adoption.reason !== undefined);
		const reasonsOk = check.withReason !== true || reasons;
		return finding(
			adoptions.length === check.expected && reasonsOk,
			`${adoptions.length} adoptions${reasons ? ", each with a reason" : ""}`,
		);
	});

/**
 * Runs a check that needs one named flow.
 * @param check The check.
 * @param reading The reading.
 * @param judge What to conclude from the flow.
 * @returns The finding.
 */
function onFlow(
	check: OutcomeCheck,
	reading: Reading,
	judge: (flow: SemanticFlow) => Finding,
): Finding {
	return onLocated(check, reading, (at) => {
		const flow = namedSubject(at.variant.content.flows, (candidate) => candidate.name, check.flow);
		return flow === undefined ? finding(false, `flow "${check.flow}" is missing`) : judge(flow);
	});
}

/**
 * Whether a flow has enough steps, using every listed message kind.
 * @param check The flow, minimum and kinds.
 * @param reading The reading.
 * @returns The finding.
 */
const flowWithSteps: Check = (check, reading) =>
	onFlow(check, reading, (flow) => {
		const used = new Set<string>(flow.steps.map((step) => step.kind));
		const missing = (check.kinds ?? []).filter((kind) => !used.has(kind));
		const enough = flow.steps.length >= (check.minSteps ?? 1);
		return finding(
			enough && missing.length === 0,
			`${flow.steps.length} steps using ${[...used].join(", ")}${missing.length === 0 ? "" : `; missing ${missing.join(", ")}`}`,
		);
	});

/**
 * Whether some step of a flow repeats enough, with a note when asked.
 * @param check The flow, repeat and note requirement.
 * @param reading The reading.
 * @returns The finding.
 */
const flowStepRepeat: Check = (check, reading) =>
	onFlow(check, reading, (flow) => {
		const least = check.minRepeat ?? 2;
		const repeated = flow.steps.filter(
			(step) => (step.repeat ?? 1) >= least && (check.withNote !== true || step.note !== undefined),
		);
		return finding(
			repeated.length > 0,
			`${repeated.length} steps repeat ≥ ${least}${check.withNote === true ? " with a note" : ""}`,
		);
	});

/**
 * What a view selects, as counts; a view over everything selects nothing by name.
 * @param view The view.
 * @returns Node and edge counts.
 */
function selectionOf(view: SemanticView): { readonly nodes: number; readonly edges: number } {
	return view.scope.kind === "selection"
		? { nodes: view.scope.nodes.length, edges: view.scope.edges.length }
		: { nodes: 0, edges: 0 };
}

/**
 * Whether a view has the grammar and selection shape a check wants.
 * @param view The view.
 * @param check The check.
 * @returns True when it matches.
 */
function viewMatches(view: SemanticView, check: OutcomeCheck): boolean {
	const selection = selectionOf(view);
	const edgesOk = check.edgesSelected === undefined || selection.edges === check.edgesSelected;
	return (
		view.grammar === check.grammar &&
		edgesOk &&
		selection.nodes >= (check.nodesSelectedAtLeast ?? 0)
	);
}

/**
 * Whether a board view exists with the stated grammar and selection shape.
 * @param check The view, grammar and selection sizes.
 * @param reading The reading.
 * @returns The finding.
 */
const viewExists: Check = (check, reading) =>
	onBoard(check, reading, (board) => {
		const view = viewNamed(board, check.view);
		if (view === undefined) return finding(false, `view "${check.view}" is missing`);
		const selection = selectionOf(view);
		return finding(
			viewMatches(view, check),
			`"${check.view}" is ${view.grammar} over ${view.scope.kind} (${selection.nodes} nodes, ${selection.edges} edges)`,
		);
	});

/**
 * Whether the beats reference subjects of every listed kind and every listed
 * name between them, and — when the check states what one beat must hold on
 * its own — whether some single beat does.
 * @param check The walkthrough, kinds, names and single-beat rule.
 * @param reading The reading.
 * @returns The finding.
 */
const walkthroughBeatReferences: Check = (check, reading) =>
	onLocated(check, reading, (at) => {
		const content = at.variant.content;
		const beats = beatsOf(content, check.walkthrough);
		const references = beatReferences(content, beats);
		const missing = missingReferences(references, check);
		const single = singleBeatStanding(content, beats, check.beatSubjectKinds);
		const enough = references.beats >= (check.minBeats ?? 1) && !references.kinds.has("dangling");
		return finding(
			enough && missing.length === 0 && single.held,
			referencesDetail(references, missing, single.detail),
		);
	});

/**
 * Whether a walkthrough kept every beat id it had, in the same order.
 * @param check The board and walkthrough.
 * @param reading The reading.
 * @returns The finding.
 */
const walkthroughBeatsRetained: Check = (check, reading) =>
	onLocated(check, reading, (at) => {
		const was = walkthroughNamed(
			snapshotContent(reading, check)?.walkthroughs ?? [],
			check.walkthrough,
		);
		const now = walkthroughNamed(at.variant.content.walkthroughs, check.walkthrough);
		if (was === undefined || now === undefined)
			return finding(false, `walkthrough "${check.walkthrough}" is missing before or after`);
		const before = was.beats.map((beat) => beat.id).join(",");
		const after = now.beats.map((beat) => beat.id).join(",");
		return finding(
			before === after,
			before === after
				? `${now.beats.length} beat ids kept in order`
				: `beat ids were ${before}, are ${after}`,
		);
	});

const OWNERS: Partial<Record<OutcomeCheck["check"], Check>> = {
	"node-id-retained": nodeIdRetained,
	"node-field-retained": nodeFieldRetained,
	"edge-ids-retained": edgeIdsRetained,
	"version-advanced-by": versionAdvancedBy,
	"board-level": boardLevel,
	"board-count": boardCount,
	"variant-exists": variantExists,
	"current-variant": currentIs,
	"current-untouched": currentUntouched,
	"comparison-standing": comparisonStanding,
	"reconciliation-settled": reconciliationSettled,
	"adoptions-count": adoptionsCount,
	"flow-with-steps": flowWithSteps,
	"flow-step-repeat": flowStepRepeat,
	"view-exists": viewExists,
	"walkthrough-beat-references": walkthroughBeatReferences,
	"walkthrough-beats-retained": walkthroughBeatsRetained,
};

/**
 * The family checks by name.
 * @param check The check.
 * @param reading The reading.
 * @returns The finding, or undefined when this file owns no such check.
 */
function familyCheck(check: OutcomeCheck, reading: Reading): Finding | undefined {
	return OWNERS[check.check]?.(check, reading);
}

export { familyCheck };
