// A board laid out as blocks, chosen where the renderer runs. Each way to lay
// it out is one solve where the layout engines run (`place.ts`): with the
// joins of some blocks kept apart (`joins.ts`), and, drawn inline, with its
// groups inline or each packed as a block of its own, and its first block
// that could stack laid each way (`stacking.ts`). The solves a choice
// weighs are asked for side by side and weighed in the order the choice
// weighs them, so the drawing is the one laying them out one by one gives.
import type { ElkNode } from "@archboard/elk-rs";
import { z } from "zod";
import { fitIn } from "#shared/constants/shell-geometry.ts";
import { SOLVE_STAGE, rendererHost } from "#shared/rules/render/host.ts";
import type { Nesting } from "#shared/rules/blocks/tree/inline.ts";
import type { Drawn } from "#shared/rules/blocks/tree/joins.ts";
import { layJoined } from "#shared/rules/blocks/tree/joins-laid.ts";
import { lineLength } from "#shared/rules/blocks/cards/laying.ts";
import {
	BLOCKS_APART,
	BLOCKS_FACING,
	BLOCKS_NESTING,
	BLOCKS_PLACED,
} from "#shared/rules/blocks/tree/place.ts";
import {
	BLOCKS_STACKING,
	BLOCKS_STOOD,
	StoodSchema,
	stacks,
	type Stood,
} from "#shared/rules/blocks/tree/stacking.ts";
import { BlockTree } from "#shared/rules/blocks/tree/tree.ts";
import { weighedPlaced } from "#shared/rules/blocks/tree/weighing.ts";
import { crossingsOf, scoreOf, takes } from "#shared/rules/track/scene/score.ts";

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
 * How one solve lays a board out: which joins stay apart, whether it faces
 * its blocks' walls, and how its first block that could stack is laid
 * (`stacking.ts`).
 */
interface Way {
	readonly apart: ReadonlySet<string>;
	readonly facing?: boolean;
	readonly stacking?: boolean;
}

/** What one solve answers: the drawing, and what its first block that could stack stood at where it was laid one way. */
interface Answer {
	readonly placed: Placed | undefined;
	readonly stood: Stood | undefined;
}

/**
 * What a solve that lays a board out one way answers.
 * @param graph The measured hierarchy.
 * @param nesting How its containers and group regions are drawn.
 * @param way Which joins stay apart, whether every block faces its walls
 * (`BlockTree`), and how its first block that could stack is laid, if named.
 * @param signal Calls the solve off while it waits for the engine, and, when
 * somebody hears it, while the engine holds it too.
 * @param hear Hears what its first block that could stack stood at, as soon as it is laid.
 * @returns The answer.
 */
async function answered(
	graph: ElkNode,
	nesting: Nesting,
	way: Way,
	signal: AbortSignal,
	hear?: (stood: Stood) => void,
): Promise<Answer> {
	const asked = { ...graph, layoutOptions: { ...graph.layoutOptions, ...optionsOf(nesting, way) } };
	const stage = { [SOLVE_STAGE]: nesting === "blocks" ? "blocks" : "track" };
	const heard =
		hear === undefined
			? undefined
			: (told: Readonly<Record<string, string>>): void => {
					const stood = parsedOf(StoodSchema, told[BLOCKS_STOOD]);
					if (stood !== undefined) hear(stood);
				};
	const told = (await rendererHost().solve(asked, stage, signal, heard)).layoutOptions ?? {};
	return {
		placed: parsedOf(PlacedSchema, told[BLOCKS_PLACED]),
		stood: parsedOf(StoodSchema, told[BLOCKS_STOOD]),
	};
}

/**
 * The root options that ask a solve to lay a board out one way.
 * @param nesting How its containers and group regions are drawn.
 * @param way Which joins stay apart, whether every block faces its walls,
 * and how its first block that could stack is laid.
 * @returns The options.
 */
function optionsOf(nesting: Nesting, way: Way): Record<string, string> {
	const { apart, facing = false, stacking } = way;
	return {
		[BLOCKS_NESTING]: nesting,
		[BLOCKS_APART]: JSON.stringify([...apart]),
		[BLOCKS_FACING]: String(facing),
		...(stacking === undefined ? {} : { [BLOCKS_STACKING]: String(stacking) }),
	};
}

/**
 * What a solve told in one root option, read.
 * @param schema What it tells.
 * @param told The option's JSON, if the solve told it.
 * @returns What it told, or nothing.
 */
function parsedOf<T>(schema: z.ZodType<T>, told: string | undefined): T | undefined {
	return told === undefined ? undefined : schema.parse(JSON.parse(told));
}

/**
 * The drawing a solve answered.
 * @param answer What it answered.
 * @returns The drawing.
 * @throws {Error} When it answered none.
 */
