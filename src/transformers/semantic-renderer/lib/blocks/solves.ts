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
import { holdsLoneRegions } from "@/transformers/semantic-renderer/lib/blocks/lone";
import {
	BLOCKS_APART,
	BLOCKS_DECIDED,
	BLOCKS_NESTING,
	BLOCKS_PLACED,
	BLOCKS_WITHOUT,
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
	readonly decided?: string;
}

/** How one solve lays a board out beyond its nesting and joins (`place.ts`). */
interface Asked {
	/** Whether without its regions round one node. */
	readonly without?: boolean;
	/** What another layout decided, which this one keeps. */
	readonly decided?: string;
}

/**
 * A board laid out one way, in one solve.
 * @param graph The measured hierarchy.
 * @param nesting How its containers and group regions are drawn.
 * @param apart The blocks whose joins keep ports of their own, by id.
 * @param asked How else it is laid out.
 * @returns The drawing's geometry, the blocks it keeps apart, and what its layout decided.
 */
async function solved(
	graph: ElkNode,
	nesting: Nesting,
	apart: ReadonlySet<string>,
	asked: Asked = {},
): Promise<Solved> {
	const question = {
		...graph,
		layoutOptions: {
			...graph.layoutOptions,
			[BLOCKS_NESTING]: nesting,
			[BLOCKS_APART]: JSON.stringify([...apart]),
			...askedOptions(asked),
		},
	};
	const answer = await rendererHost().solve(question, {
		...COMPOUND_OPTIONS,
		[SOLVE_STAGE]: nesting === "blocks" ? "blocks" : "track",
	});
	const { [BLOCKS_PLACED]: placed, [BLOCKS_DECIDED]: decided } = answer.layoutOptions ?? {};
	return {
		...PlacedSchema.parse(JSON.parse(placed ?? "{}")),
		apart,
		...(decided === undefined ? {} : { decided }),
	};
}

/**
 * The root options that ask a solve how else to lay a board out.
 * @param asked How else it is laid out.
 * @returns The options.
 */
function askedOptions(asked: Asked): Record<string, string> {
	const { without, decided } = asked;
	return {
		...(without === true ? { [BLOCKS_WITHOUT]: "lone" } : {}),
		...(decided === undefined ? {} : { [BLOCKS_DECIDED]: decided }),
	};
}

/**
 * A board laid out with every join of lines to one card kept whole the way
 * that reads better.
 *
 * Drawn as blocks, a board with regions round one node (`lone.ts`) is laid
 * out as its layout without them decides: which joins part, which ports
 * move to side walls, how blocks pack and which port orders hold. Such a
 * region gathers nothing and joins no line, but the room it takes moves the
 * routes round it and the blocks packed beside it, and each of those choices
 * weighed with it could turn: What the CLI can be asked parted four lines
 * into Board client for a hop more and 21% more line, and Working with an
 * agent moved four more ports to side walls and stood Pane session off to
 * the middle. Beside those layouts the board is laid out with its regions
 * and every join whole, the way nearly every such board keeps, deciding for
 * itself; where that is the way kept and it decides alike, it is the
 * drawing, and else the board is laid out once more as decided. Laid out
 * only after the choice, Command interface took 895 ms where it took 724
 * without its regions round one node.
 *
 * Drawn inline, a board is ranked in one layout and decides with its
 * regions: every drawing of both vaults decided alike either way, and laid
 * out twice, Browser application (Track) took 639 ms where it took 340.
 * @param graph The measured hierarchy.
 * @param nesting How its containers and group regions are drawn.
 * @returns The blocks, and the drawing's geometry.
 */
async function joinedOut(graph: ElkNode, nesting: Nesting): Promise<Drawn<Placed>> {
	const tree = new BlockTree(graph, new Map(), nesting, new Set());
	if (nesting === "blocks" && holdsLoneRegions(graph))
		return { tree, placed: await decidedWithout(graph, tree) };
	return layJoined(tree, (apart) => solved(graph, nesting, apart));
}

/**
 * A board drawn as blocks with its regions round one node, laid out as its
 * layout without them decides ({@link joinedOut}).
 * @param graph The measured hierarchy.
 * @param tree Its blocks.
 * @returns The drawing's geometry.
 */
async function decidedWithout(graph: ElkNode, tree: BlockTree): Promise<Placed> {
	const joined = layJoined(tree, (apart) => solved(graph, "blocks", apart, { without: true }));
	// Asked once every way the choice weighs is asked for, so no worker holds one behind it.
	await Promise.resolve();
	const whole = solved(graph, "blocks", new Set());
	whole.catch(() => undefined);
	const { apart, decided } = (await joined).placed;
	const itself = apart.size === 0 ? await whole : undefined;
	if (itself !== undefined && itself.decided === decided) return itself;
	return solved(graph, "blocks", apart, decided === undefined ? {} : { decided });
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
