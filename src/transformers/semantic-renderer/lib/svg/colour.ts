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

export { colourId, lightDark, mixed, translucent };
