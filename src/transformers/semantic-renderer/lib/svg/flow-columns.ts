// A participant's column of time: the lifeline under its card, and the bars
// marking where it is busy.
//
// Apart from the message painter beside it because it answers a different
// question — where a participant IS through the exchange, rather than what
// crosses between them — and because a file that draws both outgrew what one
// file of this repository may be.

import {
	ACTIVATION_HALF_WIDTH,
	ACTIVATION_RADIUS,
	LIFELINE_DASH,
} from "@/transformers/semantic-renderer/lib/sequence-design";
import { coord, type Box } from "@/transformers/semantic-renderer/lib/geometry";
import type {
	FlowLayout,
	PlacedColumn,
} from "@/transformers/semantic-renderer/lib/layout/dataflow";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import {
	lines,
	tag,
	wrap,
	type Attributes,
} from "@/transformers/semantic-renderer/lib/svg/primitives";
import {
	standingOutline,
	subjectGroup,
	type SubjectStanding,
} from "@/transformers/semantic-renderer/lib/svg/standing";
import { stylesFor } from "@/transformers/semantic-renderer/lib/svg/styles";
import { halo } from "@/transformers/semantic-renderer/lib/svg/cards";

/**
 * A lifeline is the passage of time under a participant, not a connection it
 * has. Dashed and in the faintest ink the ground allows, so that a page of them
 * stays a backdrop rather than competing with the messages crossing it. An
 * activation bar is drawn on the card's own ground, so that it reads as the
 * participant itself standing in its column.
 * @param palette The theme's colours.
 * @returns The two bundles this grammar adds to the shared ones.
 */
function sequenceStyles(palette: Palette): {
	readonly lifeline: Attributes;
	readonly activation: Attributes;
} {
	return {
		lifeline: {
			stroke: palette.edgeMuted,
			"stroke-width": 1,
			"stroke-dasharray": LIFELINE_DASH,
		},
		activation: { fill: palette.card, stroke: palette.cardBorder, "stroke-width": 1 },
	};
}

/**
 * The strip of page one participant's column of time occupies: its lifeline and
 * every bar on it.
 * @param column The column.
 * @param layout The flow it belongs to.
 * @returns The strip.
 */
function columnStrip(column: PlacedColumn, layout: FlowLayout): Box {
	return {
		x: column.centreX - ACTIVATION_HALF_WIDTH,
		y: layout.lifelineTop,
		width: ACTIVATION_HALF_WIDTH * 2,
		height: layout.lifelineBottom - layout.lifelineTop,
	};
}

/**
 * One participant's column of time: the lifeline under its card, and the bars
 * marking where it is busy.
 *
 * It carries the participant's identity as its card does, so that selecting a
 * participant lights the whole height of the page it is involved in rather than
 * only the card at the top of it. The two groups are siblings rather than nested,
 * because a subject inside another subject is a click a viewer cannot resolve.
 * @param column The column.
 * @param layout The flow it belongs to.
 * @param palette The theme's colours.
 * @param standing How this participant stands against the variant it came from, when the caller said.
 * @returns The column's group.
 */
function paintColumn(
	column: PlacedColumn,
	layout: FlowLayout,
	palette: Palette,
	standing: SubjectStanding | undefined,
): string {
	const styles = stylesFor(palette);
	const own = sequenceStyles(palette);
	// The lifeline takes the standing's ink but keeps its own dash, which is this
	// grammar's signature for the passage of time rather than a kind of anything.
	// It is what makes a participant's standing read all the way down the page
	// instead of only at the card on top of it.
	const ink = standingOutline(standing, palette)["stroke"];
	return wrap(
		"g",
		subjectGroup("node", column.card.node.id, standing),
		lines([
			halo(columnStrip(column, layout), ACTIVATION_RADIUS, styles),
			tag("line", {
				x1: coord(column.centreX),
				y1: coord(layout.lifelineTop),
				x2: coord(column.centreX),
				y2: coord(layout.lifelineBottom),
				...own.lifeline,
				stroke: ink ?? own.lifeline["stroke"],
			}),
			...column.activations.map((bar) =>
				tag("rect", {
					x: coord(column.centreX - ACTIVATION_HALF_WIDTH),
					y: coord(bar.top),
					width: ACTIVATION_HALF_WIDTH * 2,
					height: coord(bar.bottom - bar.top),
					rx: ACTIVATION_RADIUS,
					...own.activation,
				}),
			),
		]),
	);
}

export { columnStrip, paintColumn, sequenceStyles };
