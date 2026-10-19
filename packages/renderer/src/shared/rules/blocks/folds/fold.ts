// Folding a block of cards into columns. A block whose ranks stack taller than
// the page reads better as newspaper columns: its ranks, cut into runs, stand
// side by side, each run a column block of its own. Here the cut is chosen and
// the block's lines are cut where they leave and enter a column;
// `fold-layout.ts` draws the folded block.
import type { Band, Insets, Laid } from "#shared/rules/blocks/tree/laid.ts";
import type { Block, BlockTree, Line, Piece } from "#shared/rules/blocks/tree/tree.ts";
import { channelHeight } from "#shared/rules/track/channels/spacing.ts";
import {
	crossingsOf,
	scoreOf,
	scoresBetter,
	type Weighed,
} from "#shared/rules/track/scene/score.ts";

/** The narrowest gutter between two columns. */
const MIN_GUTTER = 48;
/** The most columns a block folds into. */
const MOST_COLUMNS = 4;
/** How much better a fold must fit the page than the block unfolded. */
const WORTH_FOLDING = 1.1;

/**
 * Every way to cut some bands into two to {@link MOST_COLUMNS} runs, as the
 * index each later run starts at.
 * @param count How many bands.
 * @param from The first band a later run may start at.
 * @param chosen The starts chosen so far.
 * @returns The cuts.
 */
function cutsOf(count: number, from = 1, chosen: readonly number[] = []): number[][] {
	if (chosen.length + 1 >= MOST_COLUMNS) return [];
	const cuts: number[][] = [];
	for (let at = from; at < count; at += 1) {
		const next = [...chosen, at];
		cuts.push(next, ...cutsOf(count, at + 1, next));
	}
	return cuts;
}

/**
 * The width of a run of bands: from its leftmost item to its rightmost.
 * @param laid The block unfolded.
 * @param run The run.
 * @returns Its width.
 */
function widthOf(laid: Laid, run: readonly Band[]): number {
	const boxes = run.flatMap(({ items }) => items.map((item) => laid.boxes.get(item)!));
	const right = Math.max(...boxes.map((one) => one.x + one.width));
	return right - Math.min(...boxes.map((one) => one.x));
}

/**
 * The size a block would have folded at some cuts, estimated from its unfolded layout.
 * @param laid The block unfolded.
 * @param runs Its item bands, run by run.
 * @param insets Its insets.
 * @returns The estimated size.
 */
function foldedSize(
	laid: Laid,
	runs: readonly (readonly Band[])[],
	insets: Insets,
): { width: number; height: number } {
	const all = runs.flat();
	const span = all.at(-1)!.bottom - all[0]!.top;
	const widths = runs.map((run) => widthOf(laid, run));
	const tallest = Math.max(...runs.map((run) => run.at(-1)!.bottom - run[0]!.top));
	const gutters = (runs.length - 1) * MIN_GUTTER;
	return {
		width: widths.reduce((sum, width) => sum + width, 0) + gutters + 2 * insets.side,
		height: laid.height - span + tallest + 2 * channelHeight(runs.length - 1),
	};
}

/**
 * The columns a block of cards would better fold into, if any: the cut of
 * its ranks into runs that scores best, when that beats the block unfolded
 * by a clear margin. Only the board and containers fold.
 * @param block The block.
 * @param laid The block laid out unfolded.
 * @param insets Its insets.
 * @param unfolded What the block is weighed on unfolded.
 * @returns Its items, column by column, and what the fold is estimated to
 * be weighed on; nothing when it stays whole.
 */
function foldPlan(
	block: Block,
	laid: Laid,
	insets: Insets,
	unfolded: Weighed,
): { items: string[][]; weighed: Weighed } | undefined {
	const bands = laid.bands.filter(({ items }) => items.length > 0);
	const folds = (block.kind === "root" || block.kind === "frame") && bands.length >= 3;
	const best = folds ? bestRuns(block, laid, bands, { insets, weighed: unfolded }) : undefined;
	return best === undefined
		? undefined
		: { items: best.runs.map((run) => run.flatMap(({ items }) => items)), weighed: best.weighed };
}

/**
 * How many of a block's lines run from one run of bands to another: each is
 * drawn from the bottom of one column round to the top of a later one.
 * @param block The block.
 * @param runs Its bands, run by run.
 * @returns The lines between runs.
 */
function busLines(block: Block, runs: readonly (readonly Band[])[]): number {
	const runOf = new Map(
		runs.flatMap((run, index) =>
			run.flatMap(({ items }) => items.map((item) => [item, index] as const)),
		),
	);
	// A container drawn inline stands in the run that holds its cards.
	const clusters = new Map<string, number>();
	for (const [item, index] of runOf)
		for (let at = block.clusterOf.get(item); at !== undefined; at = block.clusters.get(at)?.parent)
			clusters.set(at, index);
	for (const [cluster, index] of clusters) runOf.set(cluster, index);
	return [...block.lines.values()].filter((line) => {
		const [tail, head] = [runOf.get(line.tail), runOf.get(line.head)];
		return tail !== undefined && head !== undefined && tail !== head;
	}).length;
}

