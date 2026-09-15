import { DEFAULT_SEMANTIC_POLICY, type SemanticPolicy } from "@/shared/semantic-policy/index";
// A semantic board in, one self-contained SVG plus its geometry out.
//
// This module is an in-repository fork of both grammars of the PR
// Lens SVG renderer (MIT, Coldtea AI), pinned to revision
// 0993b4dec8ae73f5e000370e6a758cdd8aa2bfd0. `NOTICE.md` beside this file holds
// the licence and says exactly what was taken and what was changed.
//
// ADR 0023 draws the line this module sits on: an agent authors meaning, and
// everything about the picture — where a box goes, what colour it is, which
// face an arrow leaves by, whether a name will fit — is decided here, once, for
// every board. There is no coordinate, no colour and no rank hint in the input,
// and adding one would move that line.
//
// A proposal's standing against the variant it came from is on the same side of
// that line. The caller states, per render, how each subject stands — derived
// that instant from the two variants' shared identities, never authored and
// never stored — and how added, removed and changed are then *drawn* is decided
// here, in `lib/svg/standing.ts`, which sets out the whole vocabulary.
//
// Nothing here reads a clock, a random number or a mutable file. Font files are
// read — to measure text, and to embed when a caller asks for a self-contained
// document — and both are deterministic and cached, so the same content, theme
// and font source produce the same bytes on any machine, in any order.

import type {
	DiagramAtlas,
	DiagramGrammar,
	DiagramTheme,
	FontSource,
	VariantContent,
} from "@/shared/semantic-board/index";
import { layoutCompound } from "@/runtime/semantic-renderer/lib/layout/compound";
import type { ArchitectureDrawing } from "@/runtime/semantic-renderer/lib/drawing";
import { measureArchitecture } from "@/runtime/semantic-renderer/lib/measurement";
import { paletteFor, type Palette } from "@/runtime/semantic-renderer/lib/theme";
import { paintArchitecture } from "@/runtime/semantic-renderer/lib/svg/architecture";
import { paintDataFlow } from "@/runtime/semantic-renderer/lib/svg/dataflow";
import { svgDocument } from "@/runtime/semantic-renderer/lib/svg/document";
import {
	standingsFrom,
	unsettledFrom,
	type StatedStandings,
	type SubjectStanding,
} from "@/runtime/semantic-renderer/lib/svg/standing";

/** Why some content could not be drawn. */
type RenderErrorCode = "NOTHING_TO_RENDER";

/**
 * Thrown when content cannot be drawn.
 *
 * The code is the stable half of the failure and the message is for a person.
 * Every one of these describes content the renderer will not draw, never an
 * internal fault: a caller that catches one shows an empty state rather than a
 * degenerate picture.
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

/** What to draw, and on which ground. */
interface DiagramRenderRequest {
	/** The content, already cut down to what the caller wants drawn. */
	readonly content: VariantContent;
	/** Current vault presentation, shared by every variant. */
	readonly policy?: SemanticPolicy;
	/** Same-view ancestor drawings, oldest first and ending at the direct predecessor. */
	readonly predecessors?: readonly VariantContent[];
	/** Which of the two grounds to draw it on. */
	readonly theme: DiagramTheme;
	/**
	 * Where the drawn faces come from. Defaults to `"linked"`, which points at
	 * the files the canvas serves — a few kilobytes, and what a pane wants.
	 * `"embedded"` carries the faces in the document, which is what a file
	 * somebody keeps needs and costs about half a megabyte.
	 */
	readonly fonts?: FontSource;
	/**
	 * How each subject of this picture stands against the variant it came from.
	 *
	 * The caller derives it — by reading this variant against its predecessor,
	 * on every render — and this module draws it. Absent means this is not a
	 * proposal and the picture is drawn plainly; present means every drawn
	 * subject says how it stands, and an id the map does not mention stands
	 * unchanged. Nothing about it is persisted anywhere (ADR 0023).
	 */
	readonly standing?: StatedStandings | undefined;
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
}

/** The same, plus which of the two pictures to draw. */
interface SemanticViewRenderRequest extends DiagramRenderRequest {
	/** Which grammar the view asked for. */
	readonly grammar: DiagramGrammar;
}

/** One drawn diagram, in either grammar. */
interface RenderedDiagram {
	/** The whole SVG document. */
	readonly svg: string;
	/** The page width, in the document's own units. */
	readonly width: number;
	/** The page height, in the document's own units. */
	readonly height: number;
	/** Where every subject the renderer drew ended up. */
	readonly atlas: DiagramAtlas;
}

/**
 * How many of a thing there are, in words a screen reader can say.
 * @param count How many.
 * @param one What one of them is called.
 * @param many What several of them are called.
 * @returns The phrase.
 */
function countOf(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}

/**
 * The accessible name for a picture nobody gave a title to.
 *
 * A variant has a name, but it is the board's to own and not the content's, so
 * the renderer says what it drew rather than inventing what it is called.
 * @param content The architecture.
 * @returns The `aria-label`.
 */
function titleFor(content: VariantContent): string {
	return `Architecture diagram: ${countOf(content.nodes.length, "node", "nodes")}, ${countOf(
		content.edges.length,
		"connection",
		"connections",
	)}`;
}

