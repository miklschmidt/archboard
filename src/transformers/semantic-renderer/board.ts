// One board's answer to "draw this variant, in this view, on this ground".
//
// The canvas server's render route and a browser drawing from the board it has
// read both answer that question, and they have to answer it identically: the
// same variant chosen for a name, the same view, the same changes read against
// the same predecessor, the same subjects marked unsettled. So the answer is
// assembled once, here, from the board alone. The caller supplies the board and
// the vault policy it read, and the renderer host it installed; what the answer
// is travels on nothing else (ADR 0023).

import {
	drawingOf,
	findView,
	resolveVariant,
	scopedContent,
	type DrawnProposal,
	type DiagramGrammar,
	type DiagramTheme,
	type FontSource,
	type OfferedView,
	type SemanticBoard,
	type SemanticRenderReply,
	type SemanticVariant,
	type SemanticView,
	type ToldStanding,
	type ViewScope,
} from "@/shared/semantic-board/index";
import type { SemanticPolicy } from "@/shared/semantic-policy/index";
import { SemanticRenderError, renderSemanticView } from "@/transformers/semantic-renderer/index";

/** What a render of one board asks for. */
interface BoardRenderChoices {
	/** A variant id or name; the board's current variant when absent. */
	readonly variant?: string | undefined;
	/** A view id or name; the whole variant when absent. */
	readonly view?: string | undefined;
	/** Whether the picture includes comparison marks and removed context. Defaults to true. */
	readonly comparison?: boolean | undefined;
	readonly theme: DiagramTheme;
	readonly fonts: FontSource;
}

/** The answer, or which of the request's names this board does not have. */
type BoardRenderOutcome =
	| { readonly ok: true; readonly reply: SemanticRenderReply }
	| {
			readonly ok: false;
			readonly code: "UNKNOWN_VARIANT" | "UNKNOWN_VIEW";
			readonly error: string;
	  };

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
 * @param view The named view, or nothing for the whole architecture.
 * @returns What the renderer is asked to explain.
 */
function readingOf(view: SemanticView | undefined): { scope: ViewScope; grammar: DiagramGrammar } {
	return view ?? { scope: { kind: "all" }, grammar: "architecture" };
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
 * Choose the picture's content and marks while retaining the proposal's change report.
 * @param proposal The compared drawing.
 * @param variant The variant itself.
 * @param scope The view being read.
 * @param comparison Whether comparison treatment is visible.
 * @returns The inputs that differ between a compared and a clean picture.
 */
function pictureOf(
	proposal: DrawnProposal,
	variant: SemanticVariant,
	scope: ViewScope,
	comparison: boolean,
) {
	if (!comparison) {
		return { content: scopedContent(variant.content, scope) };
	}
	return {
		content: proposal.content,
		...(proposal.changes === null ? {} : { standing: proposal.changes.standing }),
	};
}

/**
 * Draw one variant of a board, or say that there is nothing on it yet.
 *
 * An empty board is not an error: it is a board somebody has just made and has
 * not filled in, answered as a success that carries no picture.
 * @param board The board, as read.
 * @param variant The variant to draw.
 * @param view The view to draw, or nothing for the whole variant.
 * @param how The ground, the faces and the vault policy.
 * @param how.theme Which colour scheme to draw for.
 * @param how.fonts Where the drawn faces come from.
 * @param how.policy The vault's presentation policy.
 * @param how.comparison Whether to draw comparison treatment.
 * @returns The answer.
 */
async function drawnReply(
	board: SemanticBoard,
	variant: SemanticVariant,
	view: SemanticView | undefined,
	how: { theme: DiagramTheme; fonts: FontSource; policy: SemanticPolicy; comparison: boolean },
): Promise<SemanticRenderReply> {
	const reading = readingOf(view);
	// The comparison restores what a change took away from the predecessor;
	// a clean reading below draws only the variant's own content.
	const proposal = drawingOf(board, variant, reading.scope);
	// A subject nobody has decided yet is drawn with a warning on it, so a reader
	// looking at the picture rather than the panel still knows not to trust it.
	const waiting = toldStanding(variant);
	const identity = {
		success: true as const,
		board: board.name,
		version: board.version,
		variant: { id: variant.id, name: variant.name, lifecycle: variant.lifecycle },
		theme: how.theme,
		view: view === undefined ? null : offered(view),
		views: board.views.map(offered),
		// Null for a variant with no predecessor, which is not an empty set of
		// changes: one has nothing to have changed, the other changed nothing.
		changes: proposal.changes,
		waiting,
	};
	try {
		const picture = await renderSemanticView({
			policy: how.policy,
			...pictureOf(proposal, variant, reading.scope, how.comparison),
			grammar: reading.grammar,
			theme: how.theme,
			fonts: how.fonts,
			...(waiting === null ? {} : { unsettled: waiting.issues.map((issue) => issue.subject) }),
		});
		return { ...identity, ...picture };
	} catch (error) {
		if (error instanceof SemanticRenderError) {
			return { ...identity, empty: error.code };
		}
		throw error;
	}
}

/**
 * Answer a render of one board: the variant and view it names, drawn.
 * @param board The board, as read.
 * @param choices The variant, view, theme and faces asked for.
 * @param policy The vault's presentation policy.
 * @returns The answer, or which name the board does not have.
 */
async function renderBoard(
	board: SemanticBoard,
	choices: BoardRenderChoices,
	policy: SemanticPolicy,
): Promise<BoardRenderOutcome> {
	const variant = resolveVariant(board, choices.variant);
	if (variant === undefined) {
		return {
			ok: false,
			code: "UNKNOWN_VARIANT",
			error: `this board has no variant called "${choices.variant ?? ""}"`,
		};
	}
	const view = choices.view === undefined ? undefined : findView(board, choices.view);
	if (choices.view !== undefined && view === undefined) {
		return {
			ok: false,
			code: "UNKNOWN_VIEW",
			error: `board "${board.name}" has no view called "${choices.view}"`,
		};
	}
	const reply = await drawnReply(board, variant, view, {
		theme: choices.theme,
		fonts: choices.fonts,
		policy,
		comparison: choices.comparison !== false,
	});
	return { ok: true, reply };
}

export { renderBoard, type BoardRenderChoices, type BoardRenderOutcome };
