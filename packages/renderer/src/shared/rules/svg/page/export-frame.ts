// What a picture exported to stand alone carries around its drawing.
//
// A reader who meets an exported picture in a pull request or a document has
// nothing beside it to say what it shows or what its symbols mean. So an export
// can carry a title above the drawing (TASK-467) and a legend under it or
// beside it, or be the legend alone (TASK-468). Both are drawn into the
// document, measured with the diagram faces like every other word, and painted
// with the palette's tokens, so they follow the ground the picture is drawn
// for: light, dark or both.
//
// The drawing itself is never laid out again or drawn over: it is moved down
// whole, under the title, and the page grows to hold everything. Asked for
// nothing, the page is the page that was painted, byte for byte.
//
// The key counts the marks of what the painted drawing placed, read from its
// atlas, and the page says which subjects those are: a view's reading holds
// subjects its grammar never draws, and a count of those keyed a mark nobody
// could find (TASK-497).

import type { LegendLayout } from "@archboard/board/render-reply";
import { DIAGRAM_MARGIN } from "#shared/constants/spacing.ts";
import { roundCoord } from "#shared/rules/geometry.ts";
import { CARD_TITLE_FONT, fontAttributes } from "#shared/rules/text/fonts.ts";
import { markCounts, placedStanding, type MarkCount } from "#shared/rules/render/picture-key.ts";
import { measure } from "#shared/rules/text/text.ts";
import type { Palette } from "#shared/rules/svg/page/theme.ts";
import { legendOf, type Legend } from "#shared/rules/svg/page/legend.ts";
import { movedAll, type PaintedPage } from "#shared/rules/svg/page/planned-frame.ts";
import { lines, textNode, wrap } from "#shared/rules/svg/page/primitives.ts";
import type { SubjectStanding } from "#shared/rules/svg/parts/standing.ts";

/** What an export asks to carry beside the drawing. */
interface ExportFrame {
	/** The words drawn above the picture; none when absent. */
	readonly title?: string | undefined;
	/** How the legend is laid out; no legend when absent. */
	readonly legend?: LegendLayout | undefined;
	/** Whether the legend is drawn without the picture. */
	readonly legendOnly?: boolean | undefined;
}

/** What a render asks for that an export's frame reads. */
interface Framed {
	/** What the export carries beside its drawing; nothing when absent. */
	readonly frame?: ExportFrame | undefined;
	/** How each subject stands in the comparison, for the marks the legend counts. */
	readonly standing?: Readonly<Record<string, SubjectStanding>> | undefined;
	/** Whether the picture draws the comparison's marks. */
	readonly paintStanding?: boolean | undefined;
}

/** A page as an export carries it, and the subjects its drawing placed. */
interface FramedPage extends PaintedPage {
	/**
	 * Every subject the painted drawing placed, by id: what the key counts the
	 * marks of. A legend drawn alone keys the drawing it leaves out, so these
	 * are still that drawing's.
	 */
	readonly placed: readonly string[];
}

/** How large a title is set, in the card titles' face, and the line it takes. */
const TITLE = { size: 18, line: 24 } as const;

/** A page that draws nothing: what the legend alone stands beside. */
const NOTHING: PaintedPage = {
	body: "",
	width: 0,
	height: 0,
	atlas: { nodes: {}, edges: {}, regions: {} },
};

/**
 * A page with its legend under it, wrapped at its width, or beside it.
 * @param page The page.
 * @param legend The legend, laid out.
 * @param layout Where it stands.
 * @returns The page, grown to hold the legend.
 */
function withLegend(page: PaintedPage, legend: Legend, layout: LegendLayout): PaintedPage {
	if (layout === "vertical") {
		return {
			...page,
			body: lines([page.body, legend.draw(page.width, 0)]),
			width: roundCoord(page.width + legend.width),
			height: Math.max(page.height, legend.height),
		};
	}
	return {
		...page,
		body: lines([page.body, legend.draw(0, page.height)]),
		width: Math.max(page.width, legend.width),
		height: roundCoord(page.height + legend.height),
	};
}

