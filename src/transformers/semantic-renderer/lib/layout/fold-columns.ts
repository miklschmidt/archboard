import type { ElkLabel, ElkNode } from "@archboard/elk-rs";
import { fitIn, REFERENCE_PANE } from "@/shared/shell-geometry/index";
import {
	COLUMN_GAP,
	DIAGRAM_MARGIN,
	LABEL_CARD_CLEARANCE,
	LABEL_LABEL_CLEARANCE,
} from "@/transformers/semantic-renderer/config";
import { covering, type Box, type Point } from "@/transformers/semantic-renderer/lib/geometry";
import { boxOf } from "@/transformers/semantic-renderer/lib/layout/avoid-geometry";
import { semanticOrder } from "@/transformers/semantic-renderer/lib/layout/semantic-order";

interface Band {
	readonly nodes: ElkNode[];
	readonly box: Box;
}
interface Partition {
	readonly height: number;
	readonly width: number;
	readonly ends: number[];
}

/**
 * Collect global geometry without flattening semantic containment.
 * @param nodes One containment level.
 * @returns Every node, with each parent before its descendants.
 */
function flattened(nodes: readonly ElkNode[]): ElkNode[] {
	return nodes.flatMap((node) => [node, ...flattened(node.children ?? [])]);
}

/**
 * Address every original endpoint, including a frame's descendants.
 * @param graph Complete hierarchy.
 * @returns Semantic identities mapped to their globally placed nodes.
 */
function nodesById(graph: ElkNode): Map<string, ElkNode> {
	return new Map(flattened(graph.children ?? []).map((node) => [node.id, node]));
}

/**
 * Group overlapping cards and entire frames into rows.
 * @param nodes One containment level, where it stands.
 * @returns Its rows, top to bottom.
 */
function rowsOf(nodes: readonly ElkNode[]): Band[] {
	const rows: Band[] = [];
	for (const node of nodes.toSorted(
		(one, other) => boxOf(one).y - boxOf(other).y || semanticOrder(one) - semanticOrder(other),
	)) {
		const box = boxOf(node);
		const previous = rows.at(-1);
		if (previous !== undefined && box.y <= previous.box.y + previous.box.height) {
			rows[rows.length - 1] = {
				nodes: [...previous.nodes, node],
				box: covering(previous.box, box),
			};
		} else rows.push({ nodes: [node], box });
	}
	return rows;
}

/**
 * Keep disconnected rows together rather than inventing a continuation.
 * @param graph Native placement and original relationships.
 * @returns Rows separated only by connected gaps.
 */
function bandsOf(graph: ElkNode): Band[] {
	const byId = nodesById(graph);
	const bands: Band[] = [];
	for (const row of rowsOf(graph.children ?? [])) {
		const previous = bands.at(-1);
		const continues = (graph.edges ?? []).some((edge) => {
			const from = boxOf(byId.get(edge.sources[0]!)!);
			const to = boxOf(byId.get(edge.targets[0]!)!);
			return from.y < row.box.y !== to.y < row.box.y;
		});
		if (previous !== undefined && !continues) {
			bands[bands.length - 1] = {
				nodes: [...previous.nodes, ...row.nodes],
				box: covering(previous.box, row.box),
			};
		} else bands.push(row);
	}
	return bands;
}

/**
 * Cover every consecutive band once for the balanced partition calculation.
 * @param bands Indivisible native rows.
 * @returns Bounds indexed by inclusive start and exclusive end.
 */
function spansOf(bands: readonly Band[]): Box[][] {
	return bands.map((band, start) => {
		const spans: Box[] = [];
		let box = band.box;
		for (let end = start + 1; end <= bands.length; end++) {
			box = covering(box, bands[end - 1]!.box);
			spans[end] = box;
		}
		return spans;
	});
}

/**
 * Keep width/height tradeoffs until the complete partition can be compared by fit.
 * @param bands Indivisible horizontal bands.
 * @param count Requested columns.
 * @param gap Space for continuation routes and labels.
 * @returns The best pane fit, with shorter then narrower columns breaking ties.
 */
function partitionOf(bands: readonly Band[], count: number, gap: number): Partition | undefined {
	const spans = spansOf(bands);
	let previous = new Map<number, Partition[]>([[0, [{ height: 0, width: 0, ends: [] }]]]);
	for (let column = 1; column <= count; column++) {
		const next = appendColumn(
			previous,
			spans,
			column,
			bands.length - (count - column),
			column === 1 ? 0 : gap,
		);
		previous = next;
	}
	return previous
		.get(bands.length)
		?.reduce((best, candidate) => (better(candidate, best) ? candidate : best));
}

