// What each drawn thing looks like.
//
// Forked from PR Lens's `svg/styles.ts`. Everything keyed off a pull request's
// delta is gone. What replaces it is a two-axis grammar an agent can actually
// author: a line's **dash** says what sort of relationship it is, and its
// **weight** says how much attention the author asked for.
//
// Appearance lives on the elements rather than in the stylesheet, as it did
// upstream, and for a reason that still holds: the same string is shown in a
// pane, saved to a file and opened in whatever a person opens an SVG with.
// The stylesheet carries the `@font-face` rules and what an attribute cannot
// say — the cursor, and the selection ring a viewer toggles.
//
// Every bundle that sets a size also sets a face, from the named roles in
// `lib/fonts.ts`, and the same role is what measured the string. That is the
// whole reason the roles exist: a bundle that carried a size but no face would
// let a painter and a measurement disagree about what they were talking about.

import type { EdgeEmphasis, SemanticEdge } from "@/shared/semantic-board/index";
import { DEFAULT_SEMANTIC_POLICY, type SemanticPolicy } from "@/shared/semantic-policy/index";
import { relationshipAppearance } from "@/transformers/semantic-renderer/lib/semantic-appearance";
import { semanticInk } from "@/transformers/semantic-renderer/lib/svg/appearance";
import {
	HEADER_NAME_SIZE,
	HEADER_NAME_TRACKING,
	HEADER_NOTE_SIZE,
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
 * The ink a line, its arrowhead and its dots are all drawn in.
 *
 * A relationship that stands for something takes the standing's ink; everything
 * else is drawn in the neutral relationship ink. One function, asked by all three, so
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
	const marked = standing === undefined ? undefined : standingInk(standing, palette);
	return marked ?? palette.edge;
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
	const ink = semanticInk(appearance.color, palette) ?? palette.edge;
	return {
		fill: "none",
		stroke: (standing === undefined ? undefined : standingInk(standing, palette)) ?? ink,
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
		band: { fill: palette.band, stroke: palette.bandBorder, "stroke-width": 1 },
		// A container inside a container, drawn on the page's own ground. That
		// puts the surfaces in order in both themes — column darkest, then the
		// box inside it, then the card — without inventing a fourth colour that
		// would have to be tuned twice.
		nest: { fill: palette.background, stroke: palette.bandBorder, "stroke-width": 1 },
		card: { fill: palette.card, stroke: palette.cardBorder, "stroke-width": 1 },
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
		headerRule: { stroke: palette.bandBorder, "stroke-width": 1 },
		title: { fill: palette.foreground, ...fontAttributes(CARD_TITLE_FONT) },
		note: { "font-size": NOTE_SIZE, fill: palette.muted, ...fontAttributes(CARD_NOTE_FONT) },
		chip: { fill: palette.chip },
		glyph: { fill: palette.glyph },
		glyphStroke: { stroke: palette.glyph, "stroke-width": 1.3, fill: "none" },
		pill: { fill: palette.pill, stroke: palette.pillBorder, "stroke-width": 1 },
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
	weightOf,
	markerFor,
	strokeWidthOf,
	edgeAttributes,
	stylesFor,
	STROKE_WIDTH,
};
