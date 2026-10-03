// A pulse as the drawn markup states it, read back from the SVG: every layer of
// it, the route it rides and how its dash moves.

/** One layer of a pulse, as drawn. */
interface PulseLayer {
	/** The route it rides, as path data. */
	readonly d: string;
	/** How thick it is. */
	readonly width: number;
	/** How long its dash is: how far back from the head it reaches. */
	readonly dash: number;
	/** The gap after the dash. */
	readonly gap: number;
	/** The dash offset at time zero, as the attribute says. */
	readonly offset: number;
	/** The offsets the dash moves through, in order. */
	readonly values: readonly number[];
	/** When each of those is reached, as a share of the cycle: only a crossing's pulse says. */
	readonly times: readonly number[];
	/** How long one cycle takes, in seconds. */
	readonly cycle: number;
	/** How long one cycle takes, as written. */
	readonly cycleWritten: string;
	/** When its animation begins, in seconds. */
	readonly begin: number;
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
function numbers(value: string | undefined, separator = /[\s,]+/u): number[] {
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
 * Every layer of every pulse in a piece of markup, in drawing order.
 * @param markup The markup.
 * @returns The layers.
 */
function pulseLayers(markup: string): PulseLayer[] {
	return [...markup.matchAll(/<path ([^>]*)>([\s\S]*?)<\/path>/gu)].flatMap(
		([, tag = "", body = ""]) => {
			const animate = /<animate ([^>]*)>/u.exec(body)?.[1];
			if (animate === undefined) return [];
			const [dash = 0, gap = 0] = numbers(attribute(tag, "stroke-dasharray"));
			const from = attribute(animate, "from");
			const values =
				from === undefined
					? numbers(attribute(animate, "values"), /;/u)
					: [Number(from), Number(attribute(animate, "to"))];
			const cycleWritten = attribute(animate, "dur") ?? "";
			return [
				{
					d: attribute(tag, "d") ?? "",
					width: Number(attribute(tag, "stroke-width")),
					dash,
					gap,
					offset: Number(attribute(tag, "stroke-dashoffset")),
					values,
					times: numbers(attribute(animate, "keyTimes"), /;/u),
					cycle: seconds(cycleWritten),
					cycleWritten,
					begin: seconds(attribute(animate, "begin") ?? "0s"),
				},
			];
		},
	);
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
 * Every layer of the pulses one relationship's line carries.
 * @param svg The markup.
 * @param id The relationship's id.
 * @returns The layers, in drawing order.
 */
function trafficLayers(svg: string, id: string): PulseLayer[] {
	return pulseLayers(holding(svg, "data-traffic", id));
}

/**
 * Every layer of the pulses a card carries round its edge.
 * @param svg The markup.
 * @param id The card's id.
 * @returns The layers, in drawing order.
 */
function rimLayers(svg: string, id: string): PulseLayer[] {
	return pulseLayers(holding(svg, "data-semantic-id", id));
}

/**
 * The pulses one message carries, a layer list for each.
 * @param svg The markup.
 * @param id The message's id.
 * @returns One list of layers for every pulse it sends.
 */
function messagePulses(svg: string, id: string): PulseLayer[][] {
	return holding(svg, "data-semantic-id", id)
		.split('<g class="ab-pulse"')
		.slice(1)
		.map((pulse) => pulseLayers(pulse));
}

/**
 * How fast the dash of a steady layer moves along its route: how far its offset
 * runs in one cycle, over how long that takes.
 * @param layer The layer.
 * @returns The speed, in diagram units a second.
 */
function speedOf(layer: PulseLayer): number {
	return Math.abs(layer.values[0]! - layer.values[1]!) / layer.cycle;
}

/**
 * Where the heads of a steady layer are on a route of one length at a moment.
 * @param layer The layer.
 * @param time The moment, in seconds.
 * @param length How long the route is.
 * @returns How far along the route each head that is on it is.
 */
function headsAt(layer: PulseLayer, time: number, length: number): number[] {
	const period = layer.dash + layer.gap;
	const [from = 0, to = 0] = layer.values;
	const offset = from + (to - from) * ((time / layer.cycle) % 1);
	const heads: number[] = [];
	for (let k = -Math.ceil(length / period) - 1; k <= Math.ceil(length / period) + 1; k += 1) {
		const head = layer.dash - offset + k * period;
		if (head >= 0 && head <= length) heads.push(head);
	}
	return heads;
}

export { headsAt, messagePulses, pulseLayers, rimLayers, speedOf, trafficLayers, type PulseLayer };
