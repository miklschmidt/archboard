// Mixing the renderer's colours, which are CSS expressions of the page's
// tokens (`lib/theme.ts`): the mix is written for CSS to resolve, so the one
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
 * A surface in an ink's colour: the ink's own hue, at a lightness of its own
 * and a share of the ink's chroma, written as a relative OKLCH colour for CSS
 * to resolve. A mix in sRGB with a grey or a near-white surface (`mixed`)
 * turns the ink's hue and loses most of its chroma, which left a pale tint
 * pale and a deep one muddy; this keeps the hue whole and sets the lightness
 * apart from the ink's, so every ink gives a surface as light as every other.
 * @param ink The ink.
 * @param tone The tone, on each ground.
 * @returns The surface.
 */
function toned(ink: string, tone: Tone): string {
	/**
	 * The tone on one ground.
	 * @param step Its lightness and its share of the ink's chroma.
	 * @param step.lightness Its lightness.
	 * @param step.chroma Its share of the ink's chroma.
	 * @returns The colour.
	 */
	const on = ({ lightness, chroma }: ToneStep): string =>
		`oklch(from ${ink} ${lightness} calc(min(c, ${CHROMA_CAP}) * ${chroma}) h)`;
	return lightDark(on(tone.light), on(tone.dark));
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

export { type Tone, colourId, lightDark, mixed, toned, translucent };
