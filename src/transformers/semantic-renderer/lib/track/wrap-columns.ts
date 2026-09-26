// Straight lines through a wrap (visual polish). A wrap deals a rank's cards
// into rows and holds each lowered card under the card dealt above it, which
// says nothing of the card's own lines: a lowered card can stand under an
// unrelated card while the column under its own line's other end stays
// empty, or stand across a line between two cards that would otherwise drop
// straight. Graphviz draws every line centre to centre, so it never sees that
// a line could run straight down some other column of the two faces.
//
// Once Graphviz has placed the wrap, two moves keep such a line straight. A
// lowered card whose one line comes from a block's port moves along its row,
// as near under the port as it may, until the port stands over its face;
// it stays under a card of the row above, so the wrap still wraps. A lowered
// card standing between a line's ends, where no column lets the line drop
// straight past it, steps aside by the least that opens one, at most a few
// lanes, when it crowds nothing and every line of its own that ran straight
// still does.
import { FACE_MARGIN, LANE } from "@/transformers/semantic-renderer/lib/track/chains";
import type { Columns, Join } from "@/transformers/semantic-renderer/lib/track/graphviz";
import { sinks } from "@/transformers/semantic-renderer/lib/track/score";
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";

/** The wrap Graphviz placed a block's rank by. */
interface Wrap {
	/** Every card of the wrapped rank and the row it was dealt to. */
	readonly rows: ReadonlyMap<string, number>;
	/**
	 * The innermost cluster around a card, if any.
	 * @param card The card.
	 * @returns The cluster.
	 */
	readonly around: (card: string) => string | undefined;
}

/** The furthest a card standing in a line's way steps aside: four lanes. */
const STEP_ASIDE = 4 * LANE;
/** How finely a card moving under a port searches its row. */
const SEARCH_STEP = 2;

/** Items a line passes over rather than around: containers and their parts. */
const HOLLOW = /^(?:cluster:|title:|pin:|port:|stub:|header:)/u;

/**
 * Where a line may meet an item straight: a card's face short of its
 * corners, a label's box short of a lane, a port's own point.
 * @param columns The placed items.
 * @param name The item.
 * @returns The span.
 */
function reach(columns: Columns, name: string): [number, number] {
	const at = columns.boxes.get(name)!;
	const margin = Math.min(name.startsWith("label:") ? LANE : FACE_MARGIN, at.width / 2);
	return [at.x + margin, at.x + at.width - margin];
}

/**
 * Where both ends of a line may meet it straight, if anywhere.
 * @param columns The placed items.
 * @param join The line.
 * @returns The span both reach.
 */
function common(columns: Columns, join: Join): [number, number] | undefined {
	const [[a, b], [c, d]] = [reach(columns, join.tail), reach(columns, join.head)];
	const [low, high] = [Math.max(a, c), Math.min(b, d)];
	return low <= high ? [low, high] : undefined;
}

/**
 * The items standing wholly between a line's two ends that it must pass
 * around: every card and label but its own.
 * @param columns The placed items.
 * @param join The line.
 * @returns Each item and its box.
 */
function standing(columns: Columns, join: Join): [string, Box][] {
	const [top, low] = [columns.boxes.get(join.tail)!, columns.boxes.get(join.head)!];
	const own = new Set([join.tail, join.head, join.label]);
	return [...columns.boxes].filter(
		([name, at]) =>
			!own.has(name) &&
			!HOLLOW.test(name) &&
			at.y >= top.y + top.height - 0.5 &&
			at.y + at.height <= low.y + 0.5,
	);
}

/**
 * The stretch of x a box keeps a passing lane off: the box and a lane
 * either side.
 * @param at The box.
 * @returns The stretch, open at both ends.
 */
function kept(at: Box): [number, number] {
	return [at.x - LANE, at.x + at.width + LANE];
}

/**
 * What stays of a span once some stretches are taken out of it.
 * @param span The span.
 * @param taken The stretches, each open at both ends.
 * @returns The free parts, left to right, each closed.
 */
function openParts(span: [number, number], taken: readonly [number, number][]): [number, number][] {
	const parts: [number, number][] = [];
	let low = span[0];
	for (const [start, end] of taken.toSorted(([one], [other]) => one - other)) {
		if (end <= low || start >= span[1]) continue;
		if (start >= low) parts.push([low, start]);
		low = end;
	}
	if (low <= span[1]) parts.push([low, span[1]]);
	return parts;
}

/**
 * Whether a line may drop straight: some x both its ends reach that nothing
 * standing between them keeps a lane off.
 * @param columns The placed items.
 * @param join The line.
 * @returns True when it may.
 */
function straight(columns: Columns, join: Join): boolean {
	const span = common(columns, join);
	if (span === undefined) return false;
	return (
		openParts(
			span,
			standing(columns, join).map(([, at]) => kept(at)),
		).length > 0
	);
}

/**
 * The lines an item is an end of.
 * @param columns The placed items.
 * @param name The item.
 * @returns The lines.
 */
function linesOf(columns: Columns, name: string): Join[] {
	return columns.joins.filter(({ tail, head }) => tail === name || head === name);
}

/**
 * Whether a card was lowered by the wrap.
 * @param wrap The wrap.
 * @param name The item.
 * @returns True for a lowered card.
 */
function lowered(wrap: Wrap, name: string): boolean {
	return (wrap.rows.get(name) ?? 0) > 0;
}

/**
 * Whether the wrap, as the items now stand, sinks a card off the rows above it.
 * @param columns The placed items.
 * @param wrap The wrap.
 * @returns True when it does.
 */
