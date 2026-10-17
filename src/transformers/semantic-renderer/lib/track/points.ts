// Lines out of a flowchart's decision leave it from its points (ADR 0053,
// TASK-491). A flowchart reads a decision by its answers leaving it apart:
// one from its left point, one from its right point and a third from its
// bottom point. Each line out of a card marked so (`FROM_POINTS`) asks
// Graphviz to stand it under a corner of the card's box: the first answer
// under the bottom-left corner, the last under the bottom-right corner, any
// other under the middle (`compound-graph.ts` `pointsOf`). Graphviz then
// stands each answer's label and step under its corner where its order of
// the ranks allows. Here, before anything else is routed, each line down out
// of the card is held to one point of the card's bottom edge: the line whose
// label box or card Graphviz stood furthest left near the left edge of the
// box, the one furthest right near its right edge, and any other at the
// middle. So two answers never cross below the card, even where Graphviz
// ordered them against their corners. A lone line leaves from the middle.
// Of two answers, one whose label box or card Graphviz stood past the
// middle, on the far side from its point, leaves from the middle instead:
// from its side point it would run back under the diamond. A line down into
// such a card is held to the middle of its top, the point the flowchart draws
// it into, so its label box stands on the line it is drawn on.
//
// The flowchart measures a decision's box wider than its diamond on either
// side by the run a line takes sideways out of a point before it turns down,
// and by half the widest answer's words. A line from a side point runs down
// that half in from the box's edge (`POINTS_INSET`), clear of the diamond,
// and its label box slides onto it there without standing out of the box.
// The flowchart draws the run out of the point once the line is routed
// (`flowchart-ports.ts`). A line up out of the card is not held: it leaves
// the top of the card as before.
import type { ElkExtendedEdge } from "@archboard/elk-rs";
import {
	FROM_POINTS,
	POINTS_INSET,
} from "@/transformers/semantic-renderer/lib/layout/compound-graph";
import type { Chain } from "@/transformers/semantic-renderer/lib/track/chains";
import type { Item } from "@/transformers/semantic-renderer/lib/track/scene";

/** A line as the router reads it: its id, its place in the board and what Graphviz placed. */
interface PlacedLine {
	readonly id: string;
	readonly order: number;
	readonly placed: ElkExtendedEdge;
}

/** A line held to a point of its card, with its place in the board. */
interface Held {
	readonly chain: Chain;
	readonly order: number;
	/** How far in from the box's edges a line from a side point runs down. */
	readonly inset: number;
}

/**
 * Where one of a card's lines down leaves it, in from the left edge of its box.
 * @param width The box's width.
 * @param held The line.
 * @param index The line's place, left to right.
 * @param count How many lines leave the card downward.
 * @returns The offset: near the left edge, near the right edge, or the middle.
 */
function pointAt(width: number, held: Held, index: number, count: number): number {
	if (count > 1 && index === 0) return held.inset;
	if (count > 1 && index === count - 1) return width - held.inset;
	return width / 2;
}

/**
 * Whether a line held to a side point would run back under its card: where
 * it first stops lies past the card's middle, on the other side.
 * @param item The card.
 * @param held The line.
 * @param at Its point, in from the left edge of the card's box.
 * @returns True when it doubles back.
 */
function doublesBack(item: Item, held: Held, at: number): boolean {
	const middle = item.box.width / 2;
	return (firstStop(held.chain) - item.box.x - middle) * (at - middle) < 0;
}

/**
 * A line's stations, when it is one to hold: it leaves its card from the
 * card's points, and runs down from it to a lower band.
 * @param line The line.
 * @param chains Every line's stations, by id.
 * @returns Its chain, or nothing when it is not held.
 */
function heldChain(line: PlacedLine, chains: ReadonlyMap<string, Chain>): Chain | undefined {
	if (line.placed.layoutOptions?.[FROM_POINTS] === undefined) return undefined;
	const chain = chains.get(line.id);
	if (chain === undefined || chain.upward) return undefined;
	const [source, next] = chain.stations;
	// A chain has a station at each end, and a line between two cards on one band runs flat.
	return next!.band > source!.band ? chain : undefined;
}

/**
 * Where a line first stops below its card: the x of its label box or of the
 * card it reaches, whichever comes first. A lane Graphviz stood on the bands
 * before it says less about which side the line goes to.
 * @param chain The line's stations.
 * @returns The x.
 */
function firstStop(chain: Chain): number {
	return (chain.stations.slice(1).find(({ kind }) => kind !== "lane") ?? chain.stations[1]!).x;
}

/**
 * The lines to hold, by the card they leave.
 * @param lines The lines routed.
 * @param chains Every line's stations, by id.
 * @returns Each card's held lines.
 */
function heldByCard(
	lines: readonly PlacedLine[],
	chains: ReadonlyMap<string, Chain>,
): Map<Item, Held[]> {
	const leaving = new Map<Item, Held[]>();
	for (const line of lines) {
		const chain = heldChain(line, chains);
		if (chain === undefined) continue;
		const source = chain.stations[0]!.item!;
		const inset = Number(line.placed.layoutOptions?.[POINTS_INSET] ?? 0);
		leaving.set(source, [...(leaving.get(source) ?? []), { chain, order: line.order, inset }]);
	}
	return leaving;
}

