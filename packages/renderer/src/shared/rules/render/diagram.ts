import type { SemanticPolicy } from "@archboard/board/policy";
// A semantic board in, one self-contained SVG plus its geometry out.
//
// This module is an in-repository fork of both grammars of the PR
// Lens SVG renderer (MIT, Coldtea AI), pinned to revision
// 0993b4dec8ae73f5e000370e6a758cdd8aa2bfd0. `NOTICE.md` beside this file holds
// the licence and says exactly what was taken and what was changed.
//
// Agents author meaning; this module derives presentation for every board
// (ADR 0023, ADR 0028). Inputs carry no coordinates, font sizes, colours or routes.
//
// Callers derive proposal standings from shared subject identities per render,
// never authoring or storing them. `shared/rules/svg/parts/standing.ts` owns how they are drawn.
//
// Nothing here reads a clock, a random number or a file. Text is measured by the
// canvas of the host that draws, with the diagram faces loaded, and the host
// supplies the layout engine, the theme colours a document that stands alone
// carries and the font bytes a self-contained document embeds (`shared/rules/render/host.ts`).
// So one host draws the same content, theme and font source to the same bytes
// in any order, and two browsers may measure a word differently because each
// paints it differently.
//
// Page pictures take the page's colour tokens (`shared/rules/svg/page/theme.ts`). Only documents
// that stand alone are drawn for a theme.

import { DEFAULT_LAYOUT_ENGINE, type LayoutEngineName } from "@archboard/board/render-reply";
import type { VariantContent } from "@archboard/board/content";
import {
	SemanticRenderError,
	type DiagramRenderRequest,
	type RenderedDiagram,
	type SemanticViewRenderRequest,
} from "#shared/protocol/render-request.ts";
import { renderFlowchart } from "#shared/rules/flowchart/flowchart.ts";
import { layoutEngine } from "#shared/rules/layout/engines.ts";
import { entryPointsOf } from "#shared/rules/layout/compound-graph.ts";
import type { PaintedDrawing } from "#shared/rules/render/drawing.ts";
import { measureArchitecture } from "#shared/rules/text/measurement.ts";
import { withStepLines, type StepLines } from "#shared/rules/render/step-lines.ts";
import { lineLooks } from "#shared/rules/render/semantic-appearance.ts";
import { shownDrawing, unshownOf } from "#shared/rules/render/shown.ts";
import { PALETTE } from "#shared/rules/svg/page/theme.ts";
import { paintArchitecture } from "#shared/rules/svg/parts/architecture.ts";
import { pulseLook } from "#shared/rules/svg/lines/beam-light.ts";
import { paintDataFlow } from "#shared/rules/svg/sequence/dataflow.ts";
import { svgDocument } from "#shared/rules/svg/page/document.ts";
import { exportedName, framedForExport } from "#shared/rules/svg/page/export-frame.ts";
import { drawnInk, HEAD_LENGTH, STROKE_WIDTH, type Weight } from "#shared/rules/svg/page/styles.ts";
import { pageFor, plannedTitle } from "#shared/rules/svg/page/planned-frame.ts";
import {
	standingPinAt,
	standingsFrom,
	unsettledFrom,
	type StatedStandings,
	type SubjectStanding,
} from "#shared/rules/svg/parts/standing.ts";

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

/** How many distinct layouts are remembered across boards, variants and comparisons. */
const REMEMBERED_LAYOUTS = 64;

/** Layouts by the content they were laid out from, least recently used first. */
const layouts = new Map<string, Promise<PaintedDrawing>>();

/**
 * Lay out each distinct content and comparison channel set once per engine.
 * @param expanded The architecture to draw, with its drawable flow-step lines added.
 * @param standing Comparison standing used to keep marked relationships apart, and lines off
 * the pin a marked card wears.
 * @param engine The engine that lays it out.
 * @param policy The vault's groups, in order, which place and caption regions, and its
 * relationship kinds, which say how each line is drawn.
 * @param steps The lines that are flow steps drawn on the board.
 * @param entries Each child that is an entry point of its container, in id order, true when first.
 * @returns Its deterministic layout.
 */