/**
 * The bands each cluster a block draws inline spans, as the first and last
 * band holding one of its cards.
 * @param block The block.
 * @param bands Its bands that hold items.
 * @returns Each cluster's first and last band.
 */
function clusterSpans(block: Block, bands: readonly Band[]): [number, number][] {
	const bandOf = new Map(
		bands.flatMap(({ items }, index) => items.map((item) => [item, index] as const)),
	);
	const spans = new Map<string, [number, number]>();
	for (const [item, band] of bandOf)
		for (
			let at = block.clusterOf.get(item);
			at !== undefined;
			at = block.clusters.get(at)?.parent
		) {
			const [low, high] = spans.get(at) ?? [band, band];
			spans.set(at, [Math.min(low, band), Math.max(high, band)]);
		}
	return [...spans.values()];
}

/**
 * Whether cuts split a cluster: a column holds a container or region whole,
 * never a part of one.
 * @param cuts Where each later run starts.
 * @param spans Each cluster's first and last band.
 * @returns True when a cut falls inside a cluster.
 */
function splits(cuts: readonly number[], spans: readonly [number, number][]): boolean {
	return cuts.some((cut) => spans.some(([low, high]) => low < cut && cut <= high));
}

/**
 * The runs of bands that score best folded ({@link scoreOf}), when they beat
 * the bands unfolded by a clear margin. Each run is estimated at its size
 * with the block's own crossings, so a fold never trades a crossing for fit;
 * what it trades is its lines between columns, the price of any fold, each
 * weighed against the fit the fold gains.
 * @param block The block.
 * @param laid The block unfolded.
 * @param bands Its bands that hold items.
 * @param unfolded Its insets, and what it is weighed on unfolded.
 * @param unfolded.insets Its insets.
 * @param unfolded.weighed What it is weighed on unfolded.
 * @returns The runs and what they are estimated to be weighed on, or nothing.
 */
function bestRuns(
	block: Block,
	laid: Laid,
	bands: readonly Band[],
	unfolded: { insets: Insets; weighed: Weighed },
): { runs: Band[][]; weighed: Weighed } | undefined {
	const crossings = crossingsOf(laid.lines.values());
	const spans = clusterSpans(block, bands);
	const folds = cutsOf(bands.length)
		.filter((cuts) => !splits(cuts, spans))
		.map((cuts) => {
			const starts = [0, ...cuts];
			const runs = starts.map((start, index) => bands.slice(start, starts[index + 1]));
			const size = foldedSize(laid, runs, unfolded.insets);
			return { weighed: { ...size, crossings, bus: busLines(block, runs) }, runs };
		});
	const best = folds.reduce<{ weighed: Weighed; runs: Band[][] } | undefined>(
		(one, other) => (one === undefined || scoresBetter(other.weighed, one.weighed) ? other : one),
		undefined,
	);
	return best !== undefined && scoreOf(best.weighed) > scoreOf(unfolded.weighed) * WORTH_FOLDING
		? best
		: undefined;
}

/** One fold of a block: its columns, and the tree whose lines it cuts. */
class Fold {
	readonly columns: Block[];

	/**
	 * Fold a block into columns: its items move into one column block each,
	 * in order.
	 * @param tree The blocks.
	 * @param block The block.
	 * @param groups Its items, column by column.
	 */
	constructor(
		readonly tree: BlockTree,
		readonly block: Block,
		groups: readonly (readonly string[])[],
	) {
		block.items.length = 0;
		this.columns = groups.map((items, index) => {
			const column = tree.block(`${block.id}#${index}`, "column", block, {});
			column.items.push(...items);
			for (const item of items) {
				const inner = tree.blocks.get(item);
				if (inner === undefined) tree.holder.set(item, column);
				else inner.parent = column;
			}
			return column;
		});
		this.moveClusters();
	}

	/**
	 * Move each cluster the block draws inline into the column that holds its
	 * cards, whole, with every card's and cluster's place in it.
	 */
	moveClusters(): void {
		for (const column of this.columns) this.holdClusters(column);
		this.block.clusters.clear();
		this.block.clusterOf.clear();
	}

	/**
	 * Give one column the clusters around its cards, in the block's order so a
	 * parent comes before the clusters inside it.
	 * @param column The column.
	 */
	holdClusters(column: Block): void {
		const held = new Set(column.items.flatMap((item) => this.clustersAround(item)));
		const clusters = [...this.block.clusters].filter(([id]) => held.has(id));
		for (const [id, cluster] of clusters) column.clusters.set(id, cluster);
		for (const [member, around] of this.block.clusterOf)
			if (held.has(around)) column.clusterOf.set(member, around);
		for (const [id] of clusters.filter(([, cluster]) => cluster.kind === "frame"))
			this.tree.holder.set(id, column);
	}

