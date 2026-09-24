// Reading colours as the browser computes them, for owners that compare them.

/**
 * The hue of a colour the browser computed, such as \`rgb(12, 34, 56)\`.
 * @param css The computed colour.
 * @returns Its hue, in degrees.
 */
function computedHue(css: string): number {
	const [r, g, b] = (css.match(/[\d.]+/gu) ?? []).slice(0, 3).map((value) => Number(value) / 255);
	const [red, green, blue] = [r ?? 0, g ?? 0, b ?? 0];
	const max = Math.max(red, green, blue);
	const delta = max - Math.min(red, green, blue);
	if (delta === 0) return 0;
	const sector =
		max === red
			? ((green - blue) / delta) % 6
			: max === green
				? (blue - red) / delta + 2
				: (red - green) / delta + 4;
	return (sector * 60 + 360) % 360;
}

/**
 * Whether two computed colours share a hue: one colour drawn at two strengths.
 * @param a One colour, as the browser computes it.
 * @param b The other.
 * @returns True when their hues lie within a few degrees.
 */
function sameHue(a: string, b: string): boolean {
	return Math.abs(computedHue(a) - computedHue(b)) < 6;
}

export { sameHue };
