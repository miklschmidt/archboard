// One board's answer to "draw this variant, in this view".
//
// The Archboard server's render route and a browser drawing from the board it has
// read both answer that question, and they have to answer it identically: the
// same variant chosen for a name, the same view, the same changes read against
// the same variant, the same subjects marked unsettled. So the answer is
// assembled once, here, from the board alone. The caller supplies the board and
// the vault policy it read, and the renderer host it installed; what the answer
// is travels on nothing else (ADR 0023).

import { comparedWith, drawingOf, drawnSubjects } from "@archboard/board/comparison";
import {
	findView,
	scopedContent,
	type ReadingScope,
	type DiagramGrammar,
	type SemanticView,
} from "@archboard/board/views";
import {
	addressedVariant,
	nothingBuilt,
	resolveVariant,
	type SemanticBoard,
	type SemanticVariant,
} from "@archboard/board/document";
import type {
	LayoutEngineName,
	LegendLayout,
	NothingDrawnReason,
	OfferedView,
	SemanticRenderReply,
	StandaloneTheme,
} from "@archboard/board/render-reply";
import type { ToldStanding } from "@archboard/board/reconciliation";
import type { SemanticPolicy } from "@archboard/board/policy";
import type { VariantContent } from "@archboard/board/content";
import type { FlowStep } from "@archboard/board/flow";
import { SemanticRenderError, type SubjectStanding } from "#shared/protocol/render-request.ts";
import { renderSemanticView } from "#shared/rules/render/diagram.ts";

/** What a render of one board asks for. */
interface BoardRenderChoices {
	/** A variant id or name; the board's current variant when absent. */
	readonly variant?: string | undefined;
	/** A view id or name, `Everything` for the whole variant; the overview when absent (ADR 0052). */
	readonly view?: string | undefined;
	/** Whether the picture includes comparison marks and removed context. Defaults to true. */
	readonly comparison?: boolean | undefined;
	/**
	 * A variant id or name to read the drawn variant against, in place of the one it is
	 * ordinarily read against (TASK-478.01). The picture then marks what the drawn variant
	 * adds, changes and removes relative to it, and carries no planned frame.
	 */
	readonly against?: string | undefined;
	/** The theme a document that stands alone is drawn in; absent, it is for a page. */
	readonly theme?: StandaloneTheme | undefined;
	/** Which engine lays the architecture out; the default one when absent (TASK-348). */
	readonly layout?: LayoutEngineName | undefined;
	/**
	 * A title drawn above the picture (TASK-467): these words, or `true` for the
	 * names of what is drawn. None when absent.
	 */
	readonly title?: string | true | undefined;
	/** How the legend is laid out beside the picture (TASK-468); none when absent. */
	readonly legend?: LegendLayout | undefined;
	/** Whether the legend is drawn by itself, without the picture. */
	readonly legendOnly?: boolean | undefined;
}

/**
 * What a variant draws: its parts, relationships and flows. Its walkthroughs
 * are told over the picture and never drawn in it, and the code that a
 * relationship or a step cites is bookkeeping that neither the picture nor a
 * comparison reads (ADR 0046), so neither is here.
 */
type DrawnContent = Pick<VariantContent, "nodes" | "edges" | "flows">;

/**
 * Everything that a picture is drawn from and the board says (TASK-526.02).
 * It leaves out the drawing choices, which the request states, and what a
 * picture does not draw: the board's name and version, its other variants
 * and every walkthrough. A render recipe fingerprints this, so the
 * fingerprint moves when what the picture draws moves, and not when the
 * renderer does. Its shape is part of every recipe already written: a field
 * added here or taken away moves every embed's fingerprint at once.
 */