function layoutRemembered(
	expanded: VariantContent,
	standing: StatedStandings | undefined,
	engine: LayoutEngineName,
	policy: Pick<SemanticPolicy, "groups" | "relationshipKinds">,
	steps: ReadonlySet<string>,
	entries: ReadonlyMap<string, boolean>,
): Promise<PaintedDrawing> {
	const standings =
		standing === undefined
			? undefined
			: Object.fromEntries(
					[...expanded.nodes, ...expanded.edges].map(({ id }) => [id, standing[id] ?? "unchanged"]),
				);
	const named = Object.entries(policy.groups).map(([id, { name }]) => [id, name]);
	const lines = Object.entries(policy.relationshipKinds).map(([kind, look]) => [
		kind,
		look.dash,
		look.arrowhead,
	]);
	// Which lines a flow draws depends on the variant's own reading as well as
	// on the content, so the key is the content with those lines added.
	const key = JSON.stringify([engine, expanded, [...steps], standings, named, lines, [...entries]]);
	const known = layouts.get(key);
	if (known !== undefined) {
		layouts.delete(key);
		layouts.set(key, known);
		return known;
	}
	const layout = layoutEngine(engine)(
		expanded,
		measureArchitecture(expanded, policy, steps),
		standings,
		entries,
	);
	layouts.set(key, layout);
	// A failed layout is not remembered: the next request tries again.
	layout.catch(() => layouts.delete(key));
	for (const oldest of layouts.keys()) {
		if (layouts.size <= REMEMBERED_LAYOUTS) break;
		layouts.delete(oldest);
	}
	return layout;
}

/**
 * What a request draws of what it lays out.
 * @param request What to draw.
 * @returns The variant's own reading of the view; whether the picture is
 * without its comparison, and so draws only that; what it then draws; and the
 * whole variant whose interface the layout reads.
 */
function readingOf(request: DiagramRenderRequest): {
	readonly held: VariantContent;
	readonly plain: boolean;
	readonly told: VariantContent;
	readonly variant: VariantContent;
} {
	const held = request.held ?? request.content;
	const plain = request.paintStanding === false;
	return { held, plain, told: plain ? held : request.content, variant: request.variant ?? held };
}

/**
 * The drawing a picture paints: all of it with its comparison, and without it
 * only what the variant's own reading of the view holds, where the whole
 * layout put it.
 * @param drawing The whole layout.
 * @param stepLines The content laid out, and which of its lines are flow messages.
 * @param reading What the request draws of it.
 * @param reading.held The variant's own reading of the view.
 * @param reading.plain Whether the picture is without its comparison.
 * @param policy The vault's presentation policy, which says how each line is drawn.
 * @returns The drawing to paint.
 */
function shownOf(
	drawing: PaintedDrawing,
	stepLines: StepLines,
	{ held, plain }: { readonly held: VariantContent; readonly plain: boolean },
	policy: SemanticPolicy,
): PaintedDrawing {
	if (!plain) return drawing;
	return shownDrawing(
		drawing,
		unshownOf(stepLines.content, held),
		lineLooks(stepLines.content.edges, policy, stepLines.derived),
	);
}

/**
 * A semantic architecture in, one self-contained SVG plus its geometry out.
 * @param request What to draw, and on which ground.
 * @returns The document, its size and its atlas.
 * @throws {SemanticRenderError} When there is nothing to draw.
 */