	/**
	 * The clusters around an item of the block, innermost first.
	 * @param item The item.
	 * @returns Their ids.
	 */
	clustersAround(item: string): string[] {
		const chain: string[] = [];
		const { clusterOf, clusters } = this.block;
		for (let at = clusterOf.get(item); at !== undefined; at = clusters.get(at)?.parent)
			chain.push(at);
		return chain;
	}

	/**
	 * The column holding a line end, if a column holds it.
	 * @param end The line end.
	 * @returns The column.
	 */
	columnOf(end: string): Block | undefined {
		const item = this.tree.pins.get(end)?.block.id ?? end;
		return this.columns.find((column) => column.items.includes(item) || column.clusters.has(item));
	}

	/**
	 * Cut every line of the block where it leaves and enters a column, and
	 * put each relationship's pieces and label where the cut left them.
	 */
	cutAll(): void {
		const lines = [...this.block.lines.values()];
		this.block.lines.clear();
		const replaced = new Map(lines.map((line) => [line.key, this.cut(line)]));
		for (const [edge, route] of this.tree.routes) {
			const pieces = route.pieces.flatMap(([at, key]): Piece[] =>
				at === this.block ? (replaced.get(key) ?? []) : [[at, key]],
			);
			const labelled = pieces.find(([at, key]) => at.lines.get(key)?.labelled === true);
			const labelAt = route.labelAt === this.block ? (labelled?.[0] ?? this.block) : route.labelAt;
			this.tree.routes.set(edge, { pieces, labelAt });
		}
	}

	/**
	 * Cut one line of the block at the columns it leaves and enters. What
	 * leaves a column leaves its bottom and what enters one enters its top,
	 * since a column only ever holds later ranks than the one before it.
	 * @param line The line.
	 * @returns Its pieces, from its source-side end to its target-side end.
	 */
	cut(line: Line): Piece[] {
		const upper = this.columnOf(line.tail);
		const lower = this.columnOf(line.head);
		if (upper !== undefined && upper === lower) {
			upper.lines.set(line.key, line);
			return [[upper, line.key]];
		}
		const forward = line.from === line.tail;
		const labelIn = forward ? [lower, upper] : [upper, lower];
		const leaving = this.leaving(line, upper, labelIn.find(Boolean));
		const entering = this.entering(line, lower, labelIn.find(Boolean));
		const pieces: Piece[] = [
			...leaving.pieces,
			[this.block, this.part(this.block, line, leaving.end, entering.end, false)],
			...entering.pieces,
		];
		return forward ? pieces : pieces.toReversed();
	}

	/**
	 * The piece of a cut line inside the column it leaves.
	 * @param line The line.
	 * @param column The column, if a column holds its upper end.
	 * @param labelIn The column that carries its label.
	 * @returns The piece, and the end it leaves the column at.
	 */
	leaving(
		line: Line,
		column: Block | undefined,
		labelIn: Block | undefined,
	): { pieces: Piece[]; end: string } {
		if (column === undefined) return { pieces: [], end: line.tail };
		const port = this.tree.port(column, `fold|${line.key}`, "bottom");
		const key = this.part(column, line, line.tail, port, labelIn === column);
		return { pieces: [[column, key]], end: this.tree.pin(column, port) };
	}

	/**
	 * The piece of a cut line inside the column it enters.
	 * @param line The line.
	 * @param column The column, if a column holds its lower end.
	 * @param labelIn The column that carries its label.
	 * @returns The piece, and the end it enters the column from.
	 */
	entering(
		line: Line,
		column: Block | undefined,
		labelIn: Block | undefined,
	): { pieces: Piece[]; end: string } {
		if (column === undefined) return { pieces: [], end: line.head };
		const port = this.tree.port(column, `fold|${line.key}`, "top");
		const key = this.part(column, line, port, line.head, labelIn === column);
		return { pieces: [[column, key]], end: this.tree.pin(column, port) };
	}

	/**
	 * One piece of a cut line, in a block, between two ends as Graphviz ranks them.
	 * @param block The block it is drawn in.
	 * @param line The line it is cut from.
	 * @param tail Its upper end.
	 * @param head Its lower end.
	 * @param labelled Whether it carries the line's label.
	 * @returns Its key in the block.
	 */
	part(block: Block, line: Line, tail: string, head: string, labelled: boolean): string {
		const forward = line.from === line.tail;
		const carries = labelled && line.labelled;
		const key = carries ? line.edge.id : `${line.key}@${block.id}`;
		block.lines.set(key, {
			key,
			edge: line.edge,
			from: forward ? tail : head,
			to: forward ? head : tail,
			tail,
			head,
			labelled: carries,
		});
		return key;
	}
}

/**
 * Fold a block into columns and cut its lines.
 * @param tree The blocks.
 * @param block The block.
 * @param groups Its items, column by column.
 * @returns The columns.
 */
function foldBlock(tree: BlockTree, block: Block, groups: readonly (readonly string[])[]): Block[] {
	const fold = new Fold(tree, block, groups);
	fold.cutAll();
	return fold.columns;
}

export { MIN_GUTTER, foldBlock, foldPlan };
