// What each drawn thing looks like.
//
// Forked from PR Lens's `svg/styles.ts`. Everything keyed off a pull request's
// delta is gone. What replaces it is a two-axis grammar an agent can actually
// author: a line's **dash** says what sort of relationship it is, and its
// **weight** says how much attention the author asked for.
//
// Appearance lives on the elements rather than in the stylesheet, as it did
// upstream: each element says what it looks like, and its colours are CSS
// expressions of the page's tokens (`lib/theme.ts`), written where CSS applies
// to them (`lib/svg/primitives.ts`). The stylesheet carries the `@font-face`
// rules and what an element cannot say — the cursor, and the selection ring a
// viewer toggles.
//
// Every bundle that sets a size also sets a face, from the named roles in
// `lib/fonts.ts`, and the same role is what measured the string. That is the
// whole reason the roles exist: a bundle that carried a size but no face would
// let a painter and a measurement disagree about what they were talking about.

import type { EdgeEmphasis, SemanticEdge } from "@/shared/semantic-board/index";
import { DEFAULT_SEMANTIC_POLICY, type SemanticPolicy } from "@/shared/semantic-policy/index";
import { relationshipAppearance } from "@/transformers/semantic-renderer/lib/semantic-appearance";
import { semanticInk } from "@/transformers/semantic-renderer/lib/svg/appearance";
import { lightDark, mixed } from "@/transformers/semantic-renderer/lib/svg/colour";
import {
	HEADER_NAME_SIZE,
	HEADER_NAME_TRACKING,
	HEADER_NOTE_SIZE,
	LINE_STRENGTH,
	NOTE_SIZE,
	PILL_TEXT_SIZE,
} from "@/transformers/semantic-renderer/lib/design";
import {
	fontAttributes,
	CARD_NOTE_FONT,
	CARD_TITLE_FONT,
	HEADER_NAME_FONT,
	HEADER_NOTE_FONT,
	PILL_FONT,
} from "@/transformers/semantic-renderer/lib/fonts";
import type { Palette } from "@/transformers/semantic-renderer/lib/theme";
import type { Attributes } from "@/transformers/semantic-renderer/lib/svg/primitives";
import {
	standingInk,
	type SubjectStanding,
} from "@/transformers/semantic-renderer/lib/svg/standing";

/** How loudly a line speaks. */
type Weight = EdgeEmphasis;

/** Which arrowhead a line ends in. */
type Head = "filled" | "open";

const WEIGHTS: readonly Weight[] = ["hero", "normal", "muted"];

const STROKE_WIDTH: Readonly<Record<Weight, number>> = { hero: 2.2, normal: 1.4, muted: 1.2 };

/**
 * How long an arrowhead of each weight is, from its base to its tip, in the
 * page's units. Every board and every sequence draws its heads from this.
 *
 * A default head is as long as a hero's (TASK-403). A smaller one left the
 * reader to guess which way most lines run. The hero line still speaks louder
 * by its width. A muted head keeps the size it had, so the quietest line is
 * still told apart from a default one at a glance.
 */
const HEAD_LENGTH: Readonly<Record<Weight, number>> = { hero: 11, normal: 11, muted: 6 };

/**
 * How big an arrowhead of a weight is drawn, in widths of its line: a marker
 * is drawn in the units of the line that ends in it.
 * @param weight How loudly the line speaks.
 * @returns The marker's side, in line widths.
 */
function headWidths(weight: Weight): number {
	return HEAD_LENGTH[weight] / STROKE_WIDTH[weight];
}

/**
 * Where on its ten-unit drawing each head sits on the end of its line. The open
 * head anchors at its tip so the line runs all the way into the point; the
 * filled one two units back, so its body covers the line's round cap.
 */
const HEAD_REF_X: Readonly<Record<Head, number>> = { filled: 8, open: 10 };

/**
 * How far an arrowhead's tip lies past the end of its line. A line that must
 * touch something with its tip stops exactly this far short of it.
 * @param head Which form.
 * @param weight How loudly the line speaks.
 * @returns The distance, in the page's units.
 */
function headReach(head: Head, weight: Weight): number {
	return ((10 - HEAD_REF_X[head]) / 10) * HEAD_LENGTH[weight];
}

