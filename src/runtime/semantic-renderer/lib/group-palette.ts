// The colours a group is drawn in, and the only file to edit to change them.
//
// ## Editing this
//
// `GROUP_COLOURS` is a plain list of light/dark pairs. Retune one, reorder them,
// add a pair or take one away: nothing else in the repository holds a group
// colour, no board stores one, and no comparison can see one, so an edit here
// changes what a picture looks like and nothing at all about what it says. The
// mapping below is what turns a label into an index into this list, and it is
// deliberately a separate question from what the colours are.
//
// Each pair is one hue picked twice rather than one hue reused: a colour that
// carries a 200-nit card on white paper and one that carries a charcoal card on
// black are not the same colour, and a single value tuned for either ground is
// muddy on the other. They are stated as literals for the same reason the rest
// of the palette is — the picture is a file that may outlive this process, and a
// token it cannot resolve is a colour it does not have.
//
// ## What these must not collide with
//
// Nothing here may be mistaken for the ink that means a change: green added,
// amber changed, red removed, and the shell's amber warning. A group is not a
// status and must never read as one, so the list stays away from those hues —
// there is no green and no red in it, and its yellows are cool rather than
// amber. Cobalt is out too: that is selection.

/** One group colour, picked for each ground. */
interface GroupColour {
	/** On the light ground. */
	readonly light: string;
	/** On the dark one. */
	readonly dark: string;
}

/**
 * The curated pairs, in the order a label lands on them.
 *
 * Ten, which is a compromise between two costs. A reader can hold about that
 * many families in their head at once, and a longer list buys distinctions
 * nobody can make — two adjacent violets say "these are different" while
 * looking like a printing error. A shorter one collides too often: with eight,
 * four ordinary labels on one board had a fair chance of drawing two of them
 * the same. Collisions still happen and are accepted; see `groupColour`.
 */
const GROUP_COLOURS: readonly GroupColour[] = [
	{ light: "#2f6f8f", dark: "#77bcd9" }, // teal-blue
	{ light: "#6b4fa0", dark: "#b39ae0" }, // violet
	{ light: "#8a5a2b", dark: "#d2a06a" }, // clay
	{ light: "#2c7a6c", dark: "#6fc9b6" }, // pine
	{ light: "#8d4f78", dark: "#dd9dc6" }, // plum
	{ light: "#4a628f", dark: "#94aede" }, // slate-blue
	{ light: "#7a6a2c", dark: "#cdb968" }, // olive
	{ light: "#5c5f66", dark: "#b2b5bb" }, // graphite
	{ light: "#3d4b9a", dark: "#9aa6ee" }, // indigo
	{ light: "#6e5346", dark: "#c4a99a" }, // mocha
];

export { type GroupColour, GROUP_COLOURS };