interface DrawnInput {
	readonly level: string;
	/** The vault's vocabulary as a picture draws it, without the evidence that only the code check reads. */
	readonly policy: unknown;
	/** The view's scope and grammar, the overview's when no view was named. */
	readonly reading: { readonly scope: ReadingScope; readonly grammar: DiagramGrammar };
	readonly drawn: DrawnContent;
	/** The subjects the drawn variant is waiting on, which are drawn with a warning. */
	readonly unsettled: readonly string[];
	/**
	 * The variant it is read against, or null when there is none. The layout
	 * reads it with or without the comparison, so it counts either way.
	 */
	readonly base: DrawnContent | null;
	/** Whether the picture is framed as planned. */
	readonly planned: boolean;
	/** The words drawn above the picture, or null for none. */
	readonly title: string | null;
}

/** Which of the request's names this board does not have. */
interface BoardRenderRefusal {
	readonly ok: false;
	readonly code: "UNKNOWN_VARIANT" | "UNKNOWN_VIEW";
	readonly error: string;
}

/** The answer, or which of the request's names this board does not have. */
type BoardRenderOutcome =
	| { readonly ok: true; readonly reply: SemanticRenderReply }
	| BoardRenderRefusal;

/** The answer and what it was drawn from, or the refusal. */
type BoardDrawing =
	| { readonly ok: true; readonly reply: SemanticRenderReply; readonly input: DrawnInput }
	| BoardRenderRefusal;

/**
 * A view as a reader needs to know it: enough to ask for it again.
 * @param view The view.
 * @returns What the answer carries about it.
 */
function offered(view: SemanticView): OfferedView {
	return { id: view.id, name: view.name, grammar: view.grammar };
}

/**
 * The shared selection and grammar used to read either side of a change.
 * @param view The named view, or nothing for the overview (ADR 0052).
 * @returns What the renderer is asked to explain.
 */
function readingOf(view: SemanticView | undefined): {
	scope: ReadingScope;
	grammar: DiagramGrammar;
} {
	return view ?? { scope: { kind: "overview" }, grammar: "architecture" };
}

/**
 * What a variant is waiting on, as a reader is told it.
 *
 * Everything the standing says except the state it was measured from. That base
 * is a whole second copy of the architecture, kept so a later merge has
 * something to compare against; a reader draws two sentences from this and
 * would be sent the board twice for them.
 * @param variant The variant being drawn.
 * @returns What it is waiting on, or null when it is waiting on nothing.
 */
function toldStanding(variant: SemanticVariant): ToldStanding | null {
	const standing = variant.reconciliation;
	if (standing === undefined) {
		return null;
	}
	const { base: _measuredFrom, ...told } = standing;
	return told;
}

/**
 * The title drawn above a picture: the words asked for, or when asked for
 * without words, the names of what it draws: the board, the view, the
 * variant, and the variant it is compared with when the picture draws the
 * comparison.
 * @param title The words, true for the names, or nothing for no title.
 * @param identity What the answer says was drawn.
 * @param identity.board The board's name.
 * @param identity.view The view, or null for the overview.
 * @param identity.variant The variant.
 * @param identity.changes What the variant is read against, or null.
 * @param comparison Whether the picture draws the comparison.
 * @returns The title, or nothing.
 */
function titleOf(
	title: string | true | undefined,
	identity: Pick<SemanticRenderReply, "board" | "view" | "variant" | "changes">,
	comparison: boolean,
): string | undefined {
	if (title !== true) return title;
	const where =
		identity.view === null ? identity.board : `${identity.board}, view ${identity.view.name}`;
	const against =
		comparison && identity.changes !== null
			? `, compared with ${identity.changes.against.name}`
			: "";
	return `${where}: ${identity.variant.name}${against}`;
}

/**
 * Why a render drew nothing: the variant holds nothing, or the view names
 * nothing of what it holds.
 * @param view The view drawn, or nothing for the overview.
 * @param variant The variant drawn.
 * @param refused The renderer's own refusal.
 * @returns The reason the answer carries.
 */
function emptyReason(
	view: SemanticView | undefined,
	variant: SemanticVariant,
	refused: NothingDrawnReason,
): NothingDrawnReason {
	const held = variant.content.nodes.length > 0 || variant.content.flows.length > 0;
	return view !== undefined && held ? "VIEW_EMPTY_ON_VARIANT" : refused;
}

