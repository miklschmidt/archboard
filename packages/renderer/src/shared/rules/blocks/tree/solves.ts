// A board laid out as blocks, chosen where the renderer runs. Each way to lay
// it out is one solve of the renderer core where the layout engines run: with
// the joins of some blocks kept apart (`joins-laid.ts`), and, drawn inline,
// with its groups inline or each packed as a block of its own, and its first
// block that could stack laid each way. The solves a choice weighs are asked
// for side by side and weighed in the order the choice weighs them, so the
// drawing is the one laying them out one by one gives. Each solve tells,
// with its drawing, what the choices read of it; the core weighs two such
// readings where the renderer chooses between them (ADR 0039, ADR 0057).
import type { ElkNode } from "@archboard/elk-rs";
import { z } from "zod";
import { rendererHost } from "#shared/rules/render/host.ts";
import { layJoined } from "#shared/rules/blocks/tree/joins-laid.ts";

/** How a board's containers and group regions are drawn: packed as blocks, inline, or inline with each group packed. */
type Nesting = "blocks" | "inline" | "groups";

/** The root option carrying the placed drawing, as the JSON the solve answers. */
const BLOCKS_PLACED = "archboard.blocks.placed";
/** The root option carrying what the choices read of the drawing, which only the core reads. */
const BLOCKS_READING = "archboard.blocks.reading";
/** The root option asking a solve to tell that reading, `true` when a choice weighs its drawing. */
const BLOCKS_READ = "archboard.blocks.read";
/** The root option naming how a solve draws the board's containers and group regions. */
const BLOCKS_NESTING = "archboard.blocks.nesting";
/** The root option naming the blocks whose joins a solve keeps apart, as a JSON list of ids. */
const BLOCKS_APART = "archboard.blocks.apart";
/** The root option asking a solve to face every block's walls, `true` when asked. */
const BLOCKS_FACING = "archboard.blocks.facing";
/** The root option laying a solve's first block that could stack only one way, `true` stacked. */
const BLOCKS_STACKING = "archboard.blocks.stacking";
/** The root option asking a solve to answer once that block is laid, `true` when asked. */
const BLOCKS_UNTIL_STOOD = "archboard.blocks.until-stood";
/** The root option a solve answers what that block stood at in, as JSON only the core reads. */
const BLOCKS_STOOD = "archboard.blocks.stood";

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
	/** Whether facing every block's walls would change the blocks; absent, it would not. */
	faces: z.boolean().optional(),
});
/** A whole drawing's geometry, as a solve answers it. */
type Placed = z.infer<typeof PlacedSchema>;

/** A drawing a solve answered, and what the choices between solves read of it where one weighs it. */
interface Drawing {
	readonly placed: Placed;
	readonly reading: string | undefined;
	readonly faces?: boolean | undefined;
}

/**
 * How one solve lays a board out: which joins stay apart, whether it faces
 * its blocks' walls, how its first block that could stack is laid, whether
 * it answers once that block is laid, and whether a choice weighs its drawing.
 */
interface Way {
	readonly apart: ReadonlySet<string>;
	readonly read: boolean;
	readonly facing?: boolean;
	readonly stacking?: boolean;
	readonly until?: boolean;
}

/** What one solve answers: the drawing, unless it answered once its first block that could stack was laid, and what that block stood at where it was laid one way. */
interface Answer {
	readonly drawing: Drawing | undefined;
	readonly stood: string | undefined;
}

/**
 * What a solve that lays a board out one way answers.
 * @param graph The measured hierarchy.
 * @param nesting How its containers and group regions are drawn.
 * @param way Which joins stay apart, whether every block faces its walls,
 * how its first block that could stack is laid, if named, and whether the
 * solve answers once it is.
 * @param signal Calls the solve off while it waits for the engine.
 * @returns The answer.
 */
async function answered(
	graph: ElkNode,
	nesting: Nesting,
	way: Way,
	signal: AbortSignal,
): Promise<Answer> {
	const asked = { ...graph, layoutOptions: { ...graph.layoutOptions, ...optionsOf(nesting, way) } };
	const told = (await rendererHost().solve(asked, signal)).layoutOptions ?? {};
	const [placed, reading, stood] = [told[BLOCKS_PLACED], told[BLOCKS_READING], told[BLOCKS_STOOD]];
	if (placed === undefined) return { drawing: undefined, stood };
	const drawing = PlacedSchema.parse(JSON.parse(placed));
	return { drawing: { placed: drawing, reading, faces: drawing.faces }, stood };
}

/**
 * The root options that ask a solve to lay a board out one way.
 * @param nesting How its containers and group regions are drawn.
 * @param way Which joins stay apart, whether every block faces its walls,
 * how its first block that could stack is laid, whether the solve answers
 * once it is, and whether it tells its drawing's reading.
 * @returns The options.
 */
function optionsOf(nesting: Nesting, way: Way): Record<string, string> {
	const { apart, read, facing = false, stacking, until = false } = way;
	return {
		[BLOCKS_NESTING]: nesting,
		[BLOCKS_APART]: JSON.stringify([...apart]),
		[BLOCKS_FACING]: String(facing),
		...(stacking === undefined ? {} : { [BLOCKS_STACKING]: String(stacking) }),
		...(until ? { [BLOCKS_UNTIL_STOOD]: "true" } : {}),
		...(read ? { [BLOCKS_READ]: "true" } : {}),
	};
}