/**
 * The longer description: which containers the picture is divided into.
 * @param names The container names, in the order they are drawn.
 * @returns The description, or undefined when nothing contains anything.
 */
function descriptionFor(names: readonly string[]): string | undefined {
	return names.length === 0 ? undefined : `Grouped by ${names.join(", ")}.`;
}

/**
 * Resolve each ancestor from the geometry of its own predecessor.
 * @param predecessors The same-view lineage, oldest first.
 * @param index The ancestor whose drawing is needed.
 * @returns Its derived geometry, or no anchor for an empty predecessor view.
 */
async function layoutPredecessors(
	predecessors: readonly VariantContent[],
	index = predecessors.length - 1,
): Promise<ArchitectureDrawing | undefined> {
	const content = predecessors[index];
	if (content === undefined || content.nodes.length === 0) return undefined;
	const before = await layoutPredecessors(predecessors, index - 1);
	return await layoutCompound(content, measureArchitecture(content), before);
}

/**
 * A semantic architecture in, one self-contained SVG plus its geometry out.
 * @param request What to draw, and on which ground.
 * @returns The document, its size and its atlas.
 * @throws {SemanticRenderError} When there is nothing to draw.
 */
async function renderArchitecture(request: DiagramRenderRequest): Promise<RenderedDiagram> {
	const { content, theme } = request;
	if (content.nodes.length === 0) {
		throw new SemanticRenderError(
			"NOTHING_TO_RENDER",
			"this architecture has no nodes, so there is no diagram to draw",
		);
	}

	const predecessor = await layoutPredecessors(request.predecessors ?? []);
	const measured = measureArchitecture(content);
	const drawing = await layoutCompound(content, measured, predecessor);
	const palette = paletteFor(theme);
	const painting = paintArchitecture(
		drawing,
		palette,
		standingsFrom(request.standing),
		unsettledFrom(request.unsettled),
		request.policy ?? DEFAULT_SEMANTIC_POLICY,
	);

	const svg = svgDocument({
		width: painting.width,
		height: painting.height,
		palette,
		title: titleFor(content),
		description: descriptionFor(drawing.containers.map((held) => held.measured.node.name)),
		fonts: request.fonts ?? "linked",
		body: painting.body,
	});

	return { svg, width: painting.width, height: painting.height, atlas: painting.atlas };
}

/**
 * The accessible name for a sequence nobody gave a title to.
 * @param content The content being drawn.
 * @returns The `aria-label`.
 */
function sequenceTitleFor(content: VariantContent): string {
	const steps = content.flows.reduce((total, flow) => total + flow.steps.length, 0);
	return `Message-sequence diagram: ${countOf(content.flows.length, "flow", "flows")}, ${countOf(
		steps,
		"step",
		"steps",
	)}`;
}

/**
 * The longer description of a sequence: which exchanges it shows.
 * @param content The content being drawn.
 * @returns The description.
 */
function sequenceDescriptionFor(content: VariantContent): string {
	return `Showing ${content.flows.map((flow) => flow.name).join(", ")}.`;
}

/**
 * One variant's flows, drawn as a stack of message sequences.
 *
 * Every flow the content holds is drawn, because the caller has already said
 * what it wants seen: a view scoped to one exchange arrives here holding that
 * one, and an unscoped one arrives holding them all.
 * @param request What to draw, and on which ground.
 * @returns The document, its size and its atlas.
 * @throws {SemanticRenderError} When the content holds no flow.
 */
function renderDataFlow(request: DiagramRenderRequest): RenderedDiagram {
	const { content, theme } = request;
	if (content.flows.length === 0) {
		throw new SemanticRenderError(
			"NOTHING_TO_RENDER",
			"this content has no flow, so there is no sequence to draw",
		);
	}

	const palette = paletteFor(theme);
	const painting = paintDataFlow(
		content.flows,
		content.nodes,
		palette,
		standingsFrom(request.standing),
		unsettledFrom(request.unsettled),
		request.policy ?? DEFAULT_SEMANTIC_POLICY,
	);

	const svg = svgDocument({
		width: painting.width,
		height: painting.height,
		palette,
		title: sequenceTitleFor(content),
		description: sequenceDescriptionFor(content),
		fonts: request.fonts ?? "linked",
		body: painting.body,
	});

	return { svg, width: painting.width, height: painting.height, atlas: painting.atlas };
}

/**
 * One reading of a variant, drawn in the grammar its view asked for.
 *
 * Two pictures of the same identities: a participant column and an architecture
 * card carry the same node id, and a pane that has selected one has selected the
 * other. Which grammar is chosen is presentation intent the board states; it is
 * never derived from what the content happens to hold.
 * @param request What to draw, in which grammar, and on which ground.
 * @returns The document, its size and its atlas.
 * @throws {SemanticRenderError} When that grammar has nothing to draw.
 */
async function renderSemanticView(request: SemanticViewRenderRequest): Promise<RenderedDiagram> {
	return request.grammar === "data-flow"
		? renderDataFlow(request)
		: await renderArchitecture(request);
}

export {
	type SubjectStanding,
	type StatedStandings,
	type DiagramRenderRequest,
	type SemanticViewRenderRequest,
	type RenderedDiagram,
	type RenderErrorCode,
	SemanticRenderError,
	renderArchitecture,
	renderDataFlow,
	renderSemanticView,
	paletteFor,
	type Palette,
};