/**
 * Include the drawing's margins when fitting its column footprint.
 * @param partition Complete column footprint.
 * @returns Its scale in the reference pane.
 */
function partitionFit(partition: Partition): number {
	return fitIn({
		width: partition.width + 2 * DIAGRAM_MARGIN,
		height: partition.height + 2 * DIAGRAM_MARGIN,
	});
}

/**
 * Compare complete partitions in the same pane as the resulting drawing.
 * @param candidate The next complete partition.
 * @param best The complete partition already kept.
 * @returns Whether fit improves, then height or width breaks an equal-fit tie.
 */
function better(candidate: Partition, best: Partition): boolean {
	const difference = partitionFit(candidate) - partitionFit(best);
	return (
		difference > 0 ||
		(difference === 0 &&
			(candidate.height < best.height ||
				(candidate.height === best.height && candidate.width < best.width)))
	);
}

/**
 * Drop a prefix only when another is no worse in either dimension.
 * @param partitions Tradeoffs already retained at the same band and column count.
 * @param candidate Another prefix with the same remaining work.
 * @returns The nondominated prefixes; equal geometry retains the earlier cuts.
 */
function retain(partitions: Partition[], candidate: Partition): Partition[] {
	if (
		partitions.some((other) => other.height <= candidate.height && other.width <= candidate.width)
	)
		return partitions;
	return [
		...partitions.filter(
			(other) => other.height < candidate.height || other.width < candidate.width,
		),
		candidate,
	];
}

/**
 * Add one column to each retained prefix.
 * @param previous Partitions ending before this column.
 * @param spans Every consecutive band's bounds.
 * @param column The new column number.
 * @param limit Last end leaving room for remaining columns.
 * @param gap Space before this column, zero for the first.
 * @returns Nondominated prefixes at each possible end.
 */
function appendColumn(
	previous: ReadonlyMap<number, Partition[]>,
	spans: readonly Box[][],
	column: number,
	limit: number,
	gap: number,
): Map<number, Partition[]> {
	const next = new Map<number, Partition[]>();
	for (let end = column; end <= limit; end++) {
		for (const [start, prefixes] of previous) {
			if (start >= end) continue;
			const box = spans[start]![end]!;
			for (const prefix of prefixes) {
				const candidate = {
					height: Math.max(prefix.height, box.height),
					width: prefix.width + box.width + gap,
					ends: [...prefix.ends, end],
				};
				next.set(end, retain(next.get(end) ?? [], candidate));
			}
		}
	}
	return next;
}

/**
 * Bound candidate counts using fixed card widths, before fresh label settlement.
 * @param graph Complete native downward placement.
 * @param minimumFit The minimum fit another column must reach.
 * @returns Feasible additional column counts; one column is always the baseline.
 */
export function foldColumnCounts(graph: ElkNode, minimumFit = fitIn(boxOf(graph))): number[] {
	const bands = bandsOf(graph);
	if (bands.length < 2) return [];
	const extent = boxOf(graph);
	// Wrapping addresses a height bottleneck. A width-limited reading does
	// not call for more horizontal space or additional native route solves.
	if (REFERENCE_PANE.width / extent.width <= REFERENCE_PANE.height / extent.height) return [];
	if (minimumFit > 1 || fitIn(extent) === 1) return [];
	// Every column holds at least one fixed-size leaf card. Frame widths and
	// row offsets can shrink when labels settle afresh, so neither is a bound.
	const widths = [...nodesById(graph).values()]
		.filter((node) => !node.children?.length)
		.map((node) => boxOf(node).width);
	const narrowest = Math.min(...widths);
	const widest = Math.max(...widths);
	const available = REFERENCE_PANE.width / minimumFit - 2 * DIAGRAM_MARGIN;
	const limit = Math.min(
		bands.length,
		1 + Math.floor((available - widest) / (narrowest + COLUMN_GAP)),
	);
	return Array.from({ length: Math.max(0, limit - 1) }, (_, index) => index + 2);
}

/**
 * Translate each complete hierarchy and remember its column for edge labels.
 * @param nodes The column's top-level nodes.
 * @param delta Its translation from native placement.
 * @param column Its zero-based column.
 * @param positions Translations and column membership by semantic identity.
 */
