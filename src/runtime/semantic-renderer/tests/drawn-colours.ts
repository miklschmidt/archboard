// Reading the colours a drawing is painted in, for owners that compare them.

/**
 * The three channels of a hex colour.
 * @param hex The colour.
 * @returns Red, green and blue, 0 to 255.
 */
function rgbOf(hex: string): [number, number, number] {
	return [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) as [
		number,
		number,
		number,
	];
}

/**
 * The hue of a hex colour, in degrees.
 * @param hex The colour.
 * @returns Its hue.
 */
function hueOf(hex: string): number {
	const [r, g, b] = rgbOf(hex).map((value) => value / 255) as [number, number, number];
	const max = Math.max(r, g, b);
	const delta = max - Math.min(r, g, b);
	if (delta === 0) return 0;
	const sector =
		max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
	return (sector * 60 + 360) % 360;
}

/**
 * How far apart two hex colours are, channel by channel.
 * @param a One colour.
 * @param b The other.
 * @returns The distance.
 */
function colourDistance(a: string, b: string): number {
	const [x, y] = [rgbOf(a), rgbOf(b)];
	return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

export { colourDistance, hueOf };