/**
 * Where a card holds its lines down out of it, left to right: each at its
 * point, but of two, one alone that would run back under the card at the
 * middle. Where both would, Graphviz only stood their labels against the
 * order of the steps they reach, and the labels slide to their points.
 * @param item The card.
 * @param sorted Its lines, left to right by the step each reaches.
 * @returns Each line's offset in from the left edge of the card's box.
 */
function heldAts(item: Item, sorted: readonly Held[]): number[] {
	const { width } = item.box;
	const ats = sorted.map((held, index) => pointAt(width, held, index, sorted.length));
	const back = ats.map((at, index) => doublesBack(item, sorted[index]!, at));
	if (sorted.length !== 2 || back.filter(Boolean).length !== 1) return ats;
	return ats.map((at, index) => (back[index] ? width / 2 : at));
}

/** The most lines out of one card whose every order is tried. */
const MOST_ORDERED = 4;

/**
 * Every order of some items, the given order first.
 * @param items The items.
 * @returns The orders.
 */
function ordersOf<T>(items: readonly T[]): T[][] {
	if (items.length <= 1) return [[...items]];
	return items.flatMap((item, index) =>
		ordersOf(items.toSpliced(index, 1)).map((rest) => [item, ...rest]),
	);
}

/**
 * Where a line stands on each band it passes a lane or card on, from its
 * point down. Its label box is left out: label boxes that share a stretch
 * of a band trade places to stand in their lines' order (`label-runs.ts`).
 * @param held The line.
 * @param x The x of its point.
 * @returns The x, by band.
 */
function standsOf(held: Held, x: number): Map<number, number> {
	const [source, ...rest] = held.chain.stations;
	return new Map([
		[source!.band, x],
		...rest
			.filter(({ kind }) => kind !== "label")
			.map(({ band, x: at }): [number, number] => [band, at]),
	]);
}

/**
 * How many times two lines trade sides on the bands both pass.
 * @param one Where one line stands, by band.
 * @param other Where the other stands.
 * @returns The crossings.
 */
function flipsOf(one: ReadonlyMap<number, number>, other: ReadonlyMap<number, number>): number {
	let [side, flips] = [0, 0];
	for (const band of [...one.keys()].toSorted((a, b) => a - b)) {
		const there = other.get(band);
		const now = there === undefined ? 0 : Math.sign(one.get(band)! - there);
		if (now === 0) continue;
		if (side !== 0 && now !== side) flips += 1;
		side = now;
	}
	return flips;
}

/**
 * How many times a card's lines cross below it, held to its points in an order.
 * @param item The card.
 * @param order Its lines, left to right.
 * @returns The crossings.
 */
function crossingsIn(item: Item, order: readonly Held[]): number {
	const stands = order.map((held, index) =>
		standsOf(held, item.box.x + pointAt(item.box.width, held, index, order.length)),
	);
	return stands.reduce(
		(sum, one, index) =>
			sum + stands.slice(index + 1).reduce((more, other) => more + flipsOf(one, other), 0),
		0,
	);
}

/**
 * A card's lines left to right: by where each first stops below the card,
 * unless another order crosses fewer of them on the lanes and cards past
 * their label boxes, as when Graphviz stood two answers' words against the
 * order of the steps they reach.
 * @param item The card.
 * @param out Its lines down.
 * @returns The lines, in order.
 */
function orderOf(item: Item, out: readonly Held[]): Held[] {
	const sorted = out.toSorted(
		(one, other) => firstStop(one.chain) - firstStop(other.chain) || one.order - other.order,
	);
	if (sorted.length > MOST_ORDERED) return sorted;
	return ordersOf(sorted).reduce((best, order) =>
		crossingsIn(item, order) < crossingsIn(item, best) ? order : best,
	);
}

/**
 * Hold each line down out of a card that leaves from its points to its
 * point, and each line down into such a card to the middle of its top.
 * @param lines The lines routed.
 * @param chains Every line's stations, by id; a held line's first or last
 * station learns its point.
 */
function holdToPoints(lines: readonly PlacedLine[], chains: ReadonlyMap<string, Chain>): void {
	const leaving = heldByCard(lines, chains);
	for (const [item, out] of leaving) {
		const sorted = orderOf(item, out);
		const ats = heldAts(item, sorted);
		sorted.forEach((held, index) => {
			const station = held.chain.stations[0]!;
			station.at = ats[index]!;
			station.x = item.box.x + station.at;
		});
	}
	for (const { stations, upward } of chains.values()) {
		const station = stations.at(-1)!;
		if (upward || station.band === stations[0]!.band || !leaving.has(station.item!)) continue;
		station.at = station.item!.box.width / 2;
		station.x = station.item!.box.x + station.at;
	}
}

export { holdToPoints };
