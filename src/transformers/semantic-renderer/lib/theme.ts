import { lightDark } from "@/transformers/semantic-renderer/lib/svg/colour";

// SVG roles paint with the same CSS tokens as the shell.

/** The picture's colours, each a CSS expression of the page's tokens. */
interface Palette {
	/** The page behind everything. */
	readonly background: string;
	/** A card's top face, before its group tints it (`lib/svg/slab.ts`). */
	readonly slabFace: string;
	/** A card's front edge, the thickness that shows along its foot. */
	readonly slabEdge: string;
	/** What a group's colour is shaded into for the front edge of a card or a label. */
	readonly slabDeep: string;
	/** What the fine highlight along the top edge of a face mixes toward. */
	readonly slabGlint: string;
	/** The light at the top of a face, which falls off down it. */
	readonly slabSheen: string;
	/** One layer of the stacked shadow a part casts. */
	readonly slabShadow: string;
	/** A container's top face at the top level. */
	readonly plinthFace: string;
	/** What a nested container's face rises toward, a step for each level. */
	readonly plinthRise: string;
	/** The nameplate across the top of a container's face, before its kind tints it. */
	readonly plinthHead: string;
	/** A container's front edge. */
	readonly plinthEdge: string;
	/** What a group's region mixes its colour into for its face. */
	readonly matFace: string;
	/** What a group's region mixes its colour into for its front edge. */
	readonly matEdge: string;
	/** Text that carries the meaning: a card's name. */
	readonly foreground: string;
	/** Secondary text: a responsibility, a region name. */
	readonly muted: string;
	/** An ordinary connection. */
	readonly edge: string;
	/** A connection deliberately pushed into the background. */
	readonly edgeMuted: string;
	/** A kind glyph. */
	readonly glyph: string;
	/** A label chip's face, opaque so it can be read wherever it lands. */
	readonly pill: string;
	/** A label chip's text. */
	readonly pillText: string;
	/** The ring around whatever the person has selected. */
	readonly selection: string;
	/**
	 * The mark on a subject whose reconciliation nobody has decided yet.
	 *
	 * The shell's own warning pair, each ground taking the token that is meant to
	 * be read ON that ground: `--warning` carries a dark panel, and
	 * `--warning-foreground` is the one the shell uses for warning text on paper.
	 * Which ground it is, is the page's `color-scheme`, so the choice is CSS's.
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
	/** A subject the variant it is read against has and this one does not. */
	readonly standingRemoved: string;
}

/**
 * One page token, as the picture paints with it.
 * @param name The CSS custom property.
 * @returns Its reference.
 */
function token(name: string): string {
	return `var(${name})`;
}

/**
 * Diagram roles mapped onto the canonical shadcn theme, without a second
 * palette: each is a page token, so the picture takes whichever theme the page
 * showing it is in, and a document that stands alone carries the values of the
 * tokens it names (`lib/svg/document.ts`).
 */
const PALETTE: Palette = {
	background: token("--background"),
	slabFace: token("--slab-face"),
	slabEdge: token("--slab-edge"),
	slabDeep: token("--slab-deep"),
	slabGlint: token("--slab-glint"),
	slabSheen: token("--slab-sheen"),
	slabShadow: token("--slab-shadow"),
	plinthFace: token("--plinth-face"),
	plinthRise: token("--plinth-rise"),
	plinthHead: token("--plinth-head"),
	plinthEdge: token("--plinth-edge"),
	matFace: token("--mat-face"),
	matEdge: token("--mat-edge"),
	foreground: token("--card-foreground"),
	muted: token("--muted-foreground"),
	edge: token("--diagram-edge"),
	edgeMuted: token("--muted-foreground"),
	glyph: token("--muted-foreground"),
	pill: token("--popover"),
	pillText: token("--popover-foreground"),
	selection: token("--diagram-selection"),
	warning: lightDark(token("--warning-foreground"), token("--warning")),
	standingAdded: token("--standing-added"),
	standingChanged: token("--standing-changed"),
	standingRemoved: token("--standing-removed"),
};

export { type Palette, PALETTE, token };
