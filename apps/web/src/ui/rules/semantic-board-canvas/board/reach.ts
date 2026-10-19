// How far a part reaches: everything it sends to, directly or through other
// parts, or everything that sends to it.
//
// Poking a part answers what it is wired to. The next question is how far a
// change to it reaches, and the board answers that too, with no telemetry and
// nothing invented: every relationship has a source and a target, so a walk
// along them in one direction names every part that can be reached, and how
// many relationships away each one is. A container is walked as the whole of
// what it holds.
//
// Pure, and ids only, like the rest of the reading of connections.

import { subtreeOf, type Wiring } from "#ui/rules/semantic-board-canvas/board/connections.ts";

/** Which way along the relationships a trace walks. */
type Way = "onward" | "back";

/** What a walk found. */
interface Reach {
	/**
	 * How many relationships away each subject is: the part and what it holds at
	 * 0, a relationship and the part it arrives at one hop further than the part
	 * it leaves.
	 */
	readonly hops: ReadonlyMap<string, number>;
	/** How many parts other than the part itself, and what it holds, were reached. */
	readonly parts: number;
}

/** A walk under way: what it walks over, which way, and how far it has got. */
interface Walk {
	readonly wiring: Wiring;
	readonly way: Way;
	/** How far each subject is so far, which each hop adds to. */
	readonly hops: Map<string, number>;
}

/**
 * The two ends of a relationship, in the order a walk crosses it.
 * @param edge The relationship.
 * @param way Onward from its source, or back from its target.
 * @returns The end it leaves and the end it arrives at.
 */
function crossing(
	edge: Wiring["edges"][number],
	way: Way,
): { readonly leaves: string; readonly arrives: string } {
	return way === "onward"
		? { leaves: edge.from, arrives: edge.to }
		: { leaves: edge.to, arrives: edge.from };
}

/**
 * One hop of the walk: every relationship that leaves the frontier is reached,
 * and so is the part it arrives at.
 * @param walk The walk under way.
 * @param frontier The parts the last hop arrived at.
 * @param hop Which hop this is, counting from one.
 * @returns The parts this hop arrived at.
 */
function stepOnce(walk: Walk, frontier: ReadonlySet<string>, hop: number): Set<string> {
	const { wiring, way, hops } = walk;
	const arrived = new Set<string>();
	for (const edge of wiring.edges) {
		const { leaves, arrives } = crossing(edge, way);
		if (!frontier.has(leaves) || hops.has(edge.id)) continue;
		hops.set(edge.id, hop);
		if (!hops.has(arrives)) {
			hops.set(arrives, hop);
			arrived.add(arrives);
		}
	}
	return arrived;
}

/**
 * Walk the relationships from a part in one direction, one hop at a time.
 * @param wiring What the variant says.
 * @param id The part.
 * @param way Onward along what it sends to, or back along what sends to it.
 * @returns How far each subject is, and how many parts that is.
 */
function reachOf(wiring: Wiring, id: string, way: Way): Reach {
	const start = subtreeOf(wiring.nodes, id);
	const hops = new Map<string, number>([...start].map((one) => [one, 0]));
	// A relationship between two parts of the part is its own content.
	for (const edge of wiring.edges) {
		if (start.has(edge.from) && start.has(edge.to)) hops.set(edge.id, 0);
	}
	const walk = { wiring, way, hops };
	let frontier: ReadonlySet<string> = start;
	for (let hop = 1; frontier.size > 0; hop += 1) {
		frontier = stepOnce(walk, frontier, hop);
	}
	const reached = [...hops.keys()].filter((one) => !start.has(one) && isPart(wiring, one));
	return { hops, parts: reached.length };
}

/**
 * Whether an id is a part and not a relationship.
 * @param wiring What the variant says.
 * @param id The id.
 * @returns True for a part.
 */
function isPart(wiring: Wiring, id: string): boolean {
	return wiring.nodes.some((node) => node.id === id);
}

export { reachOf, type Reach, type Way };