function sunk(columns: Columns, wrap: Wrap): boolean {
	const plan = new Map([...wrap.rows].filter(([card]) => columns.boxes.has(card)));
	return sinks(plan, columns.boxes, wrap.around);
}

/**
 * The lowered card at one end of a line whose other end is a block's port,
 * when the line is the card's only one.
 * @param columns The placed items.
 * @param wrap The wrap.
 * @param join The line.
 * @returns The card and the port, or nothing.
 */
function underPort(columns: Columns, wrap: Wrap, join: Join): [string, string] | undefined {
	const ends: [string, string][] = [
		[join.head, join.tail],
		[join.tail, join.head],
	];
	return ends.find(
		([card, port]) =>
			port.startsWith("pin:") &&
			lowered(wrap, card) &&
			columns.room.card?.(card) === true &&
			linesOf(columns, card).length === 1,
	);
}

/**
 * The offsets from a port's x a card's centre may take and still reach it
 * with its face, nearest first.
 * @param width The card's width.
 * @returns The offsets, a search step apart.
 */
function offsetsUnder(width: number): number[] {
	const most = Math.floor((width / 2 - FACE_MARGIN) / SEARCH_STEP);
	return Array.from({ length: 2 * most + 1 }, (_, index) =>
		index % 2 === 0 ? (index / 2) * SEARCH_STEP : -((index + 1) / 2) * SEARCH_STEP,
	);
}

/**
 * Move a lowered card whose one line comes from a block's port along its row,
 * as near under the port as it may stand with its line straight: nearer
 * than it stands, when its line drops straight already.
 * @param columns The placed items.
 * @param wrap The wrap.
 * @param join The line.
 * @returns Whether it moved.
 */
function moveUnderPort(columns: Columns, wrap: Wrap, join: Join): boolean {
	const [card, port] = underPort(columns, wrap, join) ?? [];
	if (card === undefined) return false;
	const was = columns.boxes.get(card)!;
	const [x] = reach(columns, port!);
	const now = straight(columns, join) ? Math.abs(was.x + was.width / 2 - x) : Infinity;
	return offsetsUnder(was.width)
		.filter((offset) => Math.abs(offset) < now - 0.5)
		.some((offset) => {
			const at = columns.moved(card, x + offset);
			if (!columns.free(card, at)) return false;
			columns.boxes.set(card, at);
			if (straight(columns, join) && !sunk(columns, wrap)) return true;
			columns.boxes.set(card, was);
			return false;
		});
}

/**
 * The shifts that would take a card out of a line's way: to the near side of
 * each column left open by everything else standing there, nearest first.
 * @param columns The placed items.
 * @param join The line.
 * @param card The card in its way.
 * @returns The shifts, none beyond a step aside.
 */
function shiftsAside(columns: Columns, join: Join, card: string): number[] {
	const at = columns.boxes.get(card)!;
	const others = standing(columns, join).filter(([name]) => name !== card);
	return openParts(
		common(columns, join)!,
		others.map(([, box]) => kept(box)),
	)
		.flatMap(([low, high]) => [high - LANE - (at.x + at.width), low + LANE - at.x])
		.filter((shift) => Math.abs(shift) >= 0.5 && Math.abs(shift) <= STEP_ASIDE)
		.toSorted((one, other) => Math.abs(one) - Math.abs(other));
}

/**
 * Step one lowered card out of a line's way, by the least that opens a
 * column, where it crowds nothing and keeps its own straight lines straight.
 * The lines Graphviz drew past it are not asked: they are routed again.
 * @param columns The placed items.
 * @param join The line.
 * @param card The card.
 * @returns Whether it moved.
 */
function stepAside(columns: Columns, join: Join, card: string): boolean {
	const was = columns.boxes.get(card)!;
	const own = linesOf(columns, card).filter(
		(line) => columns.stacked().includes(line) && straight(columns, line),
	);
	return shiftsAside(columns, join, card).some((shift) => {
		const at = { ...was, x: was.x + shift };
		if (!columns.roomy(card, at)) return false;
		columns.boxes.set(card, at);
		if (straight(columns, join) && own.every((line) => straight(columns, line))) return true;
		columns.boxes.set(card, was);
		return false;
	});
}

/**
 * Whether a stretch a box keeps a lane off reaches into a span.
 * @param stretch The stretch, open at both ends.
 * @param span The span.
 * @returns True when it does.
 */
function into(stretch: [number, number], span: [number, number]): boolean {
	return stretch[0] < span[1] && stretch[1] > span[0];
}

/**
 * Open a straight column for a line the wrap closed: move its lone lowered
 * end under its port, else step a lowered card in its way aside.
 * @param columns The placed items.
 * @param wrap The wrap.
 * @param join The line.
 */
function clearLine(columns: Columns, wrap: Wrap, join: Join): void {
	if (moveUnderPort(columns, wrap, join) || straight(columns, join)) return;
	const span = common(columns, join);
	if (span === undefined) return;
	standing(columns, join)
		.filter(
			([name, at]) =>
				lowered(wrap, name) && columns.room.card?.(name) === true && into(kept(at), span),
		)
		.some(([name]) => stepAside(columns, join, name));
}

/**
 * Keep the lines through a wrap straight where a lowered card stood in their
 * way: every line stacked from one rank to a lower one, in turn.
 * @param columns The placed items, lined up.
 * @param wrap The wrap they were placed by, if any.
 */
function clearWrap(columns: Columns, wrap: Wrap | undefined): void {
	if (wrap === undefined || ![...wrap.rows.values()].some((row) => row > 0)) return;
	for (const join of columns.stacked()) clearLine(columns, wrap, join);
}

export { clearWrap, type Wrap };
