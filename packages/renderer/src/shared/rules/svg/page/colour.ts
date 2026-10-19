// Mixing the renderer's colours, which are CSS expressions of the page's
// tokens (`shared/rules/svg/page/theme.ts`): the mix is written for CSS to resolve, so the one
// picture takes whichever theme the page it is shown on is in.

/**
 * A share, as a CSS percentage: rounded well past what a colour channel can
 * show, so a share like 1 - 0.7 is spelt as the 30% it means.
 * @param share Between 0 and 1.
 * @returns The percentage.
 */
function percent(share: number): string {
	return `${Number((share * 100).toFixed(4))}%`;
}

/**
 * A colour part way from one colour to another, mixed in sRGB.
 * @param from The colour at 0.
 * @param to The colour at 1.
 * @param amount How far to go, between 0 and 1.
 * @returns The mixed colour: either end itself at 0 and 1, `color-mix()` between.
 */
function mixed(from: string, to: string, amount: number): string {
	if (amount <= 0) return from;
	if (amount >= 1) return to;
	return `color-mix(in srgb, ${to} ${percent(amount)}, ${from})`;
}

/** One tone of an ink: how light it is in OKLCH, and how much of the ink's chroma it keeps. */
interface ToneStep {
	readonly lightness: number;
	readonly chroma: number;
	/**
	 * The most of the ink's chroma it counts, when not {@link CHROMA_CAP}: a
	 * tone that holds as much chroma as sRGB has room for at its lightness and
	 * hue, which differs from hue to hue.
	 */
	readonly cap?: number;
}

/** A tone of an ink on the light ground and on the dark one. */
interface Tone {
	readonly light: ToneStep;
	readonly dark: ToneStep;
}

/**
 * How much of an ink's chroma a tone counts: a vivid ink and a quiet one give
 * tones of nearly one strength, and a grey ink gives a grey tone.
 */
const CHROMA_CAP = 0.12;

/**
 * One tone of an ink: the ink's own hue, at a lightness of its own and a share
 * of the ink's chroma, written as a relative OKLCH colour for CSS to resolve.
 * A mix in sRGB with a grey or a near-white surface (`mixed`) turns the ink's
 * hue and loses most of its chroma, which left a pale tint pale and a deep one
 * muddy. This keeps the hue whole and sets the lightness apart from the ink's,
 * so every ink gives a tone as light as every other.
 * @param ink The ink.
 * @param step Its lightness and its share of the ink's chroma.
 * @param step.lightness Its lightness.
 * @param step.chroma Its share of the ink's chroma.
 * @param step.cap The most of the ink's chroma it counts.
 * @returns The tone.
 */
function tone(ink: string, { lightness, chroma, cap = CHROMA_CAP }: ToneStep): string {
	return `oklch(from ${ink} ${lightness} calc(min(c, ${cap}) * ${chroma}) h)`;
}

/**
 * A surface in an ink's colour, a tone of it ({@link tone}) on each ground.
 * @param ink The ink.
 * @param steps The tone, on each ground.
 * @returns The surface.
 */
function toned(ink: string, steps: Tone): string {
	return lightDark(tone(ink, steps.light), tone(ink, steps.dark));
}

/** A colour in an ink: a tone of it on the light ground, a share of it over a base on the dark one. */
interface Inked {
	readonly light: ToneStep;
	readonly dark: number;
}

/**
 * A surface in an ink's colour: on the light ground a tone of the ink
 * ({@link tone}), clean and in its own hue; on the dark ground the ink mixed
 * into a base, as the dark picture is drawn.
 * @param base The surface the ink is mixed into on the dark ground.
 * @param ink The ink.
 * @param inked The tone on the light ground, and the share of the ink on the dark.
 * @returns The surface.
 */
function inkedOver(base: string, ink: string, inked: Inked): string {
	return lightDark(tone(ink, inked.light), mixed(base, ink, inked.dark));
}

/** How light an ink may be on the light ground, and a tone of it on the dark one. */
interface Held {
	readonly light: { readonly least: number; readonly most: number };
	readonly dark: ToneStep;
}

/**
 * An ink at its full colour: on the light ground the ink itself, its hue and
 * its chroma whole, with its lightness only held between two bounds, so a mark
 * in it keeps its contrast whichever named colour it is; on the dark ground a
 * tone of it ({@link tone}).
 * @param ink The ink.
 * @param held The bounds on the light ground, and the tone on the dark.
 * @returns The colour.
 */
function heldTone(ink: string, held: Held): string {
	const { least, most } = held.light;
	return lightDark(`oklch(from ${ink} clamp(${least}, l, ${most}) c h)`, tone(ink, held.dark));
}

/**
 * A colour at a share of its strength, the rest see-through: what a stroke's
 * opacity says, said in the colour itself.
 * @param colour The colour.
 * @param share How much of it, between 0 and 1.
 * @returns The translucent colour.
 */
function translucent(colour: string, share: number): string {
	return mixed("transparent", colour, share);
}

/**
 * One colour on a light page and another on a dark one, chosen by the
 * `color-scheme` of wherever the picture is shown.
 * @param light The colour on a light page.
 * @param dark The colour on a dark page.
 * @returns The choice.
 */
function lightDark(light: string, dark: string): string {
	return `light-dark(${light}, ${dark})`;
}

/**
 * A colour spelt so it can be part of an element's id: every character an id
 * cannot hold written as its code, so the same colour always gives the same
 * spelling and two colours never share one.
 * @param colour The colour.
 * @returns Its spelling.
 */
function colourId(colour: string): string {
	return colour.replace(
		/[^a-z0-9-]/giu,
		(character) => `_${character.codePointAt(0)!.toString(16).padStart(2, "0")}`,
	);
}

export {
	type Held,
	type Inked,
	type Tone,
	type ToneStep,
	colourId,
	heldTone,
	inkedOver,
	lightDark,
	mixed,
	toned,
	translucent,
};
