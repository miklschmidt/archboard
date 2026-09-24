// Mixing the renderer's resolved colours, which are six-digit sRGB hex.

/**
 * One channel of a six-digit hex colour.
 * @param hex The colour's six digits.
 * @param at Where the channel starts: 0, 2 or 4.
 * @returns Its value, 0 to 255.
 */
function channel(hex: string, at: number): number {
	return Number.parseInt(hex.slice(at, at + 2), 16);
}

/**
 * A colour part way from one sRGB hex colour to another.
 * @param from The colour at 0.
 * @param to The colour at 1.
 * @param amount How far to go, between 0 and 1.
 * @returns The mixed colour, or `from` when either is not a six-digit hex colour.
 */
function mixed(from: string, to: string, amount: number): string {
	const hex = /^#([0-9a-f]{6})$/iu;
	const a = hex.exec(from)?.[1];
	const b = hex.exec(to)?.[1];
	if (a === undefined || b === undefined) return from;
	const digits = [0, 2, 4].map((at) =>
		Math.round(channel(a, at) + (channel(b, at) - channel(a, at)) * amount)
			.toString(16)
			.padStart(2, "0"),
	);
	return `#${digits.join("")}`;
}

export { mixed };
