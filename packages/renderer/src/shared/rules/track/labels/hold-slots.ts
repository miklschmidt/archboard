// Stacked members of a container out of one column (visual polish). A
// container's title holds a member below it with an invisible Graphviz edge,
// and an edge that spans several ranks is a chain of 2-point virtual nodes,
// kept a node gap from its neighbours like any node. Where the chain passes a
// member on its way down to a lower one, it stands between that member and
// the container's wall: the member stands one slot, the gap and the chain,
// in from the wall, while the held member below stands at the wall. Nothing
// is drawn in that slot, so the container is a slot wider than its members
// need, and its members stand out of one column.
//
// Once Graphviz has placed the block, a member standing one slot in from its
// container's wall, over or under a member of that container standing at the
// same wall, moves onto the wall where that crowds nothing and crosses no
// line. The container's far wall is then pulled in to its members.
import type { Columns } from "#shared/rules/track/scene/graphviz.ts";
import type { Box } from "#shared/rules/geometry.ts";

/** The invisible holds a block's containers keep their members below their titles with. */
interface Holds {
	/** How far in from its container's wall a hold passing beside a member stands it. */
	readonly slot: number;
	/**
	 * The innermost container around a card, if any.
	 * @param card The card.
	 * @returns The container.
	 */
	readonly around: (card: string) => string | undefined;
}

/** How near a card must stand to a wall, or to a slot in from it, to stand there. */
const AT = 1;

/**
 * Whether two boxes share some width while one stands wholly over the other.
 * @param one A box.
 * @param other Another.
 * @returns True when they do.
 */
function stacked(one: Box, other: Box): boolean {
	const across = one.x < other.x + other.width && other.x < one.x + one.width;
	const apart = one.y + one.height <= other.y || other.y + other.height <= one.y;
	return across && apart;
}

/**
 * How far a card stands in from each inner wall of its container.
 * @param columns The placed block.
 * @param name The card.
 * @returns Its room on the left and on the right, or nothing outside a container.
 */
function inset(columns: Columns, name: string): [number, number] | undefined {
	const span = columns.room.within(name);
	const at = columns.boxes.get(name);
	if (span === undefined || at === undefined) return undefined;
	return [at.x - span.left, span.right - at.x - at.width];
}

/**
 * How far in from each inner wall of their container the other members of a
 * card's container stand, of those it stands over or under.
 * @param columns The placed block.
 * @param holds The block's holds.
 * @param name The card.
 * @returns Each such member's room on the left and on the right.
 */
function kinInsets(columns: Columns, holds: Holds, name: string): [number, number][] {
	const around = holds.around(name);
	const at = columns.boxes.get(name)!;
	return [...columns.boxes]
		.filter(
			([other, box]) =>
				other !== name &&
				columns.room.card?.(other) === true &&
				holds.around(other) === around &&
				stacked(box, at),
		)
		.map(([other]) => inset(columns, other)!);
}

/**
 * Where a card a hold stood a slot in from its container's wall belongs: on
 * that wall, when some other member it stands over or under stands there. A
 * card lined up with another by a line stays.
 * @param columns The placed block.
 * @param holds The block's holds.
 * @param name The card.
 * @returns How far it moves right, or nothing when it stays.
 */
function slotShift(columns: Columns, holds: Holds, name: string): number | undefined {
	const room = movableInset(columns, holds, name);
	if (room === undefined) return undefined;
	const walls = kinInsets(columns, holds, name);
	const side = ([0, 1] as const).find(
		(one) =>
			Math.abs(room[one] - holds.slot) <= AT && walls.some((wall) => Math.abs(wall[one]) <= AT),
	);
	if (side === undefined) return undefined;
	return side === 0 ? -room[0] : room[1];
}

/**
 * How far a card that may move stands in from each inner wall of its
 * container: a card inside a container, not lined up with another by a line.
 * @param columns The placed block.
 * @param holds The block's holds.
 * @param name The card.
 * @returns Its room on the left and on the right, or nothing when it stays.
 */
function movableInset(columns: Columns, holds: Holds, name: string): [number, number] | undefined {
	const movable = columns.room.card?.(name) === true && !columns.held.has(name);
	return movable && holds.around(name) !== undefined ? inset(columns, name) : undefined;
}

/**
 * Move every member a hold stood a slot in from its container's wall onto
 * the wall, where that crowds nothing and crosses no line.
 * @param columns The placed block; the moved cards are replaced.
 * @param holds The block's holds; without them nothing moves.
 */
function closeSlots(columns: Columns, holds: Holds | undefined): void {
	if (holds === undefined) return;
	for (const [name, at] of columns.boxes) {
		const shift = slotShift(columns, holds, name);
		const moved = { ...at, x: at.x + (shift ?? 0) };
		if (shift !== undefined && columns.free(name, moved)) columns.boxes.set(name, moved);
	}
}

export { closeSlots, type Holds };
