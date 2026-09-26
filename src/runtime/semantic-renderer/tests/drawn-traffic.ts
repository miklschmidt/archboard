// A relationship's traffic as the drawn markup states it: every layer of its
// streaks, its still picture and its moving train, read back from the SVG.

/** One layer of a relationship's streaks, as drawn. */
interface TrafficLayer {
	/** The route it rides, as path data. */
	readonly d: string;
	/** How thick it is. */
	readonly width: number;
	/** Whether it is the ring in the page's colour around the head. */
	readonly moat: boolean;
	/** The still picture's dash pattern. */
	readonly still: readonly number[];
	/** The dash offset both pictures start from. */
	readonly offset: number;
	/** The moving picture's dash pattern: one dash and one gap per shot in a cycle. */
	readonly train: readonly number[];
	/** How far the train moves in one cycle. */
	readonly travel: number;
	/** How long one cycle takes, in seconds. */
	readonly cycle: number;
	/** How long one cycle takes, as written. */
	readonly cycleWritten: string;
	/** When each of its animations begins, in seconds. */
	readonly begins: readonly number[];
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
 * @returns The numbers.
 */
function numbers(value: string | undefined): number[] {
	return (value ?? "")
		.trim()
		.split(/[\s,]+/u)
		.map(Number);
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
 * Every layer of the streaks one relationship's group carries.
 * @param svg The markup.
 * @param id The relationship's id.
 * @returns The layers, in drawing order.
 */
function trafficLayers(svg: string, id: string): TrafficLayer[] {
	// A line's traffic is painted in a layer of its own that names the line.
	const group = (svg.split(`data-traffic="${id}"`)[1] ?? "").split(
		/data-(?:semantic-id|traffic)=/u,
	)[0]!;
	const traffic = group.split('<g class="ab-pulse"')[1] ?? "";
	return [...traffic.matchAll(/<path ([^>]*)>([\s\S]*?)<\/path>/gu)].map(
		([, tag = "", body = ""]) => {
			const set = /<set ([^>]*)>/u.exec(body)?.[1] ?? "";
			const animate = /<animate ([^>]*)>/u.exec(body)?.[1] ?? "";
			const cycleWritten = attribute(animate, "dur") ?? "";
			return {
				d: attribute(tag, "d") ?? "",
				width: Number(attribute(tag, "stroke-width")),
				moat: attribute(tag, "data-pulse-part") === "moat",
				still: numbers(attribute(tag, "stroke-dasharray")),
				offset: Number(attribute(tag, "stroke-dashoffset")),
				train: numbers(attribute(set, "to")),
				travel: Number(attribute(animate, "from")) - Number(attribute(animate, "to")),
				cycle: seconds(cycleWritten),
				cycleWritten,
				begins: [set, animate].map((element) => seconds(attribute(element, "begin"))),
			};
		},
	);
}

/**
 * Where the dashes of a pattern end along a route of one length: the heads a
 * picture shows on it.
 * @param pattern The dash pattern: dash, gap, dash, gap.
 * @param offset The dash offset.
 * @param length How long the route is.
 * @returns How far along the route each dash that shows on it ends.
 */
function headsOn(pattern: readonly number[], offset: number, length: number): number[] {
	const period = pattern.reduce((sum, value) => sum + value, 0);
	const heads: number[] = [];
	let start = -offset - period * Math.ceil((length + offset) / period + 1);
	while (start <= length) {
		for (let index = 0; index < pattern.length; index += 2) {
			const end = start + pattern[index]!;
			if (end >= 0 && start <= length) heads.push(end);
			start = end + (pattern[index + 1] ?? 0);
		}
	}
	return heads;
}

/**
 * The seconds between one launch and the next over one cycle of a layer's train.
 * @param layer The layer.
 * @returns The gaps.
 */
function launchGaps(layer: TrafficLayer): number[] {
	const speed = layer.travel / layer.cycle;
	const gaps: number[] = [];
	for (let index = 0; index < layer.train.length; index += 2) {
		gaps.push((layer.train[index]! + layer.train[index + 1]!) / speed);
	}
	return gaps;
}

export { headsOn, launchGaps, trafficLayers, type TrafficLayer };