/**
 * Draw one variant of a board, or say that there is nothing on it yet.
 *
 * An empty board is not an error: it is a board somebody has just made and has
 * not filled in, answered as a success that carries no picture.
 * @param board The board, as read.
 * @param variant The variant to draw.
 * @param view The view to draw, or nothing for the overview.
 * @param against The variant the caller named to read it against, if any.
 * @param how The theme and the vault policy.
 * @param how.theme The theme a document that stands alone is drawn in, when it is one.
 * @param how.policy The vault's presentation policy.
 * @param how.comparison Whether to draw comparison treatment.
 * @param how.layout Which engine lays the architecture out.
 * @param how.title The title drawn above the picture: words, or true for the names of what is drawn.
 * @param how.legend How the legend is laid out beside the picture, if it has one.
 * @param how.legendOnly Whether the legend is drawn without the picture.
 * @returns The answer.
 */
async function drawnReply(
	board: SemanticBoard,
	variant: SemanticVariant,
	view: SemanticView | undefined,
	against: SemanticVariant | undefined,
	how: {
		theme: StandaloneTheme | undefined;
		policy: SemanticPolicy;
		comparison: boolean;
		layout: LayoutEngineName | undefined;
		title: string | true | undefined;
		legend: LegendLayout | undefined;
		legendOnly: boolean | undefined;
	},
): Promise<{ reply: SemanticRenderReply; input: DrawnInput }> {
	const reading = readingOf(view);
	// The comparison restores what the variant lacks of the one it is read against.
	// A picture without the comparison is laid out from the same content and
	// draws only what the variant's own reading of the view holds, so the
	// toggle moves nothing.
	const proposal = drawingOf(board, variant, reading.scope, against);
	// A subject nobody has decided yet is drawn with a warning on it, so a reader
	// looking at the picture rather than the panel still knows not to trust it.
	const waiting = toldStanding(variant);
	const identity = {
		success: true as const,
		board: board.name,
		version: board.version,
		variant: { id: variant.id, name: variant.name, lifecycle: variant.lifecycle },
		view: view === undefined ? null : offered(view),
		views: board.views.map(offered),
		// Null for a variant with nothing to read it against, which is not an empty
		// set of changes: one has nothing to differ from, the other differs in nothing.
		changes: proposal.changes,
		waiting,
	};
	const title = titleOf(how.title, identity, how.comparison);
	const unbuilt = framedAsPlanned(board, against);
	const input = drawnInput(board, variant, against, {
		reading,
		policy: how.policy,
		waiting,
		title,
		planned: unbuilt,
	});
	try {
		const { placed, ...picture } = await renderSemanticView({
			policy: how.policy,
			content: proposal.content,
			...(proposal.changes === null ? {} : { standing: proposal.changes.standing }),
			paintStanding: how.comparison,
			held: scopedContent(variant.content, reading.scope),
			variant: variant.content,
			grammar: reading.grammar,
			theme: how.theme,
			layout: how.layout,
			frame: { title, legend: how.legend, legendOnly: how.legendOnly },
			...(waiting === null ? {} : { unsettled: waiting.issues.map((issue) => issue.subject) }),
			unbuilt,
			level: board.level,
		});
		const reply = {
			...identity,
			changes: changesPlaced(proposal.changes, placed),
			...picture,
			drawn: drawnSubjects(proposal.content, placed),
		};
		return { reply, input };
	} catch (error) {
		if (error instanceof SemanticRenderError) {
			const reply = {
				...identity,
				changes: changesPlaced(proposal.changes, []),
				empty: emptyReason(view, variant, error.code),
			};
			return { reply, input };
		}
		throw error;
	}
}

/**
 * What one picture is drawn from, as the board says it.
 * @param board The board, as read.
 * @param variant The variant to draw.
 * @param against The variant the caller named to read it against, if any.
 * @param drawing What the answer resolved for the picture.
 * @param drawing.reading The view's scope and grammar.
 * @param drawing.policy The vault's presentation policy.
 * @param drawing.waiting What the variant is waiting on, or null.
 * @param drawing.title The words drawn above the picture, if any.
 * @param drawing.planned Whether the picture is framed as planned.
 * @returns The drawn input.
 */
