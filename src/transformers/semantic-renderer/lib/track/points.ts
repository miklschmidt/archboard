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
 * Hold each line down out of a card that leaves from its points to its point.
 * @param lines The lines routed.
 * @param chains Every line's stations, by id; a held line's first station
 * learns its point.
 */
function holdToPoints(lines: readonly PlacedLine[], chains: ReadonlyMap<string, Chain>): void {
	for (const [item, out] of heldByCard(lines, chains)) {
		const sorted = out.toSorted(
			(one, other) => firstStop(one.chain) - firstStop(other.chain) || one.order - other.order,
		);
		sorted.forEach((held, index) => {
			const station = held.chain.stations[0]!;
			station.at = pointAt(item.box.width, held, index, sorted.length);
			station.x = item.box.x + station.at;
		});
	}
}

export { holdToPoints };