function translate(
	nodes: readonly ElkNode[],
	delta: Point,
	column: number,
	positions: Map<string, Point & { column: number }>,
): void {
	for (const node of flattened(nodes)) {
		const box = boxOf(node);
		node.x = box.x + delta.x;
		node.y = box.y + delta.y;
		positions.set(node.id, { ...delta, column });
	}
}

/**
 * Keep internal reservations with their column and put continuation labels in the gutter.
 * @param graph Translated hierarchy with its original relationships.
 * @param positions Each identity's translation and column.
 * @param columns Bounds of the complete columns, including their widest frames.
 * @param rows Each column's rows and how far each dropped to meet its neighbours.
 */
function translateLabels(
	graph: ElkNode,
	positions: ReadonlyMap<string, Point & { column: number }>,
	columns: readonly Box[],
	rows: readonly (readonly DroppedRow[])[],
): void {
	const nodes = nodesById(graph);
	const gutters: ElkLabel[][] = Array.from({ length: columns.length - 1 }, () => []);
	for (const edge of graph.edges ?? []) {
		const source = positions.get(edge.sources[0]!)!;
		const target = positions.get(edge.targets[0]!)!;
		for (const label of edge.labels ?? []) {
			const box = boxOf(label);
			if (source.column === target.column) {
				label.x = box.x + source.x;
				label.y = box.y + source.y + dropAt(rows[source.column]!, box.y + source.y);
			} else {
				const from = boxOf(nodes.get(edge.sources[0]!)!);
				const to = boxOf(nodes.get(edge.targets[0]!)!);
				const gutter = Math.min(source.column, target.column);
				const left = columns[gutter]!;
				const right = columns[gutter + 1]!;
				label.x = (left.x + left.width + right.x - box.width) / 2;
				label.y = (from.y + from.height / 2 + to.y + to.height / 2 - box.height) / 2;
				gutters[gutter]!.push(label);
			}
		}
		delete edge.sections;
	}
	stackLabels(graph, gutters);
}

/**
 * Give each reserved continuation label its own vertical space in the gutter.
 * @param graph Drawing extent to enlarge when reservations need more room.
 * @param gutters Reserved labels grouped by their actual column gutter.
 */
function stackLabels(graph: ElkNode, gutters: readonly ElkLabel[][]): void {
	const order = new Map(
		(graph.edges ?? []).map((edge) => [edge.labels?.[0]?.id, semanticOrder(edge)]),
	);
	for (const labels of gutters) {
		let bottom = DIAGRAM_MARGIN;
		for (const label of labels.toSorted(
			(one, other) =>
				boxOf(one).y - boxOf(other).y || (order.get(one.id) ?? 0) - (order.get(other.id) ?? 0),
		)) {
			label.y = Math.max(boxOf(label).y, bottom);
			bottom = label.y + boxOf(label).height + LABEL_LABEL_CLEARANCE;
			graph.height = Math.max(graph.height!, label.y + boxOf(label).height + DIAGRAM_MARGIN);
		}
	}
}

/**
 * Keep a side-entry source with the column containing all its consumers.
 * @param node A top-level semantic node.
 * @param graph Original relationships.
 * @param membership Each endpoint's planned column.
 * @returns Its sole consumer column when this leaf has no incoming relationship.
 */
function consumerColumn(
	node: ElkNode,
	graph: ElkNode,
	membership: ReadonlyMap<string, number>,
): number | undefined {
	if (node.children?.length) return undefined;
	const edges = graph.edges ?? [];
	if (edges.some((edge) => edge.targets.includes(node.id))) return undefined;
	const consumers = new Set(
		edges
			.filter((edge) => edge.sources.includes(node.id))
			.flatMap((edge) => edge.targets.map((id) => membership.get(id)!)),
	);
	return consumers.size === 1 ? [...consumers][0] : undefined;
}

/**
 * Build whole columns, retaining a side-entry source's native offset from its consumer.
 * @param graph Original semantic hierarchy and relationships.
 * @param bands Indivisible native rows.
 * @param partition Balanced split points.
 * @returns Complete top-level hierarchies per column.
 */