function drawnInput(
	board: SemanticBoard,
	variant: SemanticVariant,
	against: SemanticVariant | undefined,
	drawing: {
		reading: DrawnInput["reading"];
		policy: SemanticPolicy;
		waiting: ToldStanding | null;
		title: string | undefined;
		planned: boolean;
	},
): DrawnInput {
	return {
		level: board.level,
		policy: drawnPolicy(drawing.policy),
		reading: { scope: drawing.reading.scope, grammar: drawing.reading.grammar },
		drawn: drawnContent(variant.content),
		unsettled: drawing.waiting?.issues.map((issue) => issue.subject) ?? [],
		base: drawnBase(board, variant, against),
		planned: drawing.planned,
		title: drawing.title ?? null,
	};
}

/**
 * What a variant draws, without the walkthroughs told over it and the code its
 * relationships and steps cite.
 * @param content The variant's content.
 * @returns Its parts, relationships and flows.
 */
function drawnContent(content: VariantContent): DrawnContent {
	return {
		nodes: content.nodes,
		edges: content.edges.map(({ anchor: _cited, ...edge }) => edge),
		flows: content.flows.map((flow) => ({ ...flow, steps: uncitedSteps(flow.steps) })),
	};
}

/**
 * Steps without the code their messages cite, at every depth.
 * @param steps The steps of a flow, an alternative or a loop.
 * @returns The same steps without anchors.
 */
function uncitedSteps(steps: readonly FlowStep[]): FlowStep[] {
	return steps.map((step) => {
		if (step.kind === "decision") {
			return {
				...step,
				alternatives: step.alternatives.map((one) => ({ ...one, steps: uncitedSteps(one.steps) })),
			};
		}
		if (step.kind === "loop") return { ...step, steps: uncitedSteps(step.steps) };
		const { anchor: _cited, ...message } = step;
		return message;
	});
}

/**
 * What the drawn variant is read against, as `drawingOf` reads it: the variant
 * the caller named, else the one the board reads it against.
 * @param board The board, as read.
 * @param variant The variant to draw.
 * @param against The variant the caller named, if any.
 * @returns What that variant draws, or null when there is none.
 */
function drawnBase(
	board: SemanticBoard,
	variant: SemanticVariant,
	against: SemanticVariant | undefined,
): DrawnContent | null {
	const base = against ?? comparedWith(board, variant);
	return base === undefined ? null : drawnContent(base.content);
}

/**
 * The vault's vocabulary as a picture draws it. The evidence that a
 * relationship kind accepts belongs to the code check, and no picture draws it.
 * @param policy The vault's presentation policy.
 * @returns The policy without relationship evidence.
 */
function drawnPolicy(policy: SemanticPolicy): unknown {
	const relationshipKinds = Object.fromEntries(
		Object.entries(policy.relationshipKinds).map(([kind, { evidence: _checked, ...drawn }]) => [
			kind,
			drawn,
		]),
	);
	return { ...policy, relationshipKinds };
}

/**
 * How the subjects a drawing placed stand: a comparison's standing kept to
 * them. A reading holds more than its grammar draws (a sequence view keeps the
 * relationships between its participants and draws none of them), so a mark
 * is counted, and a subject named, only where the drawing put one (TASK-497).
 * @param standing How every subject of the reading stands.
 * @param placed The subjects the drawing placed, by id.
 * @returns The standing of those alone.
 */
function placedStanding(
	standing: Readonly<Record<string, SubjectStanding>>,
	placed: readonly string[],
): Record<string, SubjectStanding> {
	return Object.fromEntries(
		placed.flatMap((id) => {
			const stands = standing[id];
			return stands === undefined ? [] : [[id, stands]];
		}),
	);
}

