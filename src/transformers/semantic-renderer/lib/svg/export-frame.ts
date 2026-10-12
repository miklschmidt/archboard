// What a picture exported to stand alone carries around its drawing.
//
// A reader who meets an exported picture in a pull request or a document has
// nothing beside it to say what it shows. So an export can carry a title above
// the drawing (TASK-467). It is drawn into the document, measured with the
// diagram faces like every other word, and painted with the palette's tokens,
// so it follows the ground the picture is drawn for: light, dark or both.
//
// The drawing itself is never laid out again or drawn over: it is moved down
// whole, under the title, and the page grows to hold everything. Asked for
// nothing, the page is the page that was painted, byte for byte.

import { DIAGRAM_MARGIN } from "@/transformers/semantic-renderer/config";
import { CARD_TITLE_FONT, fontAttributes } from "@/transformers/semantic-renderer/lib/fonts";
import { measure } from "@/transformers/semantic-renderer/lib/text";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { movedAll, type PaintedPage } from "@/transformers/semantic-renderer/lib/svg/planned-frame";
import { lines, textNode, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";

/** What an export asks to carry beside the drawing. */
interface ExportFrame {
	/** The words drawn above the picture; none when absent. */
	readonly title?: string | undefined;
}

/** What a render asks for that an export's frame reads. */
interface Framed {
	/** What the export carries beside its drawing; nothing when absent. */
	readonly frame?: ExportFrame | undefined;
}

/** How large a title is set, in the card titles' face, and the line it takes. */
const TITLE = { size: 18, line: 24 } as const;

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
 * A page as an export carries it: under its title when it has one.
 * @param page The painted page.
 * @param request What the render asks the export to carry.
 * @param palette The theme's colours.
 * @returns The page, its atlas moved with its drawing; the same page when nothing is asked for.
 */
function framedForExport(page: PaintedPage, request: Framed, palette: Palette): PaintedPage {
	const title = request.frame?.title;
	return title === undefined ? page : underTitle(page, title, palette);
}

/**
 * The accessible name as the export draws it: its drawn title first.
 * @param name The picture's own accessible name.
 * @param frame What the export carries beside its drawing.
 * @returns The `aria-label`.
 */
function exportedName(name: string, frame: ExportFrame | undefined): string {
	return frame?.title === undefined ? name : `${frame.title}. ${name}`;
}

export { exportedName, framedForExport, type ExportFrame };
