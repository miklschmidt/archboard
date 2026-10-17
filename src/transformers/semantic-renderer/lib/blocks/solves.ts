// A board laid out as blocks, chosen where the renderer runs. Each way to lay
// it out is one solve where the layout engines run (`place.ts`): with the
// joins of some blocks kept apart (`joins.ts`), and, drawn inline, with its
// groups inline or each packed as a block of its own. The solves a choice
// weighs are asked for side by side and weighed in the order the choice
// weighs them, so the drawing is the one laying them out one by one gives.
import type { ElkNode } from "@archboard/elk-rs";
import { z } from "zod";
import { fitIn } from "@/shared/shell-geometry/index";
import { SOLVE_STAGE, rendererHost } from "@/transformers/semantic-renderer/lib/host";
import type { Nesting } from "@/transformers/semantic-renderer/lib/blocks/inline";
import { layJoined, type Drawn } from "@/transformers/semantic-renderer/lib/blocks/joins";
import { lineLength } from "@/transformers/semantic-renderer/lib/blocks/laying";
import {
	BLOCKS_APART,
	BLOCKS_FACING,
	BLOCKS_NESTING,
	BLOCKS_PLACED,
} from "@/transformers/semantic-renderer/lib/blocks/place";
import { BlockTree } from "@/transformers/semantic-renderer/lib/blocks/tree";
import { weighedPlaced } from "@/transformers/semantic-renderer/lib/blocks/weighing";
import { crossingsOf, scoreOf, takes } from "@/transformers/semantic-renderer/lib/track/score";

const BoxSchema = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });
const PointSchema = z.object({ x: z.number(), y: z.number() });
const PlacedSchema = z.object({
	width: z.number(),
	height: z.number(),
	cards: z.array(z.object({ id: z.string(), box: BoxSchema, depth: z.number() })),
	frames: z.array(
		z.object({ id: z.string(), box: BoxSchema, depth: z.number(), header: z.number().optional() }),
	),
	regions: z.array(
		z.object({
			group: z.string(),
			parent: z.string().optional(),
			box: BoxSchema,
			caption: BoxSchema,
			depth: z.number(),
		}),
	),
	edges: z.array(
		z.object({ id: z.string(), points: z.array(PointSchema), label: BoxSchema.optional() }),
	),
	/** Whether facing every block's walls would change the blocks (`place.ts`); absent, it would not. */
	faces: z.boolean().optional(),
});
/** A whole drawing's geometry, as a solve answers it. */
type Placed = z.infer<typeof PlacedSchema>;

/**
 * A board laid out one way, in one solve.
 * @param graph The measured hierarchy.
 * @param nesting How its containers and group regions are drawn.
 * @param apart The blocks whose joins keep ports of their own, by id.
 * @param signal Calls the solve off while it waits for the engine.
 * @param facing Whether every block faces its walls (`BlockTree`).
 * @returns The drawing's geometry.
 */
async function solved(
	graph: ElkNode,
	nesting: Nesting,
	apart: ReadonlySet<string>,
	signal: AbortSignal,
	facing = false,
): Promise<Placed> {
	const asked = {
		...graph,
		layoutOptions: {
			...graph.layoutOptions,
			[BLOCKS_NESTING]: nesting,
			[BLOCKS_APART]: JSON.stringify([...apart]),
			[BLOCKS_FACING]: String(facing),
		},
	};
	const answer = await rendererHost().solve(
		asked,
		{ [SOLVE_STAGE]: nesting === "blocks" ? "blocks" : "track" },
		signal,
	);
	return PlacedSchema.parse(JSON.parse(answer.layoutOptions?.[BLOCKS_PLACED] ?? "{}"));
}

/**
 * A board laid out with every join of lines to one card kept whole the way
 * that reads better. Only Blocks faces its blocks' walls: drawn inline, no
 * drawing of either vault changed by facing them.
 * @param graph The measured hierarchy.
 * @param nesting How its containers and group regions are drawn.
 * @returns The blocks, and the drawing's geometry.
 */
function joinedOut(graph: ElkNode, nesting: Nesting): Promise<Drawn<Placed>> {
	const tree = new BlockTree(graph, new Map(), nesting, new Set());
	return layJoined(
		tree,
		(apart, signal) => solved(graph, nesting, apart, signal),
		nesting === "blocks"
			? (apart, signal) => solved(graph, nesting, apart, signal, true)
			: undefined,
	);
}

/**
 * Whether a board laid with its groups packed reads better than laid inline
 * in the order of ADR 0039, and no worse anywhere than the drawing taken
 * before it ({@link takes}): packed, where it scores higher, draws no more
 * line, and fits the pane no worse. Blocks standing side by side can trade
 * a line's straight run for one round both blocks, which the score alone
 * does not see; and packing is for a page the board's own ranks spread out,
 * so a packing that fits worse only buys its crossings with lines run round
 * the blocks. Both weighings count the lines' runs away from their ends as
 * crossings (`away.ts`): packed, Device Trust Control Plane (Track) crossed
 * five lines more and ran its lines some 3900 px round its blocks, for 5%
 * less line.
 * @param packed The drawing with groups packed.
 * @param inline The drawing with groups inline.
 * @returns True when the packed one reads better.
 */
function readsBetterPacked(packed: Drawn<Placed>, inline: Drawn<Placed>): boolean {
	const [one, other] = [packed.placed, inline.placed];
	const [packs, inlines] = [one, other].map(({ edges }) => edges.map(({ points }) => points));
	const [mine, theirs] = [
		weighedPlaced(one, packed.tree.projections),
		weighedPlaced(other, inline.tree.projections),
	];
	const earlier =
		scoreOf({ ...one, crossings: crossingsOf(packs!), away: mine.away }) >
			scoreOf({ ...other, crossings: crossingsOf(inlines!), away: theirs.away }) &&
		lineLength(packs!) <= lineLength(inlines!) &&
		fitIn(one) >= fitIn(other);
	return takes(mine, theirs, earlier);
}

/**
 * Whether a board drawn inline gathers any group into a region.
 * @param graph The measured hierarchy.
 * @returns True when some cluster is a group's region.
 */
function hasRegions(graph: ElkNode): boolean {
	const tree = new BlockTree(graph, new Map(), "inline", new Set());
	return [...tree.root.clusters.values()].some(({ kind }) => kind === "region");
}

/**
 * Lay a measured hierarchy out as blocks and route every relationship. Drawn
 * inline, a board with groups is also laid with each group's region packed as
 * a block of its own, and the layout that reads better is kept: a group whose
 * members stand far apart in the board's ranks spans them all as a cluster,
 * a tall sparse band, but packed stands whole.
 * @param graph The measured hierarchy.
 * @param inline Whether containers and group regions are drawn inline, as
 * clusters of the board's own layout, rather than packed as blocks.
 * @returns The drawing's geometry.
 */
async function placedBlocks(graph: ElkNode, inline: boolean): Promise<Placed> {
	const first = joinedOut(graph, inline ? "inline" : "blocks");
	if (!inline || !hasRegions(graph)) return (await first).placed;
	const [packed, laid] = await Promise.all([joinedOut(graph, "groups"), first]);
	return readsBetterPacked(packed, laid) ? packed.placed : laid.placed;
}

export { placedBlocks, type Placed };
