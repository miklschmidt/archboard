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
 * Group overlapping rows and entire frames into indivisible horizontal bands.
 * @param graph Native downward placement.
 * @returns Consecutive bands, split only where an original relationship continues.
 */
function rowsOf(graph: ElkNode): Band[] {
	const rows: Band[] = [];
	for (const node of (graph.children ?? []).toSorted(
		(one, other) => boxOf(one).y - boxOf(other).y || one.id.localeCompare(other.id),
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
	for (const row of rowsOf(graph)) {
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
 * Balance one column count without enumerating combinations of cut positions.
 * @param bands Indivisible horizontal bands.
 * @param count Requested columns.
 * @param gap Space for continuation routes and labels.
 * @returns One partition minimizing its tallest column, then its total width.
 */
function partitionOf(bands: readonly Band[], count: number, gap: number): Partition | undefined {
	const spans = spansOf(bands);
	let previous = new Map<number, Partition>([[0, { height: 0, width: 0, ends: [] }]]);
	for (let column = 1; column <= count; column++) {
		const next = appendColumn(previous, spans, column, bands.length - (count - column), gap);
		previous = next;
	}
	return previous.get(bands.length);
}

/**
 * Compare balanced prefixes without adding a weighted score.
 * @param candidate The next prefix.
 * @param best The prefix already kept.
 * @returns Whether the candidate has a shorter tallest column or ties with less width.
 */
function better(candidate: Partition, best: Partition | undefined): boolean {
	return (
		best === undefined ||
		candidate.height < best.height ||
		(candidate.height === best.height && candidate.width < best.width)
	);
}

/**
 * Add one column to each retained prefix.
 * @param previous Partitions ending before this column.
 * @param spans Every consecutive band's bounds.
 * @param column The new column number.
 * @param limit Last end leaving room for remaining columns.
 * @param gap Space between columns.
 * @returns Best balanced prefix at each possible end.
 */
function appendColumn(
	previous: ReadonlyMap<number, Partition>,
	spans: readonly Box[][],
	column: number,
	limit: number,
	gap: number,
): Map<number, Partition> {
	const next = new Map<number, Partition>();
	for (let end = column; end <= limit; end++) {
		for (const [start, prefix] of previous) {
			if (start >= end) continue;
			const box = spans[start]![end]!;
			const candidate = {
				height: Math.max(prefix.height, box.height),
				width: prefix.width + box.width + (column === 1 ? 0 : gap),
				ends: [...prefix.ends, end],
			};
			if (better(candidate, next.get(end))) next.set(end, candidate);
		}
	}
	return next;
}

/**
 * Admit counts whose proposed card footprint can reach the required pane fit.
 * @param graph Complete native downward placement.
 * @param minimumFit The minimum fit another column must reach.
 * @returns Feasible additional column counts; one column is always the baseline.
 */
export function foldColumnCounts(graph: ElkNode, minimumFit = fitIn(boxOf(graph))): number[] {
	const bands = bandsOf(graph);
	if (bands.length < 2) return [];
	const extent = boxOf(graph);
	// Adjacent downward columns address a height bottleneck. A width-limited
	// reading does not need more horizontal space or extra native route solves.
	if (REFERENCE_PANE.width / extent.width <= REFERENCE_PANE.height / extent.height) return [];
	if (minimumFit > 1 || fitIn(extent) === 1) return [];
	const widths = [...nodesById(graph).values()].map((node) => boxOf(node).width);
	const narrowest = Math.min(...widths);
	const widest = Math.max(...widths);
	const available = REFERENCE_PANE.width / minimumFit - 2 * DIAGRAM_MARGIN;
	const limit = Math.min(
		bands.length,
		1 + Math.floor((available - widest) / (narrowest + COLUMN_GAP)),
	);
	return Array.from({ length: Math.max(0, limit - 1) }, (_, index) => index + 2).filter((count) => {
		// Check the actual balanced fold before paying for label settlement.
		// Later reservations may change placement; only promising proposals
		// enter that search, using the same settled geometry as their bands.
		const proposed = foldColumns(graph, count);
		return proposed !== undefined && fitIn(boxOf(proposed)) >= minimumFit;
	});
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
 */
function translateLabels(
	graph: ElkNode,
	positions: ReadonlyMap<string, Point & { column: number }>,
	columns: readonly Box[],
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
				label.y = box.y + source.y;
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
	for (const labels of gutters) {
		let bottom = DIAGRAM_MARGIN;
		for (const label of labels.toSorted(
			(one, other) => boxOf(one).y - boxOf(other).y || one.id!.localeCompare(other.id!),
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
	for (const node of (graph.children ?? []).toSorted((one, other) =>
		one.id.localeCompare(other.id),
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
	let left = DIAGRAM_MARGIN;
	for (const [column, nodes] of members.entries()) {
		const box = nodes.map(boxOf).reduce(covering);
		columns.push({ ...box, x: left, y: DIAGRAM_MARGIN });
		translate(nodes, { x: left - box.x, y: DIAGRAM_MARGIN - box.y }, column, positions);
		left += box.width + gap;
	}
	graph.x = 0;
	graph.y = 0;
	graph.width = left - gap + DIAGRAM_MARGIN;
	graph.height = Math.max(...columns.map((column) => column.height)) + 2 * DIAGRAM_MARGIN;
	translateLabels(graph, positions, columns);
	return graph;
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