/**
 * The drawing a solve answered.
 * @param answer What it answered.
 * @returns The drawing.
 * @throws {Error} When it answered none.
 */
function drawingOf(answer: Answer): Drawing {
	if (answer.drawing === undefined) throw new Error("A solve asked for a drawing answered none.");
	return answer.drawing;
}

/**
 * A board laid out one way, in one solve.
 * @param graph The measured hierarchy.
 * @param nesting How its containers and group regions are drawn.
 * @param way Which joins stay apart, whether every block faces its walls, and how its first block that could stack is laid.
 * @param signal Calls the solve off while it waits for the engine.
 * @returns The drawing.
 */
async function solved(
	graph: ElkNode,
	nesting: Nesting,
	way: Way,
	signal: AbortSignal,
): Promise<Drawing> {
	return drawingOf(await answered(graph, nesting, way, signal));
}

/**
 * Choose whether the first block that can stack is stacked, then lay the
 * whole board only that way. The two partial solves stop once they can
 * answer the choice. Starting both whole layouts before that choice also
 * starts expensive work for a drawing that nobody will read (TASK-512).
 * A board with no block that can stack is drawn by the partial solves.
 * @param graph The measured hierarchy.
 * @param nesting How its containers and group regions are drawn.
 * @param way The blocks whose joins keep ports of their own, and whether a choice weighs the drawing.
 * @param signal Calls every solve off while it waits for the engine.
 * @returns The drawing.
 */
async function stackedSolved(
	graph: ElkNode,
	nesting: Nesting,
	way: Way,
	signal: AbortSignal,
): Promise<Drawing> {
	const [stacked, plain] = await Promise.all(
		[true, false].map((stacking) =>
			answered(graph, nesting, { ...way, stacking, until: true }, signal),
		),
	);
	if (stacked!.stood === undefined || plain!.stood === undefined) return drawingOf(plain!);
	const stacking = rendererHost().core().stacksOf(stacked!.stood, plain!.stood);
	return solved(graph, nesting, { ...way, stacking }, signal);
}

/**
 * What the choices read of a drawing a choice weighs.
 * @param drawing The drawing.
 * @returns Its reading.
 * @throws {Error} When its solve was not asked to tell it.
 */
function readingOf(drawing: Drawing): string {
	if (drawing.reading === undefined)
		throw new Error("A drawing a choice weighs was solved without its reading.");
	return drawing.reading;
}

/**
 * Whether one drawing reads better than another, as the core weighs their readings.
 * @param one A drawing.
 * @param other Another.
 * @returns True when the first reads better.
 */
function drawsBetter(one: Drawing, other: Drawing): boolean {
	return rendererHost().core().drawsBetter(readingOf(one), readingOf(other));
}

/**
 * A board laid out with every join of lines to one card kept whole the way
 * that reads better. Only Blocks faces its blocks' walls: drawn inline, no
 * drawing of either vault changed by facing them. Drawn inline, the layout
 * with every join before its labels lays its stacking choice out side by
 * side ({@link stackedSolved}); the turns of the joins choice are already
 * laid out side by side with it, and splitting them as well only had them
 * wait for the cores (Agent workbench, Track, 1.5 s against 1.7 s).
 * Each solve tells its drawing's reading only where a choice may weigh it:
 * where joins turn, where Blocks may face its walls, or where the caller
 * weighs the drawing against another.
 * @param graph The measured hierarchy.
 * @param nesting How its containers and group regions are drawn.
 * @param weighed Whether the caller weighs the drawing against another.
 * @returns The drawing.
 */
function joinedOut(graph: ElkNode, nesting: Nesting, weighed: boolean): Promise<Drawing> {
	const joining = rendererHost().core().joiningOf(JSON.stringify(graph), nesting);
	const read = weighed || joining.length > 0 || nesting === "blocks";
	if (nesting !== "blocks")
		return layJoined(joining, drawsBetter, (apart, signal) =>
			apart.size === 0
				? stackedSolved(graph, nesting, { apart, read }, signal)
				: solved(graph, nesting, { apart, read }, signal),
		);
	return layJoined(
		joining,
		drawsBetter,
		(apart, signal) => solved(graph, nesting, { apart, read }, signal),
		(apart, signal) => solved(graph, nesting, { apart, read, facing: true }, signal),
	);
}

/**
 * Lay a measured hierarchy out as blocks and route every relationship. Drawn
 * inline, a board whose groups gather into regions is also laid with each
 * group's region packed as a block of its own, and the layout that reads
 * better is kept (the core's `readsBetterPacked`): a group whose members
 * stand far apart in the board's ranks spans them all as a cluster, a tall
 * sparse band, but packed stands whole.
 * @param graph The measured hierarchy.
 * @param inline Whether containers and group regions are drawn inline, as
 * clusters of the board's own layout, rather than packed as blocks.
 * @returns The drawing's geometry.
 */
async function placedBlocks(graph: ElkNode, inline: boolean): Promise<Placed> {
	const regions = inline && rendererHost().core().hasRegions(JSON.stringify(graph));
	const first = joinedOut(graph, inline ? "inline" : "blocks", regions);
	if (!regions) return (await first).placed;
	const [packed, laid] = await Promise.all([joinedOut(graph, "groups", true), first]);
	return rendererHost().core().readsBetterPacked(readingOf(packed), readingOf(laid))
		? packed.placed
		: laid.placed;
}

export { placedBlocks, type Placed };
