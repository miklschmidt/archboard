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
import { coord } from "@/transformers/semantic-renderer/lib/geometry";
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
import { stylesFor } from "@/transformers/semantic-renderer/lib/svg/styles";
import {
	PART_ATTRIBUTE,
	subjectGroup,
	type SubjectStanding,
} from "@/transformers/semantic-renderer/lib/svg/standing";

/** How heavy a lit lifeline is traced. */
const LIT_LIFELINE_WIDTH = 1.5;

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
 * One participant's column of time: the lifeline under its card, and the bars
 * marking where it is busy.
 *
 * It carries the participant's identity as its card does, so that selecting a
 * participant lights the whole height of the page it is involved in rather than
 * only the card at the top of it. The two groups are siblings rather than nested,
 * because a subject inside another subject is a click a viewer cannot resolve.
 *
 * Selected, the lifeline and its bars are traced in the selection's ink, rather
 * than ringed as one strip: a page with a few participants lit was a row of
 * tall capsules. A standing is the card's to say, and a removal ghosts the
 * column with it; the lifeline keeps its own ink either way.
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
	const own = sequenceStyles(palette);
	const { halo } = stylesFor(palette);
	const lifeline = {
		x1: coord(column.centreX),
		y1: coord(column.lifelineTop),
		x2: coord(column.centreX),
		y2: coord(layout.lifelineBottom),
	};
	// A bar reaches its corner radius past the call that starts it and the reply
	// that ends it, so both meet its straight side, not a rounded corner.
	const bars = column.activations.map((bar) => ({
		x: coord(column.centreX - ACTIVATION_HALF_WIDTH),
		y: coord(bar.top - ACTIVATION_RADIUS),
		width: ACTIVATION_HALF_WIDTH * 2,
		height: coord(bar.bottom - bar.top + ACTIVATION_RADIUS * 2),
		rx: ACTIVATION_RADIUS,
	}));
	return wrap(
		"g",
		{ ...subjectGroup("node", column.card.node.id, standing), [PART_ATTRIBUTE]: "lifeline" },
		lines([
			tag("line", { ...lifeline, ...own.lifeline }),
			tag("line", {
				class: "ab-halo",
				...lifeline,
				...own.lifeline,
				...halo,
				"stroke-width": LIT_LIFELINE_WIDTH,
			}),
			...bars.map((bar) => tag("rect", { ...bar, ...own.activation })),
			...bars.map((bar) => tag("rect", { class: "ab-halo", ...bar, ...halo })),
		]),
	);
}

export { paintColumn };
