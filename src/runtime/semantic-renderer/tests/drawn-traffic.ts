// A pulse as the drawn markup states it, read back from the SVG: the gradient it
// is painted with, the masks that shape it to its route, and how its bars slide.

/** One piece of a route's beam: how its bar slides and the path of its mask. */
interface Piece {
	/** The offsets the bar slides through, along its frame. */
	readonly values: readonly number[];
	/** When each of those is reached, as a share of the cycle: only a message's pulse says. */
	readonly times: readonly number[];
	/** How long one cycle takes, in seconds. */
	readonly cycle: number;
	/** How long one cycle takes, as written. */
	readonly cycleWritten: string;
	/** When its animation begins, in seconds. */
	readonly begin: number;
	/** The points the piece's mask runs through. */
	readonly points: readonly { readonly x: number; readonly y: number }[];
}

/** One pulse, as drawn: every piece of its route. */
interface Beam {
	/** The pieces, in route order. */
	readonly pieces: readonly Piece[];
	/** How far apart the pulses of a train are, when it is a train: the length of its gradient. */
	readonly period: number | undefined;
	/** How many layers of glow its masks stack. */
	readonly layers: number;
}

/**
 * One attribute of one element's opening tag.
 * @param markup The tag's markup.
 * @param name The attribute.
 * @returns Its value, or undefined when it has none.
 */
function attribute(markup: string, name: string): string | undefined {
	return new RegExp(`(?:^|\\s)${name}="([^"]*)"`, "u").exec(markup)?.[1];
}

/**
 * A list of numbers as SVG writes one.
 * @param value The attribute's value.
 * @param separator What the numbers are separated by.
 * @returns The numbers.
 */
function numbers(value: string | undefined, separator = /[\s,;]+/u): number[] {
	return (value ?? "").trim().split(separator).map(Number);
}

/**
 * A timecount as seconds.
 * @param value The timecount, such as `0.5s`.
 * @returns The seconds.
 */
function seconds(value: string | undefined): number {
	return Number((value ?? "").replace(/s$/u, ""));
}

/**
 * The points a path of straight pieces and bends passes through, ends only.
 * @param d The path data.
 * @returns The points, the end of every piece.
 */
function pointsOf(d: string): { x: number; y: number }[] {
	const coordinates = d.match(/-?[\d.]+(?:e-?\d+)?/gu)!.map(Number);
	return Array.from({ length: coordinates.length / 2 }, (_, index) => ({
		x: coordinates[index * 2]!,
		y: coordinates[index * 2 + 1]!,
	}));
}

/**
 * Every pulse in a piece of markup, in drawing order.
 * @param markup The markup.
 * @returns The pulses.
 */
function beams(markup: string): Beam[] {
	return markup
		.split('<g class="ab-pulse"')
		.slice(1)
		.map((chunk) => {
			const masks = [...chunk.matchAll(/<mask [^>]*>([\s\S]*?)<\/mask>/gu)];
			const motions = [...chunk.matchAll(/<animateTransform ([^>]*)>/gu)].map(
				([, tag = ""]) => tag,
			);
			const gradient = /<linearGradient [^>]*>/u.exec(chunk)?.[0] ?? "";
			return {
				period: gradient.includes('spreadMethod="repeat"')
					? Number(attribute(gradient, "x2"))
					: undefined,
				layers: [...(masks[0]?.[1] ?? "").matchAll(/<path /gu)].length,
				pieces: motions.map((motion, index) => {
					const cycleWritten = attribute(motion, "dur") ?? "";
					const path = /<path d="([^"]+)"/u.exec(masks[index]?.[1] ?? "")?.[1] ?? "M0,0";
					return {
						values:
							attribute(motion, "values") === undefined
								? [
										Number(attribute(motion, "from")?.split(" ")[0]),
										Number(attribute(motion, "to")?.split(" ")[0]),
									]
								: attribute(motion, "values")!
										.split(";")
										.map((value) => Number(value.split(" ")[0])),
						times: numbers(attribute(motion, "keyTimes"), /;/u),
						cycle: seconds(cycleWritten),
						cycleWritten,
						begin: seconds(attribute(motion, "begin") ?? "0s"),
						points: pointsOf(path),
					};
				}),
			};
		});
}

/**
 * The markup a subject's group holds, up to the next subject's.
 *
 * Counted from where the subject is named to where the next one is, because a
 * group holds nested groups of its own — a label pill is one — and matching
 * closing tags by hand would stop at the first of them.
 * @param svg The markup.
 * @param name The attribute naming it, such as `data-traffic`.
 * @param id The subject's id.
 * @returns The markup.
 */
function holding(svg: string, name: string, id: string): string {
	return (svg.split(`${name}="${id}"`)[1] ?? "").split(/data-(?:semantic-id|traffic)=/u)[0]!;
}

/**
 * Every pulse one relationship's line carries.
 * @param svg The markup.
 * @param id The relationship's id.
 * @returns The pulses.
 */
function trafficBeams(svg: string, id: string): Beam[] {
	return beams(holding(svg, "data-traffic", id));
}

/**
 * Every pulse a card carries round its edge.
 * @param svg The markup.
 * @param id The card's id.
 * @returns The pulses.
 */
function rimBeams(svg: string, id: string): Beam[] {
	return beams(holding(svg, "data-semantic-id", id));
}

/**
 * The pulses one message sends.
 * @param svg The markup.
 * @param id The message's id.
 * @returns One for every pulse it sends.
 */
function messageBeams(svg: string, id: string): Beam[] {
	return beams(holding(svg, "data-semantic-id", id));
}

/**
 * How fast a train's bars slide along their pieces: how far one cycle slides
 * them over how long it takes. A train slides one gradient period a cycle.
 * @param beam The pulse.
 * @returns The speed, in diagram units a second.
 */
function speedOf(beam: Beam): number {
	const piece = beam.pieces[0]!;
	return Math.abs(piece.values[1]! - piece.values[0]!) / piece.cycle;
}

/**
 * How fast a message's bar slides along its piece: how far it slides between
 * the moments it starts and stops, over how long that takes.
 * @param piece The piece.
 * @returns The speed, in diagram units a second.
 */
function slidingSpeedOf(piece: Piece): number {
	const [, from = 0, to = 1] = piece.times;
	return Math.abs(piece.values[2]! - piece.values[1]!) / ((to - from) * piece.cycle);
}

export {
	beams,
	messageBeams,
	rimBeams,
	slidingSpeedOf,
	speedOf,
	trafficBeams,
	type Beam,
	type Piece,
};