function drawingOf(answer: Answer): Placed {
	if (answer.placed === undefined) throw new Error("A solve asked for a drawing answered none.");
	return answer.placed;
}

/**
 * A board laid out one way, in one solve.
 * @param graph The measured hierarchy.
 * @param nesting How its containers and group regions are drawn.
 * @param way Which joins stay apart, whether every block faces its walls, and how its first block that could stack is laid.
 * @param signal Calls the solve off while it waits for the engine.
 * @returns The drawing's geometry.
 */
async function solved(
	graph: ElkNode,
	nesting: Nesting,
	way: Way,
	signal: AbortSignal,
): Promise<Placed> {
	return drawingOf(await answered(graph, nesting, way, signal));
}

/** A board laid out with its first block that could stack laid one way: what that block stood at, its answer, and the way to call it off. */
interface StackedWay {
	/** What the block stood at, once told; nothing once the solve answered without a block that could stack; refused once it failed before telling. */
	readonly stood: Promise<Stood | undefined>;
	readonly answer: Promise<Answer>;
	readonly calling: AbortController;
}

/**
 * Lay a board out with its first block that could stack laid one way,
 * hearing what that block stood at as soon as it is laid.
 * @param graph The measured hierarchy.
 * @param nesting How its containers and group regions are drawn.
 * @param way Which joins stay apart, and how the first block that could stack is laid.
 * @returns The solve.
 */
function stackedWay(graph: ElkNode, nesting: Nesting, way: Way): StackedWay {
	const calling = new AbortController();
	let told: ((stood: Stood) => void) | undefined;
	const heard = new Promise<Stood>((resolve) => {
		told = resolve;
	});
	const answer = answered(graph, nesting, way, calling.signal, (stood) => told?.(stood));
	const stood = Promise.race([heard, answer.then((laid) => laid.stood)]);
	return { stood, answer, calling };
}

/**
 * Lay the whole board both ways its first block that can stack may be laid,
 * side by side, choose as soon as both ways have told what that block stood
 * at, and call the other way off. The way kept goes on from the block it has
 * laid: laying the board again once the choice was made laid that block a
 * second time on the way to the drawing (Archboard server routes, Track,
 * 3.5 s against 2.6 s, TASK-527), and waiting for both whole layouts waited
 * for a drawing that nobody will read (TASK-512). The way called off stops
 * where it stands. A board with no block that can stack is drawn by the
 * solves as they answer.
 * @param graph The measured hierarchy.
 * @param nesting How its containers and group regions are drawn.
 * @param apart The blocks whose joins keep ports of their own.
 * @param signal Calls every solve off.
 * @returns The drawing's geometry.
 */
async function stackedSolved(
	graph: ElkNode,
	nesting: Nesting,
	apart: ReadonlySet<string>,
	signal: AbortSignal,
): Promise<Placed> {
	const stacked = stackedWay(graph, nesting, { apart, stacking: true });
	const plain = stackedWay(graph, nesting, { apart, stacking: false });
	/** Call both ways off. */
	const off = (): void => {
		for (const way of [stacked, plain]) way.calling.abort(signal.reason);
	};
	if (signal.aborted) off();
	signal.addEventListener("abort", off, { once: true });
	try {
		const [one, other] = await Promise.all([stacked.stood, plain.stood]);
		const [kept, dropped] =
			one !== undefined && other !== undefined && stacks(one, other)
				? [stacked, plain]
				: [plain, stacked];
		dropped.calling.abort();
		return drawingOf(await kept.answer);
	} finally {
		signal.removeEventListener("abort", off);
	}
}

/**
 * A board laid out with every join of lines to one card kept whole the way
 * that reads better. Only Blocks faces its blocks' walls: drawn inline, no
 * drawing of either vault changed by facing them. Drawn inline, the layout
 * with every join before its labels lays its stacking choice out side by
 * side ({@link stackedSolved}); the turns of the joins choice are already
 * laid out side by side with it, and splitting them as well only had them
 * wait for the cores (Agent workbench, Track, 1.5 s against 1.7 s).
 * @param graph The measured hierarchy.
 * @param nesting How its containers and group regions are drawn.
 * @returns The blocks, and the drawing's geometry.
 */
function joinedOut(graph: ElkNode, nesting: Nesting): Promise<Drawn<Placed>> {
	const tree = new BlockTree(graph, new Map(), nesting, new Set());
	if (nesting !== "blocks")
		return layJoined(tree, (apart, signal) =>
			apart.size === 0
				? stackedSolved(graph, nesting, apart, signal)
				: solved(graph, nesting, { apart }, signal),
		);
	return layJoined(
		tree,
		(apart, signal) => solved(graph, nesting, { apart }, signal),
		(apart, signal) => solved(graph, nesting, { apart, facing: true }, signal),
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
