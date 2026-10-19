// The lines that join the navigator's rows into a tree: for each row, a
// character for every row it sits under, outermost first, saying what that
// level draws through the row. A row's own place among its siblings is the
// last character, an elbow: the line comes down from the parent, turns to the
// row, and goes on to the next sibling unless the row is the last, where it
// ends. The levels above it carry the line through only while the row they
// descend from has later siblings. Pure.
//
// The characters: `-` nothing, `t` the line passes through, `e` an elbow with
// the line going on, `l` the last elbow. Along the way to the selected row the
// path is lit: `T` passes through lit, `E` an elbow whose line is lit and whose
// branch is not on the path, `P` the elbow of a row on the path with the line
// going on, and `L` the last elbow of a row on the path.
//
// A board's variants and its Earlier row carry a timeline of their own, whose
// line and branches say how they stand to each other. The guides join them to
// their board and stop there, so the two do not draw the same structure twice.

/** What a row says about its place. */
interface Placed {
	readonly id: string;
	readonly depth: number;
	readonly parentId: string | null;
}

/** What the guides of every row are drawn from. */
interface Tree<Row extends Placed> {
	/** Each row by id. */
	readonly byId: ReadonlyMap<string, Row>;
	/** The rows that end their parent's list. */
	readonly lasts: ReadonlySet<string>;
	/** The order of the row the way to the selected row goes down to, by the id of the row it goes down from. */
	readonly down: ReadonlyMap<string, number>;
}

type Lit = "none" | "line" | "branch";

/** The character of an elbow, by whether the row is the last of its siblings and by how it is lit. */
const ELBOWS: Readonly<Record<"going" | "ending", Readonly<Record<Lit, string>>>> = {
	going: { none: "e", line: "E", branch: "P" },
	ending: { none: "l", line: "l", branch: "L" },
};

/**
 * The guides of every row that sits under another.
 * @param rows The rows, in order.
 * @param selected Whether a row is the selected one, whose way is lit.
 * @param timeline The depth of the first level of each row on a timeline, by id; the
 * guides of the levels from there down are left to the timeline.
 * @returns Each row's guides, by id; a top row has none.
 */
function treeGuides<Row extends Placed>(
	rows: readonly Row[],
	selected: (row: Row) => boolean,
	timeline: ReadonlyMap<string, number> = new Map(),
): ReadonlyMap<string, string> {
	const byId = new Map(rows.map((row) => [row.id, row]));
	const lastOf = new Map(rows.map((row) => [row.parentId, row.id]));
	const order = new Map(rows.map((row, index) => [row.id, index]));
	const target = rows.find(selected);
	const way = target === undefined ? [] : chain(byId, target);
	const down = new Map(way.slice(1).map((row, above) => [way[above]!.id, order.get(row.id)!]));
	const tree: Tree<Row> = { byId, lasts: new Set(lastOf.values()), down };
	return new Map(
		rows.map((row, index) => [row.id, leave(guideLine(tree, row, index), timeline.get(row.id))]),
	);
}

/**
 * The rows from the top down to a row, itself included.
 * @param byId The rows by id.
 * @param row The row.
 * @returns One row for each depth, outermost first.
 */
function chain<Row extends Placed>(byId: ReadonlyMap<string, Row>, row: Row): Row[] {
	const rows: Row[] = [row];
	for (let up = row; up.parentId !== null;) {
		const parent = byId.get(up.parentId);
		if (parent === undefined) break;
		rows.unshift(parent);
		up = parent;
	}
	return rows;
}

/**
 * One row's guides.
 * @param tree What the guides are drawn from.
 * @param row The row.
 * @param index The row's order in the list.
 * @returns One character for each row it sits under.
 */
function guideLine<Row extends Placed>(tree: Tree<Row>, row: Row, index: number): string {
	const above = chain(tree.byId, row);
	let line = "";
	for (let level = 0; level < above.length - 1; level += 1) {
		const child = above[level + 1]!;
		const lit = litFrom(tree, above[level]!.id, index);
		line += mark(level === above.length - 2, tree.lasts.has(child.id), lit);
	}
	return line;
}

/**
 * Whether the line down from a row is lit through another row, and whether that
 * other row is where the way to the selected row turns off it.
 * @param tree What the guides are drawn from.
 * @param parentId The row the line comes down from.
 * @param index The order of the row the line is drawn through, below the parent.
 * @returns `branch` where the way turns off, `line` above it, else `none`.
 */
function litFrom<Row extends Placed>(tree: Tree<Row>, parentId: string, index: number): Lit {
	const down = tree.down.get(parentId);
	if (down === undefined) return "none";
	if (index === down) return "branch";
	return index < down ? "line" : "none";
}

/**
 * The character for one level of one row.
 * @param own Whether the level is the row's own, which turns to the row.
 * @param last Whether the row at this level is the last of its siblings.
 * @param lit How the line is lit here.
 * @returns The character.
 */
function mark(own: boolean, last: boolean, lit: Lit): string {
	if (own) return ELBOWS[last ? "ending" : "going"][lit];
	if (last) return "-";
	return lit === "none" ? "t" : "T";
}

/**
 * A row's guides without the levels a timeline draws.
 * @param line The row's guides.
 * @param first The depth of the timeline's first level, if the row is on one.
 * @returns The guides.
 */
function leave(line: string, first: number | undefined): string {
	return first === undefined ? line : line.slice(0, first).padEnd(line.length, "-");
}

export { treeGuides };
