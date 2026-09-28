// Group regions (TASK-347): the cards one group places inside one container,
// inside an outline of the group's colour with the group's name in its corner.
// The outline has no fill, so the cards and lines in it read on the page as
// everywhere else. It is never an obstacle: lines cross it, and it takes no
// pointer, so whatever lies inside it is picked as before.
import type { SemanticPolicy } from "@/shared/semantic-policy/index";
import { BAND_RADIUS } from "@/transformers/semantic-renderer/lib/design";
import type { DrawingRegion } from "@/transformers/semantic-renderer/lib/drawing";
import { coord } from "@/transformers/semantic-renderer/lib/geometry";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { semanticInk } from "@/transformers/semantic-renderer/lib/svg/appearance";
import { mixed } from "@/transformers/semantic-renderer/lib/svg/colour";
import { farLayer, nearLayer } from "@/transformers/semantic-renderer/lib/svg/far-view";
import { lines, tag, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import { paintTextRuns } from "@/transformers/semantic-renderer/lib/svg/text-runs";

/**
 * The attribute a region carries its members in, space-separated: a viewer
 * lights the region while one of them is lit.
 */
const MEMBERS_ATTRIBUTE = "data-members";

/** How much of the group's colour the outline carries over the page. */
const EDGE_TINT = 0.7;
/** How wide the outline is drawn: three times a card's border, so a region reads as a zone, not a card. */
const EDGE_WIDTH = 3;
/** How far the caption's words lean from the group's colour toward the text colour. */
const CAPTION_DEPTH = 0.35;

/**
 * How much of its row a group's caption may take from far away: set larger,
 * its words crowd the cards under it.
 */
const FAR_CAPTION_SHARE = 0.62;

/**
 * Paint one group's region: its outline and its caption, drawn near and from
 * far away.
 * @param region The region.
 * @param look The page's colours, the vault's policy for the group's colour,
 * and the size of the picture's card names from far away.
 * @param look.palette The page's colours.
 * @param look.policy The vault's policy.
 * @param look.farSize The size of the picture's card names from far away.
 * @returns The region's SVG.
 */
function paintRegion(
	region: DrawingRegion,
	{ palette, policy, farSize }: { palette: Palette; policy: SemanticPolicy; farSize: number },
): string {
	const ink = semanticInk(policy.groups[region.group]?.color) ?? palette.muted;
	const { box, caption } = region;
	const words = { palette, fill: mixed(ink, palette.foreground, CAPTION_DEPTH) };
	return wrap(
		"g",
		{
			"data-semantic-kind": "group-region",
			"data-group": region.group,
			[MEMBERS_ATTRIBUTE]: region.members.join(" "),
			"pointer-events": "none",
		},
		lines([
			tag("rect", {
				x: coord(box.x),
				y: coord(box.y),
				width: coord(box.width),
				height: coord(box.height),
				rx: BAND_RADIUS,
				fill: "none",
				stroke: mixed(palette.background, ink, EDGE_TINT),
				"stroke-width": EDGE_WIDTH,
			}),
			nearLayer(paintTextRuns(caption.measured.runs, caption.box, words.palette, words.fill)),
			farCaption(region, farSize, words),
		]),
	);
}

/**
 * A group's caption from far away: one line as large as its row holds, up to
 * the size of the picture's card names, and never wider than its region.
 * @param region The region.
 * @param farSize The size of the picture's card names from far away.
 * @param words The page's colours and the caption's.
 * @param words.palette The page's colours.
 * @param words.fill The caption's colour.
 * @returns The far layer.
 */
function farCaption(
	region: DrawingRegion,
	farSize: number,
	words: { palette: Palette; fill: string },
): string {
	const { box, caption } = region;
	const run = caption.measured.runs[0];
	if (run === undefined) return "";
	const room = box.width - 2 * run.x;
	const size = Math.min(
		farSize,
		caption.box.height * FAR_CAPTION_SHARE,
		(run.fontSize * room) / Math.max(1, run.width),
	);
	const grown = {
		...run,
		fontSize: size,
		width: (run.width * size) / run.fontSize,
		// The baseline stands half a cap height below the row's middle.
		y: caption.box.height / 2 + size * 0.35,
	};
	return farLayer(paintTextRuns([grown], caption.box, words.palette, words.fill));
}

export { MEMBERS_ATTRIBUTE, paintRegion };