function columnMembers(graph: ElkNode, bands: readonly Band[], partition: Partition): ElkNode[][] {
	let start = 0;
	const columns = partition.ends.map((end) => {
		const nodes = bands.slice(start, end).flatMap((band) => band.nodes);
		start = end;
		return nodes;
	});
	const membership = new Map(
		columns.flatMap((nodes, column) => flattened(nodes).map((node) => [node.id, column] as const)),
	);
	for (const node of (graph.children ?? []).toSorted(
		(one, other) => semanticOrder(one) - semanticOrder(other),
	)) {
		const from = membership.get(node.id)!;
		const to = consumerColumn(node, graph, membership);
		if (to === undefined || to === from || columns[from]!.length === 1) continue;
		columns[from] = columns[from]!.filter((member) => member !== node);
		columns[to]!.push(node);
	}
	return columns;
}

/**
 * Fold a measured downward placement into adjacent downward columns before routing.
 * @param placed Native placement, never mutated.
 * @param count Requested column count.
 * @returns A complete alternate placement, or no partition for that count.
 */
export function foldColumns(placed: ElkNode, count: number): ElkNode | undefined {
	if (!Number.isInteger(count) || count < 2) return undefined;
	const graph = structuredClone(placed);
	const bands = bandsOf(graph);
	if (count > bands.length) return undefined;
	const gap = gapOf(graph);
	const partition = partitionOf(bands, count, gap);
	if (partition === undefined) return undefined;
	const members = columnMembers(graph, bands, partition);
	const positions = new Map<string, Point & { column: number }>();
	const columns: Box[] = [];
	const boxes = members.map((nodes) => nodes.map(boxOf).reduce(covering));
	const tallest = Math.max(...boxes.map((box) => box.height));
	let left = DIAGRAM_MARGIN;
	for (const [column, nodes] of members.entries()) {
		const box = boxes[column]!;
		const top = DIAGRAM_MARGIN + columnDrop(graph, nodes, positions, box, tallest - box.height);
		columns.push({ ...box, x: left, y: top });
		translate(nodes, { x: left - box.x, y: top - box.y }, column, positions);
		left += box.width + gap;
	}
	const rows = alignRows(members.map(rowsOf));
	graph.x = 0;
	graph.y = 0;
	graph.width = left - gap + DIAGRAM_MARGIN;
	graph.height = Math.max(...flattened(members.flat()).map((node) => bottomOf(boxOf(node))));
	graph.height += DIAGRAM_MARGIN;
	translateLabels(graph, positions, columns, rows);
	return graph;
}

/**
 * How far a continuation column drops below the page's top: the median of the
 * drops that would level each of its relationships with an earlier column,
 * within the room the tallest column leaves. A column's top once always met
 * the page's, so a card whose only neighbour sat at the foot of the column
 * before stood at the top and its line climbed the whole page.
 * @param graph The hierarchy and its relationships.
 * @param nodes The column's top-level members, still where they were placed.
 * @param placed Each identity already placed in an earlier column.
 * @param box The column's bounds.
 * @param room How far it may drop without growing the page.
 * @returns The drop.
 */
function columnDrop(
	graph: ElkNode,
	nodes: readonly ElkNode[],
	placed: ReadonlyMap<string, unknown>,
	box: Box,
	room: number,
): number {
	const inside = new Map(flattened(nodes).map((node) => [node.id, node]));
	const all = nodesById(graph);
	const drops = (graph.edges ?? []).flatMap((edge) => {
		const ends = [edge.sources[0]!, edge.targets[0]!];
		const own = ends.find((id) => inside.has(id));
		const other = ends.find((id) => placed.has(id));
		if (own === undefined || other === undefined) return [];
		return [
			middle(boxOf(all.get(other)!)) - (middle(boxOf(inside.get(own)!)) - box.y + DIAGRAM_MARGIN),
		];
	});
	if (drops.length === 0) return 0;
	const sorted = drops.toSorted((one, other) => one - other);
	return Math.max(0, Math.min(room, sorted[Math.floor((sorted.length - 1) / 2)]!));
}

/** A folded column's row: where its top stood, and how far it dropped to meet its neighbours. */
interface DroppedRow {
	readonly top: number;
	readonly drop: number;
}

/** A row of one column to drop, and by how much, to meet a row of the next. */
interface Meeting {
	readonly column: number;
	readonly row: number;
	readonly by: number;
	/** The higher top of the two rows, which orders the meetings top-down. */
	readonly top: number;
}