/**
 * How far back from the end of its line an arrowhead's base lies: what a mark
 * that rides the line must stop short of, so it never covers the head.
 * @param head Which form.
 * @param weight How loudly the line speaks.
 * @returns The distance, in the page's units.
 */
function headBase(head: Head, weight: Weight): number {
	return (HEAD_REF_X[head] / 10) * HEAD_LENGTH[weight];
}

/**
 * The ink a line and its arrowhead are drawn in; its pulses carry the same
 * colour at full strength (`fullLineColour`).
 *
 * A relationship that stands for something takes the standing's ink; everything
 * else is drawn in the neutral relationship ink. One colour, asked for by all three, so
 * a changed relationship cannot end up amber in one of them and grey in the
 * other two — which is exactly what it did, and it read as a coloured glow
 * behind a line that had nothing to do with it.
 *
 * What the standing does NOT take over is the line's dash or its weight. Those
 * are the two things the line already says — what sort of relationship it is,
 * and how much attention its author asked for — and a standing that spent
 * either would be answering a question nobody asked at the cost of one somebody
 * did.
 * @param palette The theme's colours.
 * @param standing How it stands, when this is a proposal and it moved.
 * @returns The stroke colour.
 */
function lineColour(palette: Palette, standing: SubjectStanding | undefined): string {
	return drawnInk(fullLineColour(palette, standing), palette);
}

/**
 * The colour a line stands for at full strength: the standing's, or the
 * neutral relationship ink. The line itself is drawn weaker (`drawnInk`); the
 * pulses that ride it carry this.
 * @param palette The theme's colours.
 * @param standing How it stands, when this is a proposal and it moved.
 * @returns The colour.
 */
function fullLineColour(palette: Palette, standing: SubjectStanding | undefined): string {
	const marked = standing === undefined ? undefined : standingInk(standing, palette);
	return marked ?? palette.edge;
}

/**
 * How strong a removed line's ink is over the page, on each ground: with its
 * group's ghosting, 3:1 on every ground it crosses, as a mark that says
 * something must be, and fainter than the reds of the pin and the footprint.
 */
const REMOVED_STRENGTH = { light: 0.85, dark: 1 } as const;

/**
 * The colour a line is drawn in, from the colour it stands for: a coloured line
 * at three quarters of its colour over the page, so the pulses riding it stand
 * out at full strength; the neutral line as it is. Mixed rather than made
 * translucent, so two lines sharing a lane draw no darker where they overlap.
 * A removed line carries no pulses and its group is ghosted already
 * (`ghostOpacity`), so its ink is weakened less ({@link REMOVED_STRENGTH}).
 * @param ink The colour at full strength.
 * @param palette The theme's colours.
 * @returns The line's colour.
 */
function drawnInk(ink: string, palette: Palette): string {
	if (ink === palette.edge) return ink;
	if (ink === palette.standingRemoved) {
		return lightDark(
			mixed(palette.background, ink, REMOVED_STRENGTH.light),
			mixed(palette.background, ink, REMOVED_STRENGTH.dark),
		);
	}
	return mixed(palette.background, ink, LINE_STRENGTH);
}

/**
 * The colour a relationship stands for at full strength: its standing's when it
 * moved, its kind's configured colour, or the neutral relationship ink.
 * @param edge The relationship.
 * @param palette The theme's colours.
 * @param standing How it stands, when this is a proposal and it moved.
 * @param policy Current vault policy.
 * @param appearance The line's appearance, when it is not the kind's (a flow step drawn on the board).
 * @returns The colour.
 */
function relationshipInk(
	edge: SemanticEdge,
	palette: Palette,
	standing?: SubjectStanding,
	policy: SemanticPolicy = DEFAULT_SEMANTIC_POLICY,
	appearance = relationshipAppearance(edge.kind, policy),
): string {
	const marked = standing === undefined ? undefined : standingInk(standing, palette);
	return marked ?? semanticInk(appearance.color) ?? palette.edge;
}

/**
 * How loudly one edge speaks.
 * @param edge The relationship.
 * @returns Its weight.
 */
function weightOf(edge: SemanticEdge): Weight {
	return edge.emphasis;
}

