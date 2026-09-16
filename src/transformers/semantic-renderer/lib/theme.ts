import { themeColor } from "@/transformers/semantic-renderer/lib/host";
import type { DiagramTheme } from "@/shared/semantic-board/index";

// SVG roles resolve the same CSS tokens as the shell, with export-safe literals.

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
 * Map diagram roles onto the canonical shadcn theme, without a second palette.
 * @param theme Which ground to draw on.
 * @returns Literal sRGB colors, including transparency where the token has it.
 */
function paletteFor(theme: DiagramTheme): Palette {
	return {
		ground: theme,
		background: themeColor(theme, "--background"),
		band: themeColor(theme, "--sidebar"),
		bandBorder: themeColor(theme, "--sidebar-border"),
		card: themeColor(theme, "--muted"),
		cardBorder: themeColor(theme, "--diagram-edge"),
		foreground: themeColor(theme, "--card-foreground"),
		muted: themeColor(theme, "--muted-foreground"),
		faint: themeColor(theme, "--muted-foreground"),
		edge: themeColor(theme, "--diagram-edge"),
		edgeMuted: themeColor(theme, "--muted-foreground"),
		chip: themeColor(theme, "--muted"),
		glyph: themeColor(theme, "--muted-foreground"),
		pill: themeColor(theme, "--popover"),
		pillBorder: themeColor(theme, "--diagram-edge"),
		pillText: themeColor(theme, "--popover-foreground"),
		selection: themeColor(theme, "--diagram-selection"),
		warning: themeColor(theme, theme === "light" ? "--warning-foreground" : "--warning"),
		standingAdded: themeColor(theme, "--standing-added"),
		standingChanged: themeColor(theme, "--standing-changed"),
		standingRemoved: themeColor(theme, "--standing-removed"),
	};
}

export { type Palette, paletteFor };
