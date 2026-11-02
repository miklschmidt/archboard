// Where two parts of a board meet: the children of their nearest holder that hold
// them. A reading draws a relationship between those two sides, so it stands for
// every call between them (ADR 0044, ADR 0046).

import type { BoardToCheck } from "#runtime/operations/code-check/states.ts";
import { messagesOf } from "@archboard/model/flow";

/** What reading the sides of a board needs. */
interface Sides {
	readonly read: BoardToCheck;
	/** Each part and the parts that hold it, the part first. */
	readonly lineages: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * A part and every part inside it.
 * @param sides The board.
 * @param id The part.
 * @returns The ids.
 */
function sideOf(sides: Pick<Sides, "lineages">, id: string): Set<string> {
	return new Set([...sides.lineages].flatMap(([inside, chain]) => (chain.has(id) ? [inside] : [])));
}

/**
 * The top of what separates a part from another.
 * @param sides The board.
 * @param part The part.
 * @param other The part it meets.
 * @returns The child of their nearest holder that holds the part, or the root that does.
 */
function sideWhereTheyMeet(sides: Sides, part: string, other: string): string {
	const lineage = sides.lineages.get(part) ?? new Set([part]);
	const across = sides.lineages.get(other) ?? new Set([other]);
	return [...lineage].findLast((id) => !across.has(id)) ?? part;
}

/**
 * Whether a relationship or a flow step joins the two sides where two parts meet.
 * @param sides The board.
 * @param left One part.
 * @param right The other.
 * @returns True when one does, in either direction.
 */
function sidesJoined(sides: Sides, left: string, right: string): boolean {
	const { content } = sides.read.variant;
	const atLeft = sideOf(sides, sideWhereTheyMeet(sides, left, right));
	const atRight = sideOf(sides, sideWhereTheyMeet(sides, right, left));
	const joints = [...content.edges, ...content.flows.flatMap((flow) => messagesOf(flow.steps))];
	return joints.some(
		({ from, to }) =>
			(atLeft.has(from) && atRight.has(to)) || (atLeft.has(to) && atRight.has(from)),
	);
}

export { sideOf, sidesJoined };
