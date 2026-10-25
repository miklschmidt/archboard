// What a render asks for, and what it answers: shared by every grammar's
// render, so the architecture, the sequence and the flowchart read one request.

import type { ChangeKind } from "@archboard/board/comparison";
import type { SemanticPolicy } from "@archboard/board/policy";
import type { LayoutEngineName, StandaloneTheme } from "@archboard/board/render-reply";
import type { DiagramGrammar } from "@archboard/board/views";
import type { VariantContent } from "@archboard/board/content";
import type { Drawn, ExportFrame } from "#shared/protocol/generated/core/types.ts";

/** How one subject stands against the variant it is compared with. */
type SubjectStanding = ChangeKind;

/**
 * What every subject of a picture states, by the id the board gave it. An id
 * the map does not mention stands unchanged.
 */
type StatedStandings = Readonly<Record<string, SubjectStanding>>;

/** Why some content could not be drawn. */
type RenderErrorCode = "NOTHING_TO_RENDER";

/**
 * Refuses content the renderer cannot draw. The code is stable; the message is
 * for a person. Callers show an empty state for these refusals; internal faults
 * use other errors.
 */
class SemanticRenderError extends Error {
	/** Which refusal this is. */
	readonly code: RenderErrorCode;

	/**
	 * Refuse to draw, with a reason.
	 * @param code Which refusal this is.
	 * @param message What a person should read.
	 */
	constructor(code: RenderErrorCode, message: string) {
		super(message);
		this.name = "SemanticRenderError";
		this.code = code;
	}
}

/** What to draw, and for where. */
interface DiagramRenderRequest {
	/** The content, already cut down to what the caller wants drawn. */
	readonly content: VariantContent;
	/**
	 * The vault's presentation, shared by every variant: its groups, kinds and
	 * line looks. Required, so a caller drawing a vault board cannot leave out
	 * the groups it draws; a drawing with no vault names `DEFAULT_SEMANTIC_POLICY`.
	 */
	readonly policy: SemanticPolicy;
	/**
	 * The theme a document that stands alone is drawn in: it then carries that
	 * theme's value of every colour token it paints with. Absent, the picture is
	 * for a page, and takes the page's tokens and colour scheme wherever it is
	 * put.
	 */
	readonly theme?: StandaloneTheme | undefined;
	/**
	 * How each subject of this picture stands against the variant it is read against.
	 *
	 * The caller derives it by reading this variant against the board's current
	 * variant (or, on a board with none, its predecessor) on every render. It
	 * keeps differently standing relationships on distinct channels, even when
	 * their marks are hidden. Absent means there is nothing to read it against;
	 * an id the map does not mention stands unchanged. Nothing about it is
	 * persisted anywhere (ADR 0023).
	 */
	readonly standing?: StatedStandings | undefined;
	/**
	 * Whether the picture marks how each subject stands. True when absent.
	 * False draws the picture without its comparison: no subject is marked, but
	 * the layout still reads the standing, so every line runs the route it runs
	 * with the marks.
	 */
	readonly paintStanding?: boolean | undefined;
	/**
	 * The variant's own reading of the view, when the content is more than
	 * that: read against another variant, the content has what the variant
	 * lacks of it put back. The layout reads it in either picture, so both lay
	 * out alike. A picture without its comparison draws only what it holds:
	 * the rest still takes its place in the layout, and the page stays the size
	 * of the whole layout, so everything drawn stands where it stands with the
	 * comparison. Absent means the content is the variant's own reading.
	 */
	readonly held?: VariantContent | undefined;
	/**
	 * The whole variant the picture reads, before a view narrows it and without
	 * what a comparison puts back. The layout reads each container's interface
	 * from it (ADR 0044): an entry point keeps its container's first row in a
	 * view that hides its caller, and a child a comparison puts back is never
	 * one. Absent, the variant's own reading of the view stands in for it.
	 */
	readonly variant?: VariantContent | undefined;
	/**
	 * Which of this variant's subjects the board says nobody has decided yet.
	 *
	 * Derived on every render exactly as the standings are, from the same
	 * reconciliation the words beside the picture are written from, and stored
	 * nowhere. Absent or empty means there is nothing open, which is the ordinary
	 * case; an id in it is drawn with a warning badge, whatever else is true of
	 * it. An id that is not drawn — a view or a walkthrough — is simply not
	 * reached, because nothing in the picture asks about it.
	 */
	readonly unsettled?: readonly string[] | undefined;
	/**
	 * Whether the board says nothing it describes is built: it has no current variant
	 * (ADR 0031). The page is then framed as planned. A fact about the board, so every
	 * variant and view of such a board is framed alike.
	 */
	readonly unbuilt?: boolean | undefined;
	/**
	 * The level of the board drawn. A part that opens another board is marked
	 * with which way that board lies, read from the part's kind against this
	 * level (ADR 0029); absent, the mark says only that it opens another board.
	 */
	readonly level?: string | undefined;
	/** Which engine lays the architecture out; the default one when absent (TASK-348). */
	readonly layout?: LayoutEngineName | undefined;
	/** What a picture exported to stand alone carries beside its drawing: a title, a legend. */
	readonly frame?: ExportFrame | undefined;
}

/** The same, plus which of the two pictures to draw. */
interface SemanticViewRenderRequest extends DiagramRenderRequest {
	/** Which grammar the view asked for. */
	readonly grammar: DiagramGrammar;
}

/** One drawn diagram, in any grammar: the document the renderer core wrote, and its key. */
type RenderedDiagram = Drawn;

export {
	type DiagramRenderRequest,
	type SemanticViewRenderRequest,
	type RenderedDiagram,
	type RenderErrorCode,
	type StatedStandings,
	type SubjectStanding,
	SemanticRenderError,
};