async function renderArchitecture(request: DiagramRenderRequest): Promise<RenderedDiagram> {
	const reading = readingOf(request);
	const { held, plain, told } = reading;
	if (told.nodes.length === 0) {
		throw new SemanticRenderError(
			"NOTHING_TO_RENDER",
			"this architecture has no nodes, so there is no diagram to draw",
		);
	}

	const stepLines = withStepLines(request.content, held);
	const { policy } = request;
	const drawing = await layoutRemembered(
		stepLines.content,
		request.standing,
		request.layout ?? DEFAULT_LAYOUT_ENGINE,
		policy,
		stepLines.derived,
		entryPointsOf(stepLines.content, reading.variant),
	);
	const shown = shownOf(drawing, stepLines, reading, policy);
	const painting = paintArchitecture(
		shown,
		PALETTE,
		standingsFrom(plain ? undefined : request.standing),
		unsettledFrom(request.unsettled),
		{ policy, level: request.level },
		stepLines.derived,
		// The page is the comparison's page whether or not its marks are drawn.
		{ drawing, standingOf: standingsFrom(request.standing) },
	);
	const page = framedForExport(pageFor(painting, PALETTE, request.unbuilt), request, PALETTE);

	const svg = svgDocument({
		width: page.width,
		height: page.height,
		palette: PALETTE,
		title: exportedName(plannedTitle(titleFor(told), request.unbuilt), request.frame),
		description: descriptionFor(shown.containers.map(({ measured }) => measured.node.name)),
		fonts: request.fonts ?? "linked",
		body: page.body,
		reading: drawing.direction,
		theme: request.theme,
	});

	return {
		svg,
		width: page.width,
		height: page.height,
		atlas: page.atlas,
		placed: page.placed,
		readingDirection: drawing.direction,
	};
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
 * Every flow the content holds is laid out, because the caller has already
 * said what it wants seen: a view scoped to one exchange arrives here holding
 * that one, and an unscoped one arrives holding them all. A picture without
 * its comparison draws of it only the flows, and in each flow the
 * participants and messages, that the variant's own reading holds, and those
 * keep the places they have with the comparison.
 * @param request What to draw, and on which ground.
 * @returns The document, its size and its atlas.
 * @throws {SemanticRenderError} When no flow is left to draw.
 */
function renderDataFlow(request: DiagramRenderRequest): RenderedDiagram {
	const { content } = request;
	const { plain, told } = readingOf(request);
	if (told.flows.length === 0) {
		throw new SemanticRenderError(
			"NOTHING_TO_RENDER",
			"this content has no flow, so there is no sequence to draw",
		);
	}

	const painting = paintDataFlow(
		content.flows,
		content.nodes,
		PALETTE,
		standingsFrom(plain ? undefined : request.standing),
		unsettledFrom(request.unsettled),
		{ policy: request.policy, level: request.level },
		{ held: plain ? told.flows : undefined, standingOf: standingsFrom(request.standing) },
	);
	const page = framedForExport(pageFor(painting, PALETTE, request.unbuilt), request, PALETTE);

	const svg = svgDocument({
		width: page.width,
		height: page.height,
		palette: PALETTE,
		title: exportedName(plannedTitle(sequenceTitleFor(told), request.unbuilt), request.frame),
		description: sequenceDescriptionFor(told),
		fonts: request.fonts ?? "linked",
		body: page.body,
		theme: request.theme,
	});

	return { svg, width: page.width, height: page.height, atlas: page.atlas, placed: page.placed };
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
	if (request.grammar === "sequence") return renderDataFlow(request);
	if (request.grammar === "flowchart") return await renderFlowchart(request);
	return await renderArchitecture(request);
}

/**
 * The colour a relationship's line is drawn in, from the colour it stands for:
 * the one expression the picture draws the line in, for a key beside it to
 * draw the same.
 * @param ink The colour at full strength.
 * @returns The line's colour.
 */
function lineInk(ink: string): string {
	return drawnInk(ink, PALETTE);
}

/**
 * The colour of the body of a pulse that rides a line of one colour: the one
 * expression the picture draws it in, for a key beside it to draw the same.
 * @param ink The line's colour at full strength.
 * @returns The pulse's colour.
 */
function pulseInk(ink: string): string {
	return pulseLook(ink, STROKE_WIDTH.normal, PALETTE).head;
}

/**
 * How wide a page draws a line of one emphasis, in diagram units: for a key
 * that has to draw a line the way the picture does (TASK-383).
 * @param emphasis How loudly its author asked the line to speak.
 * @returns The stroke width.
 */
function lineWidth(emphasis: Weight): number {
	return STROKE_WIDTH[emphasis];
}

/**
 * How long a page draws the arrowhead of a line of one emphasis, from its base
 * to its tip, in diagram units: for a key that has to draw a head the way the
 * picture does.
 * @param emphasis How loudly its author asked the line to speak.
 * @returns The head's length, which is also its width.
 */
function headLength(emphasis: Weight): number {
	return HEAD_LENGTH[emphasis];
}

/**
 * The pin a subject of one standing wears on its corner, as a page draws it:
 * for a key that has to show the mark the picture shows (TASK-383).
 * @param standing How the subject stands.
 * @returns The pin, centred on the origin in a twenty-unit square; empty for unchanged.
 */
function standingMark(standing: SubjectStanding): string {
	return standingPinAt(0, 0, standing, PALETTE);
}

export {
	renderArchitecture,
	renderDataFlow,
	renderSemanticView,
	headLength,
	lineInk,
	lineWidth,
	pulseInk,
	standingMark,
};