/**
 * A page under a title band, moved down whole with its atlas.
 * @param page The page.
 * @param title The words.
 * @param palette The theme's colours.
 * @returns The page, grown to hold the title.
 */
function underTitle(page: PaintedPage, title: string, palette: Palette): PaintedPage {
	const words = textNode(
		{
			x: DIAGRAM_MARGIN,
			y: DIAGRAM_MARGIN + TITLE.line / 2,
			"dominant-baseline": "central",
			"font-size": TITLE.size,
			fill: palette.foreground,
			...fontAttributes(CARD_TITLE_FONT),
		},
		title,
	);
	// What follows brings its own margin, which stands between the title and it.
	const band = DIAGRAM_MARGIN + TITLE.line;
	return {
		body: lines([
			wrap("g", { "data-slot": "export-title" }, words),
			wrap("g", { transform: `translate(0 ${band})` }, page.body),
		]),
		width: Math.max(
			page.width,
			Math.ceil(measure(title, CARD_TITLE_FONT, TITLE.size)) + 2 * DIAGRAM_MARGIN,
		),
		height: band + page.height,
		atlas: {
			nodes: movedAll(page.atlas.nodes, 0, band),
			edges: movedAll(page.atlas.edges, 0, band),
			regions: movedAll(page.atlas.regions, 0, band),
		},
	};
}

/**
 * Every subject a painted drawing placed: what its atlas holds.
 * @param page The painted page.
 * @returns Their ids.
 */
function placedOn(page: PaintedPage): string[] {
	return [
		...new Set(
			[page.atlas.nodes, page.atlas.edges, page.atlas.regions].flatMap((boxes) =>
				Object.keys(boxes),
			),
		),
	];
}

/**
 * The marks a picture draws, counted as the page's key counts them.
 * @param request The comparison the render draws.
 * @param placed The subjects the drawing placed.
 * @returns How many placed subjects carry each mark; none when the marks are not drawn.
 */
function marksOf(request: Framed, placed: readonly string[]): readonly MarkCount[] {
	return request.paintStanding === false
		? []
		: markCounts(placedStanding(request.standing ?? {}, placed));
}

/**
 * A page as an export carries it: with its legend under it or beside it, or
 * its legend alone, under its title when it has one.
 * @param page The painted page.
 * @param request What the render asks the export to carry, and the comparison it draws.
 * @param palette The theme's colours.
 * @returns The page, its atlas moved with its drawing, the same page when nothing is asked
 * for; and the subjects its drawing placed.
 */
function framedForExport(page: PaintedPage, request: Framed, palette: Palette): FramedPage {
	const frame = request.frame ?? {};
	const placed = placedOn(page);
	const shown = frame.legendOnly === true && frame.legend !== undefined ? NOTHING : page;
	// The legend alone keeps the width a row of it would wrap at under the picture.
	const keyed =
		frame.legend === undefined
			? shown
			: withLegend(
					shown,
					legendOf(page.body, marksOf(request, placed), frame.legend, page.width, palette),
					frame.legend,
				);
	return {
		...(frame.title === undefined ? keyed : underTitle(keyed, frame.title, palette)),
		placed,
	};
}

/**
 * The accessible name as the export draws it: its drawn title first, and said
 * to be the legend when the legend is drawn alone.
 * @param name The picture's own accessible name.
 * @param frame What the export carries beside its drawing.
 * @returns The `aria-label`.
 */
function exportedName(name: string, frame: ExportFrame | undefined): string {
	const titled = frame?.title === undefined ? name : `${frame.title}. ${name}`;
	return frame?.legendOnly === true && frame.legend !== undefined ? `Legend. ${titled}` : titled;
}

export { exportedName, framedForExport, type ExportFrame, type FramedPage };
