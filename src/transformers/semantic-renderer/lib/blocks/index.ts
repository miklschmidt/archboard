// The block engine: the board, every container and every group region laid
// out as a block of its own, compact around what it holds, and every
// relationship drawn on tracks through the ports where it crosses a block's
// edge (`tree.ts`, `place.ts`). Everything is laid out and routed where the
// layout engines run; here the geometry becomes the drawing.
import type { ElkNode } from "@archboard/elk-rs";
import { z } from "zod";
import type { ChangeKind, VariantContent } from "@/shared/semantic-board/index";
import type {
	ArchitectureDrawing,
	DrawingEdge,
	MeasuredArchitecture,
	PaintedDrawing,
} from "@/transformers/semantic-renderer/lib/drawing";
import { SOLVE_STAGE, rendererHost } from "@/transformers/semantic-renderer/lib/host";
import { bridgeCrossings } from "@/transformers/semantic-renderer/lib/layout/crossings";
import {
	COMPOUND_OPTIONS,
	compoundGraph,
} from "@/transformers/semantic-renderer/lib/layout/compound-graph";
import { curveThrough, pathOf, selfLoop } from "@/transformers/semantic-renderer/lib/layout/curves";
import { BLOCKS_PLACED } from "@/transformers/semantic-renderer/lib/blocks/place";

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

/**
 * The drawing the block engine's geometry describes.
 * @param content The architecture.
 * @param measured Its measured cards, labels and captions.
 * @param placed The geometry.
 * @returns The drawing.
 */
function drawingOf(
	content: VariantContent,
	measured: MeasuredArchitecture,
	placed: z.infer<typeof PlacedSchema>,
): ArchitectureDrawing {
	const cards = placed.cards.map(({ id, box, depth }) => ({
		measured: measured.nodes.get(id)!,
		box,
		depth,
	}));
	const containers = placed.frames.map(({ id, box, depth }) => ({
		measured: measured.nodes.get(id)!,
		box,
		depth,
	}));
	const boxes = new Map(
		[...cards, ...containers].map(({ measured: { node }, box }) => [node.id, box]),
	);
	const routes = new Map(placed.edges.map((edge) => [edge.id, edge]));
	const edges: DrawingEdge[] = content.edges
		.toSorted((one, other) => one.order - other.order)
		.map((edge) => {
			const route = routes.get(edge.id);
			const label = measured.labels.get(edge.id);
			const curve =
				route === undefined || route.points.length < 2
					? selfLoop(boxes.get(edge.from)!, false)
					: curveThrough(route.points, true);
			return {
				edge,
				curve,
				path: pathOf(curve),
				...(label === undefined || route?.label === undefined
					? {}
					: { label: { measured: label, box: route.label } }),
			};
		});
	const regions = placed.regions.flatMap(({ group, parent, box, caption, depth }) => {
		const words = measured.groups?.captions.get(group);
		return words === undefined
			? []
			: [{ group, parent, box, caption: { box: caption, measured: words }, depth }];
	});
	return {
		direction: "down",
		width: placed.width,
		height: placed.height,
		cards,
		containers,
		edges,
		...(regions.length === 0 ? {} : { regions }),
	};
}

/**
 * Lay a measured hierarchy out as blocks, then draw it.
 * @param content The architecture.
 * @param measured Its measured cards and labels.
 * @param graph Its measured hierarchy.
 * @returns The drawing painting and the atlas read.
 */
async function drawnBlocks(
	content: VariantContent,
	measured: MeasuredArchitecture,
	graph: ElkNode,
): Promise<PaintedDrawing> {
	const solved = await rendererHost().solve(graph, {
		...COMPOUND_OPTIONS,
		[SOLVE_STAGE]: "blocks",
	});
	const placed = PlacedSchema.parse(JSON.parse(solved.layoutOptions?.[BLOCKS_PLACED] ?? "{}"));
	const drawing = drawingOf(content, measured, placed);
	return { ...drawing, bridged: bridgeCrossings(drawing) };
}

/**
 * Lay an architecture out as blocks.
 * @param content The architecture.
 * @param measured Its measured cards and labels.
 * @param standings Comparison standings, which keep marked relationships off one trunk.
 * @returns The drawing painting and the atlas read.
 */
async function layoutBlocks(
	content: VariantContent,
	measured: MeasuredArchitecture,
	standings?: Readonly<Record<string, ChangeKind>>,
): Promise<PaintedDrawing> {
	return drawnBlocks(content, measured, compoundGraph(content, measured, standings));
}

export { drawnBlocks, layoutBlocks };