/**
 * The marker reference for one arrowhead.
 *
 * The head is part of the line, so it is drawn in the line's ink: one marker
 * per form, per weight, and per standing that has an ink of its own. An
 * unmarked line keeps the id it always had, which is what keeps a board that is
 * not a proposal drawing the same bytes.
 * @param weight How loudly the line speaks.
 * @param head Which form.
 * @param standing How the line stands, when this is a proposal and it moved.
 * @returns The `marker-end` value.
 */
function markerFor(weight: Weight, head: Head, standing?: SubjectStanding): string {
	const marked = standing === undefined || standing === "unchanged" ? "" : `-${standing}`;
	return `url(#ah-${head}-${weight}${marked})`;
}

/** The suffix of the arrowhead drawn in the selection's ink, for a lit line. */
const LIT_HEAD = "-lit";

/**
 * The marker reference for the arrowhead a lit line ends in.
 * @param weight How loudly the line speaks.
 * @param head Which form.
 * @returns The `marker-end` value.
 */
function litMarkerFor(weight: Weight, head: Head): string {
	return `url(#ah-${head}-${weight}${LIT_HEAD})`;
}

/**
 * How thick one edge's line is drawn.
 * @param edge The relationship.
 * @returns Its stroke width.
 */
function strokeWidthOf(edge: SemanticEdge): number {
	return STROKE_WIDTH[weightOf(edge)];
}

/**
 * How one edge's line is stroked.
 * @param edge The relationship.
 * @param palette The theme's colours.
 * @param standing How it stands, when this is a proposal and it moved.
 * @param policy Current vault policy.
 * @param appearance The line's appearance, when it is not the kind's (a flow step drawn on the board).
 * @returns The path's attributes.
 */
function edgeAttributes(
	edge: SemanticEdge,
	palette: Palette,
	standing?: SubjectStanding,
	policy: SemanticPolicy = DEFAULT_SEMANTIC_POLICY,
	appearance = relationshipAppearance(edge.kind, policy),
): Attributes {
	const weight = weightOf(edge);
	return {
		fill: "none",
		stroke: drawnInk(relationshipInk(edge, palette, standing, policy, appearance), palette),
		"stroke-width": STROKE_WIDTH[weight],
		"stroke-linecap": "round",
		"stroke-linejoin": "round",
		"stroke-dasharray": { solid: undefined, dashed: "6 4", dotted: "1.5 3.5" }[appearance.dash],
	};
}

/**
 * Every attribute bundle the painter reaches for, resolved against one palette.
 * @param palette The theme's colours.
 * @returns The bundles.
 */
function stylesFor(palette: Palette) {
	return {
		// A flow's heading. A card, a container and a flow's frame are blocks (`slab.ts`).
		headerName: {
			"font-size": HEADER_NAME_SIZE,
			"letter-spacing": `${HEADER_NAME_TRACKING}em`,
			fill: palette.muted,
			...fontAttributes(HEADER_NAME_FONT),
		},
		headerNote: {
			"font-size": HEADER_NOTE_SIZE,
			fill: palette.faint,
			...fontAttributes(HEADER_NOTE_FONT),
		},
		title: { fill: palette.foreground, ...fontAttributes(CARD_TITLE_FONT) },
		note: { "font-size": NOTE_SIZE, fill: palette.muted, ...fontAttributes(CARD_NOTE_FONT) },
		pillText: {
			"font-size": PILL_TEXT_SIZE,
			fill: palette.pillText,
			...fontAttributes(PILL_FONT),
		},
		halo: { fill: "none", stroke: palette.selection },
	};
}

/** The bundles the painter reaches for. */
type SvgStyles = ReturnType<typeof stylesFor>;

export {
	type Weight,
	type Head,
	type SvgStyles,
	WEIGHTS,
	lineColour,
	drawnInk,
	fullLineColour,
	relationshipInk,
	weightOf,
	markerFor,
	litMarkerFor,
	LIT_HEAD,
	strokeWidthOf,
	edgeAttributes,
	stylesFor,
	headReach,
	headBase,
	headWidths,
	HEAD_REF_X,
	HEAD_LENGTH,
	STROKE_WIDTH,
};
