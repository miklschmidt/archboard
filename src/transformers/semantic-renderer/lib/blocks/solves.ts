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
import { COMPOUND_OPTIONS } from "@/transformers/semantic-renderer/lib/layout/compound-graph";
import type { Nesting } from "@/transformers/semantic-renderer/lib/blocks/inline";
import { layJoined, type Drawn } from "@/transformers/semantic-renderer/lib/blocks/joins";
import { lineLength } from "@/transformers/semantic-renderer/lib/blocks/laying";
import { withoutLoneRegions } from "@/transformers/semantic-renderer/lib/blocks/lone";
import {
	BLOCKS_APART,
	BLOCKS_DECIDED,
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
	frames: z.array(z.object({ id: z.string(), box: BoxSchema, depth: z.number() })),
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
});
/** A whole drawing's geometry, as a solve answers it. */
type Placed = z.infer<typeof PlacedSchema>;

/** A drawing's geometry as one solve answers it, the blocks it keeps apart, and what its layout decided, as JSON. */
interface Solved extends Placed {
	readonly apart: ReadonlySet<string>;
	readonly decided: string;
}

/**
 * A board laid out one way, in one solve.
 * @param graph The measured hierarchy.
 * @param nesting How its containers and group regions are drawn.
 * @param apart The blocks whose joins keep ports of their own, by id.
 * @param decided What another layout decided, which this one keeps (`place.ts`).
 * @returns The drawing's geometry, the blocks it keeps apart, and what its layout decided.
 */
async function solved(
	graph: ElkNode,
	nesting: Nesting,
	apart: ReadonlySet<string>,
	decided?: string,
): Promise<Solved> {
	const asked = {
		...graph,
		layoutOptions: {
			...graph.layoutOptions,
			[BLOCKS_NESTING]: nesting,
			[BLOCKS_APART]: JSON.stringify([...apart]),
			...(decided === undefined ? {} : { [BLOCKS_DECIDED]: decided }),
		},
	};
	const answer = await rendererHost().solve(asked, {
		...COMPOUND_OPTIONS,
		[SOLVE_STAGE]: nesting === "blocks" ? "blocks" : "track",
	});
	const options = answer.layoutOptions ?? {};
	return {
		...PlacedSchema.parse(JSON.parse(options[BLOCKS_PLACED] ?? "{}")),
		apart,
		decided: options[BLOCKS_DECIDED] ?? "",
	};
}

/**
 * A board laid out with every join of lines to one card kept whole the way
 * that reads better. A board with regions round one node (`lone.ts`) is laid
 * out as its layout without them decides: which joins part, which ports move
 * to side walls, how blocks pack and which port orders hold. Such a region
 * gathers nothing and joins no line, but the room it takes moves the routes
 * round it, and each of those choices weighed with it could turn: What the
 * CLI can be asked (Blocks) parted four lines into Board client for a hop
 * more and 21% more line, and Working with an agent (Blocks) moved four more
 * ports to side walls and stood Pane session off to the middle.
 * @param graph The measured hierarchy.
 * @param nesting How its containers and group regions are drawn.
 * @returns The blocks, and the drawing's geometry.
 */
async function joinedOut(graph: ElkNode, nesting: Nesting): Promise<Drawn<Placed>> {
	const plain = withoutLoneRegions(graph);
	const laid = plain ?? graph;
	const tree = new BlockTree(laid, new Map(), nesting, new Set());
	const best = await layJoined(tree, (apart) => solved(laid, nesting, apart));
	if (plain === undefined) return best;
	const { apart, decided } = best.placed;
	const placed = await solved(graph, nesting, apart, decided);
	return { tree: new BlockTree(graph, new Map(), nesting, new Set()), placed };
}

/**
 * Whether a board laid with its groups packed reads better than laid inline
 * in the order of ADR 0039, and no worse anywhere than the drawing taken
 * before it ({@link takes}): packed, where it scores higher, draws no more
 * line, and fits the pane no worse. Blocks standing side by side can trade
 * a line's straight run for one round both blocks, which the score alone
 * does not see; and packing is for a page the board's own ranks spread out,
 * so a packing that fits worse only buys its crossings with lines run round
 * the blocks.
 * @param packed The drawing with groups packed.
 * @param inline The drawing with groups inline.
 * @returns True when the packed one reads better.
 */
function readsBetterPacked(packed: Drawn<Placed>, inline: Drawn<Placed>): boolean {
	const [one, other] = [packed.placed, inline.placed];
	const [packs, inlines] = [one, other].map(({ edges }) => edges.map(({ points }) => points));
	const earlier =
		scoreOf({ ...one, crossings: crossingsOf(packs!) }) >
			scoreOf({ ...other, crossings: crossingsOf(inlines!) }) &&
		lineLength(packs!) <= lineLength(inlines!) &&
		fitIn(one) >= fitIn(other);
	return takes(weighedPlaced(one), weighedPlaced(other), earlier);
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
