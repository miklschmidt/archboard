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
	BAR_THICKNESS,
	LIFELINE_DASH,
} from "@/transformers/semantic-renderer/lib/sequence-design";
import { coord } from "@/transformers/semantic-renderer/lib/geometry";
import type {
	FlowLayout,
	PlacedColumn,
} from "@/transformers/semantic-renderer/lib/layout/dataflow";
import type { NodeAppearance } from "@/transformers/semantic-renderer/lib/semantic-appearance";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import { cardLook, semanticInk } from "@/transformers/semantic-renderer/lib/svg/appearance";
import { lightDark, mixed } from "@/transformers/semantic-renderer/lib/svg/colour";
import { lines, tag, wrap } from "@/transformers/semantic-renderer/lib/svg/primitives";
import {
	slab,
	slabShadow,
	tinted,
	type Share,
	type SlabLook,
} from "@/transformers/semantic-renderer/lib/svg/slab";
import { stylesFor } from "@/transformers/semantic-renderer/lib/svg/styles";
import {
	PART_ATTRIBUTE,
	ghostOpacity,
	subjectGroup,
	type SubjectStanding,
} from "@/transformers/semantic-renderer/lib/svg/standing";

/** How heavy a lit lifeline is traced. */
const LIT_LIFELINE_WIDTH = 1.5;

/**
 * How far a bar's face is shaded toward its front edge on the light ground,
 * where a card's own near-white face would vanish into the frame's.
 */
const BAR_SHADE = 0.4;

/**
 * A bar of a participant in no group, which has no colour to carry it: its
 * face shaded toward the secondary ink until it reads at about 2:1 on the
 * frame's face, as a grouped bar's pale tint does, and its front edge a clear
 * step deeper. A bar says nothing its arrows do not, so it stays quiet.
 */
const NEUTRAL_BAR: Share = { light: 0.5, dark: 0.25 };
const NEUTRAL_BAR_EDGE: Share = { light: 0.3, dark: 0.5 };

/**
 * A participant's activation bar: a slim slab of the participant itself,
 * standing on its lifeline, with its card's front edge and its card's face,
 * shaded on the light ground, so the bar reads as the participant standing in
 * its column.
 * @param appearance The participant's resolved channels.
 * @param palette The theme's colours.
 * @returns The bar's look.
 */
function barLook(appearance: NodeAppearance, palette: Palette): SlabLook {
	const shape = { thickness: BAR_THICKNESS, radius: ACTIVATION_RADIUS, sheen: false };
	if (semanticInk(appearance.bodyColor) === undefined) {
		const face = tinted(palette.slabFace, palette.muted, NEUTRAL_BAR);
		return {
			...shape,
			face,
			edge: lightDark(
				mixed(face, palette.foreground, NEUTRAL_BAR_EDGE.light),
				mixed(face, palette.slabDeep, NEUTRAL_BAR_EDGE.dark),
			),
		};
	}
	const card = cardLook(appearance, palette);
	return {
		...shape,
		face: lightDark(mixed(card.face, card.edge, BAR_SHADE), card.face),
		edge: card.edge,
	};
}

/**
 * One participant's column of time: the lifeline under its card, and the bars
 * marking where it is busy.
 *
 * A lifeline is the passage of time under a participant, not a connection it
 * has. Dashed and in the faintest ink the ground allows, so that a page of them
 * stays a backdrop rather than competing with the messages crossing it.
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
 * @param look The theme's colours, and the participant's resolved channels.
 * @param look.palette The theme's colours.
 * @param look.appearance The participant's resolved channels.
 * @param standing How this participant stands against the variant it came from, when the caller said.
 * @returns The column's group.
 */
function paintColumn(
	column: PlacedColumn,
	layout: FlowLayout,
	{ palette, appearance }: { palette: Palette; appearance: NodeAppearance },
	standing: SubjectStanding | undefined,
): string {
	const { halo } = stylesFor(palette);
	const lifeline = {
		x1: coord(column.centreX),
		y1: coord(column.lifelineTop),
		x2: coord(column.centreX),
		y2: coord(layout.lifelineBottom),
		stroke: palette.edgeMuted,
		"stroke-width": 1,
		"stroke-dasharray": LIFELINE_DASH,
	};
	// A bar reaches its corner radius past the call that starts it and the reply
	// that ends it, so both meet its straight side, not a rounded corner.
	const bars = column.activations.map((bar) => ({
		x: column.centreX - ACTIVATION_HALF_WIDTH,
		y: bar.top - ACTIVATION_RADIUS,
		width: ACTIVATION_HALF_WIDTH * 2,
		height: bar.bottom - bar.top + ACTIVATION_RADIUS * 2,
	}));
	const look = barLook(appearance, palette);
	return wrap(
		"g",
		{
			...subjectGroup("node", column.card.node.id, standing),
			opacity: ghostOpacity(standing),
			[PART_ATTRIBUTE]: "lifeline",
		},
		lines([
			tag("line", lifeline),
			tag("line", { class: "ab-halo", ...lifeline, ...halo, "stroke-width": LIT_LIFELINE_WIDTH }),
			...bars.map(
				(bar) => slabShadow(bar, ACTIVATION_RADIUS, "chip", palette) + slab(bar, look, palette),
			),
			...bars.map((bar) =>
				tag("rect", {
					class: "ab-halo",
					x: coord(bar.x),
					y: coord(bar.y),
					width: coord(bar.width),
					height: coord(bar.height),
					rx: ACTIVATION_RADIUS,
					...halo,
				}),
			),
		]),
	);
}

export { paintColumn };