/**
 * How a variant differs, as the answer says it: the standing of what the
 * picture placed alone. The reading holds subjects its grammar never draws, and
 * a panel or a receipt that counted them counted a mark nobody could find
 * (TASK-497).
 * @param changes How the reading differs, or null when there is nothing to read it against.
 * @param placed The subjects the drawing placed.
 * @returns The changes of the picture.
 */
function changesPlaced(
	changes: SemanticRenderReply["changes"],
	placed: readonly string[],
): SemanticRenderReply["changes"] {
	return changes === null
		? null
		: { ...changes, standing: placedStanding(changes.standing, placed) };
}

/**
 * Whether a picture is framed as planned: the board has no current variant, and the picture is
 * not relative to a variant that was named. A picture read against a named variant says nothing of
 * whether the board is built, because the variant it is read against may be unbuilt too (ADR 0031).
 * @param board The board, as read.
 * @param against The variant the render was asked to read against, if any.
 * @returns True when the frame is drawn.
 */
function framedAsPlanned(board: SemanticBoard, against: SemanticVariant | undefined): boolean {
	return against === undefined && nothingBuilt(board);
}

/**
 * The variant a render was asked to read against.
 * @param board The board, as read.
 * @param variant The variant to draw.
 * @param named The id or name the request gave, if any.
 * @returns The variant, undefined when none was named, or why the name cannot be used.
 */
function namedAgainst(
	board: SemanticBoard,
	variant: SemanticVariant,
	named: string | undefined,
): SemanticVariant | string | undefined {
	if (named === undefined) return undefined;
	const found = resolveVariant(board, named);
	if (found === undefined) {
		return `board "${board.name}" has no variant "${named}" to read against`;
	}
	return found.id === variant.id
		? `"${variant.name}" cannot be read against itself: name another variant to read it against`
		: found;
}

/**
 * Answer a render of one board: the variant and view it names, drawn.
 * @param board The board, as read.
 * @param choices The variant, view, faces and, for a document that stands alone, theme asked for.
 * @param policy The vault's presentation policy.
 * @returns The answer, or which name the board does not have.
 */
async function renderBoard(
	board: SemanticBoard,
	choices: BoardRenderChoices,
	policy: SemanticPolicy,
): Promise<BoardRenderOutcome> {
	const drawing = await drawBoard(board, choices, policy);
	return drawing.ok ? { ok: true, reply: drawing.reply } : drawing;
}

/**
 * Draw one board as `renderBoard` answers it, and name the input the picture
 * was drawn from, for the recipe of a board render.
 * @param board The board, as read.
 * @param choices The variant, view, faces and, for a document that stands alone, theme asked for.
 * @param policy The vault's presentation policy.
 * @returns The answer and its drawn input, or which name the board does not have.
 */
async function drawBoard(
	board: SemanticBoard,
	choices: BoardRenderChoices,
	policy: SemanticPolicy,
): Promise<BoardDrawing> {
	const addressed = addressedVariant(board, choices.variant);
	if (!addressed.ok) {
		return { ok: false, code: "UNKNOWN_VARIANT", error: addressed.problem };
	}
	const { variant } = addressed;
	const view = choices.view === undefined ? undefined : findView(board, choices.view);
	if (choices.view !== undefined && view === undefined) {
		return {
			ok: false,
			code: "UNKNOWN_VIEW",
			error: `board "${board.name}" has no view called "${choices.view}"`,
		};
	}
	const against = namedAgainst(board, variant, choices.against);
	if (typeof against === "string") {
		return { ok: false, code: "UNKNOWN_VARIANT", error: against };
	}
	const drawn = await drawnReply(board, variant, view, against, {
		theme: choices.theme,
		policy,
		comparison: choices.comparison !== false,
		layout: choices.layout,
		title: choices.title,
		legend: choices.legend,
		legendOnly: choices.legendOnly,
	});
	return { ok: true, ...drawn };
}

export {
	drawBoard,
	renderBoard,
	type BoardDrawing,
	type BoardRenderChoices,
	type BoardRenderOutcome,
	type DrawnInput,
};