/**
 * Drop rows so that rows of neighbouring columns that read as one row share a
 * centre, as Graphviz centres a rank. Each column was placed whole, stacked at
 * its own rank pitch, so rows of different heights drifted apart down the
 * columns. The topmost pair that misses meets first: the higher row drops with
 * every row below it in its column, so no gap in a column shrinks and nothing
 * above that pair moves.
 * @param columns Each column's rows, top to bottom, where the fold put them.
 * @returns Each column's rows with the drop each one took; their nodes are moved.
 */
function alignRows(columns: readonly Band[][]): DroppedRow[][] {
	const drops = columns.map((rows) => rows.map(() => 0));
	// Every meeting moves some row down and no row ever rises, so this bound
	// only keeps a pathological fold from searching without end.
	const limit = drops.flat().length ** 2;
	for (let round = 0; round < limit; round++) {
		const meeting = nextMeeting(columns, drops);
		if (meeting === undefined) break;
		const rows = drops[meeting.column]!;
		for (let row = meeting.row; row < rows.length; row++) rows[row]! += meeting.by;
	}
	return columns.map((rows, column) =>
		rows.map((row, index) => {
			const drop = drops[column]![index]!;
			for (const node of flattened(row.nodes)) node.y = boxOf(node).y + drop;
			return { top: row.box.y, drop };
		}),
	);
}

/**
 * The topmost pair of rows in neighbouring columns that read as one row but
 * miss a shared centre.
 * @param columns Each column's rows where the fold put them.
 * @param drops How far each row has dropped so far.
 * @returns The meeting to make, or nothing when every such pair meets.
 */
function nextMeeting(columns: readonly Band[][], drops: readonly number[][]): Meeting | undefined {
	const dropped = columns.map((rows, column) =>
		rows.map(({ box }, row) => ({ ...box, y: box.y + drops[column]![row]! })),
	);
	return dropped
		.slice(1)
		.flatMap((right, index) => meetings(dropped[index]!, right, index))
		.reduce<Meeting | undefined>(
			(best, meeting) => (best && best.top <= meeting.top ? best : meeting),
			undefined,
		);
}

/**
 * Every row of one column that reads as one row with a row of the next but
 * misses its centre, with the drop that makes the two meet.
 * @param left The column's rows where they stand now.
 * @param right The next column's rows.
 * @param column The left column's index.
 * @returns The meetings.
 */
function meetings(left: readonly Box[], right: readonly Box[], column: number): Meeting[] {
	return left.flatMap((one, row) => {
		const partner = right.findIndex((other) => oneRow(one, other));
		const other = right[partner];
		const by = other === undefined ? 0 : middle(other) - middle(one);
		if (other === undefined || Math.abs(by) < 0.5) return [];
		const top = Math.min(one.y, other.y);
		return [by > 0 ? { column, row, by, top } : { column: column + 1, row: partner, by: -by, top }];
	});
}

/**
 * Whether two rows of neighbouring columns read as one row: each one's centre
 * lies within the other's height. Rows in one column never overlap, so a row
 * reads as one with at most one row of the next column.
 * @param one A row.
 * @param other A row of the next column.
 * @returns True when they read as one row.
 */
function oneRow(one: Box, other: Box): boolean {
	const [mine, theirs] = [middle(one), middle(other)];
	return theirs >= one.y && theirs <= bottomOf(one) && mine >= other.y && mine <= bottomOf(other);
}

/**
 * The drop a column's rows took where a label inside the column stands: the
 * drop of the lowest row whose top is at or above it. Drops never shrink down
 * a column, so the label keeps its clearance on both sides.
 * @param rows The column's rows.
 * @param y The label's top before rows dropped.
 * @returns The drop.
 */
function dropAt(rows: readonly DroppedRow[], y: number): number {
	return rows.findLast((row) => row.top <= y)?.drop ?? 0;
}

/**
 * A box's bottom edge.
 * @param box The box.
 * @returns Its bottom's y.
 */
function bottomOf(box: Box): number {
	return box.y + box.height;
}

/**
 * A box's vertical centre.
 * @param box The box.
 * @returns Its centre's y.
 */
function middle(box: Box): number {
	return box.y + box.height / 2;
}

/**
 * Leave room for the widest measured reservation between columns.
 * @param graph Labels measured by the renderer.
 * @returns The gutter width.
 */
function gapOf(graph: ElkNode): number {
	return Math.max(
		COLUMN_GAP,
		...(graph.edges ?? []).flatMap((edge) =>
			(edge.labels ?? []).map((label) => boxOf(label).width + 2 * LABEL_CARD_CLEARANCE),
		),
	);
}
