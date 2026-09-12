import type { DiagramTheme } from "@/shared/semantic-board/index";
// Every colour the renderer can paint, resolved to a literal.
//
// PR Lens's palette was GitHub's, and every hue in it said what a pull request
// had done to a file. This one is built from Archboard's own operator shell
// instead, so a rendered board sits beside the chrome around it rather than
// looking like a screenshot from another product.
//
// The one place a hue still carries meaning is a proposal's standing against
// the variant it came from, and those three are the last entries here. They are
// deliberately the only saturated ink in the picture, they are never the whole
// of what says a subject changed — `lib/svg/standing.ts` sets out the shape and
// lightness channels that carry it without them — and they are picked dark
// against the light grounds and bright against the dark ones, so that the page
// ground is legible knocked out of any of the six.
//
// The values were converted from the shell's own tokens in
// `src/ui/theme/app.css`: `--background`, `--card`, `--sidebar`, `--foreground`,
// `--muted-foreground`, `--border` and `--primary`, in both themes. The shell's
// two accents keep the jobs they have there — cobalt `#155eef` is selection,
// acid lime is live status and so appears nowhere in a static picture. What is
// left is a diagram drawn in ink and paper, which is what
// `docs/design/operator-canvas-shell.md` asks for: flat, dense, one-pixel
// rules, small radii, no gradient and no glow.
//
// Emphasis therefore has no colour of its own. A hero edge is drawn in ink at a
// heavier weight and a muted one in the faintest grey the ground allows, which
// is a hierarchy that survives both themes and does not compete with selection.

/** One theme's resolved colours. */
interface Palette {
	/**
	 * Which ground this palette is for.
	 *
	 * Here so that a colour derived from something the board says — a group
	 * label's — can be resolved from the palette alone, rather than by threading
	 * the theme past every painter that does not care about it. A palette IS a
	 * theme resolved, so it is the honest place to ask.
	 */
	readonly ground: DiagramTheme;
	/** The page behind everything. */
	readonly background: string;
	/** A region band's fill. */
	readonly band: string;
	/** A region band's one-pixel rule. */
	readonly bandBorder: string;
	/** A card's fill. */
	readonly card: string;
	/** A card's one-pixel rule. */
	readonly cardBorder: string;
	/** Text that carries the meaning: a card's name. */
	readonly foreground: string;
	/** Secondary text: a responsibility, a region name. */
	readonly muted: string;
	/** The quietest readable text on this ground. */
	readonly faint: string;
	/** An ordinary connection. */
	readonly edge: string;
	/** A connection asking for attention. */
	readonly edgeHero: string;
	/** A connection deliberately pushed into the background. */
	readonly edgeMuted: string;
	/** The tile a kind glyph sits on. */
	readonly chip: string;
	/** A kind glyph. */
	readonly glyph: string;
	/** A label pill's fill, opaque so it can be read wherever it lands. */
	readonly pill: string;
	/** A label pill's rule. */
	readonly pillBorder: string;
	/** A label pill's text. */
	readonly pillText: string;
	/** The ring around whatever the person has selected. */
	readonly selection: string;
	/**
	 * The mark on a subject whose reconciliation nobody has decided yet.
	 *
	 * The shell's own warning pair, each ground taking the token that is meant to
	 * be read ON that ground: `--warning` carries a dark panel, and
	 * `--warning-foreground` is the one the shell uses for warning text on paper.
	 * The badge needs the second on the light ground — at eleven units with the
	 * page knocked out of it, the panel token reached only 2.5:1 against a white
	 * card and 2.3:1 against its own mark, which is a badge a reader has to hunt
	 * for. This one clears 3:1 against every surface it can land on and 4.5:1
	 * against the mark inside it.
	 *
	 * It is not one of the three standings and must not be read as one. What
	 * tells them apart is the badge's silhouette and the corner it sits in; the
	 * hue is the third thing rather than the first, which is why darkening it
	 * costs nothing that mattered.
	 */
	readonly warning: string;
	/** A subject this proposal has that the variant it came from did not. */
	readonly standingAdded: string;
	/** The same subject, saying something different. */
	readonly standingChanged: string;
	/** A subject the predecessor had that this proposal does not. */
	readonly standingRemoved: string;
}

/**
 * Chalk white cards on pale stone bands on a warm paper ground, near-black ink,
 * cobalt selection.
 *
 * Three values, in that order, are what make the picture legible without a
 * single shadow: a card is the lightest thing on the page, the band it sits in
 * is a step down, and the page behind both is a step down again. PR Lens got
 * the same separation out of drop shadows and a dot grid, which the operator
 * shell does not use.
 */
const LIGHT: Palette = {
	ground: "light",
	background: "#f6f5f2",
	band: "#edece7",
	bandBorder: "#dedcd5",
	card: "#ffffff",
	cardBorder: "#cdcbc5",
	foreground: "#141414",
	muted: "#5c5c59",
	faint: "#83827e",
	edge: "#7c7c78",
	edgeHero: "#2a2a28",
	edgeMuted: "#b4b3ae",
	chip: "#f0efeb",
	glyph: "#5c5c59",
	pill: "#ffffff",
	pillBorder: "#d6d4ce",
	pillText: "#43433f",
	selection: "#155eef",
	warning: "#6e4a00",
	standingAdded: "#1e7a4a",
	standingChanged: "#9a5a06",
	standingRemoved: "#a8322a",
};

/** Deep charcoal cards on black panels, bone-white ink, the same cobalt. */
const DARK: Palette = {
	ground: "dark",
	background: "#141517",
	band: "#0b0c0e",
	bandBorder: "#2a2b2e",
	card: "#232528",
	cardBorder: "#3a3c40",
	foreground: "#f2f1ee",
	muted: "#a6a6a3",
	faint: "#82827f",
	edge: "#797a7d",
	edgeHero: "#e4e3e0",
	edgeMuted: "#44464a",
	chip: "#2e3033",
	glyph: "#a6a6a3",
	pill: "#232528",
	pillBorder: "#3a3c40",
	pillText: "#bcbbb8",
	selection: "#4d86ff",
	warning: "#d29a1e",
	standingAdded: "#4ec98c",
	standingChanged: "#dda24a",
	standingRemoved: "#e8756a",
};

/**
 * The palette for a theme.
 * @param theme Which ground the picture is drawn on.
 * @returns Its colours.
 */
function paletteFor(theme: DiagramTheme): Palette {
	return theme === "dark" ? DARK : LIGHT;
}

export { type Palette, paletteFor };
