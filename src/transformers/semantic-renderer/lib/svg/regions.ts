// Group regions (TASK-347): the cards one group places inside one container,
// on a faint band of the group's colour with the group's name in its corner.
// A band is a backdrop, never an obstacle: lines cross it, and it takes no
// pointer, so whatever lies on it is picked as before.
import type { SemanticPolicy } from "@/shared/semantic-policy/index";
import { BAND_RADIUS } from "@/transformers/semantic-renderer/lib/design";
import type { DrawingRegion } from "@/transformers/semantic-renderer/lib/drawing";
import { coord } from "@/transformers/semantic-renderer/lib/geometry";
import { fontAttributes } from "@/transformers/semantic-renderer/lib/fonts";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { semanticInk } from "@/transformers/semantic-renderer/lib/svg/appearance";
import { mixed } from "@/transformers/semantic-renderer/lib/svg/colour";
import { lines, tag, textNode, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";

/** How much of the group's colour the band carries over the page. */
const BAND_TINT = 0.08;
/** How much of the group's colour the band's edge carries. */
const EDGE_TINT = 0.32;
/** How far the caption's words lean from the group's colour toward the text colour. */
const CAPTION_DEPTH = 0.35;

/**
 * Paint one group's region: its band and its caption.
 * @param region The region.
 * @param palette The page's colours.
 * @param policy The vault's policy, for the group's colour.
 * @returns The region's SVG.
 */
function paintRegion(region: DrawingRegion, palette: Palette, policy: SemanticPolicy): string {
	const ink = semanticInk(policy.groups[region.group]?.color) ?? palette.muted;
	const { box, caption } = region;
	return wrap(
		"g",
		{
			"data-semantic-kind": "group-region",
			"data-group": region.group,
			"pointer-events": "none",
		},
		lines([
			tag("rect", {
				x: coord(box.x),
				y: coord(box.y),
				width: coord(box.width),
				height: coord(box.height),
				rx: BAND_RADIUS,
				fill: mixed(palette.background, ink, BAND_TINT),
				stroke: mixed(palette.background, ink, EDGE_TINT),
				"stroke-width": 1,
			}),
			...caption.measured.runs.map((run) =>
				textNode(
					{
						"xml:space": "preserve",
						x: coord(caption.box.x + run.x),
						y: coord(caption.box.y + run.y),
						fill: mixed(ink, palette.foreground, CAPTION_DEPTH),
						...fontAttributes(run.font),
						"font-size": run.fontSize,
					},
					run.text,
				),
			),
		]),
	);
}

export { paintRegion };
