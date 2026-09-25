// The track engine (TASK-349): Graphviz places cards and label boxes on ranks,
// and every relationship is drawn on tracks it owns in the channels between
// them (`placement.ts`, `route.ts`), its widest rank wrapped when the board is
// too wide (`wrap.ts`). A board with no container and no group region is one
// block of cards, which the block engine lays out the same way and folds into
// columns when that reads better.
import type { ElkNode } from "@archboard/elk-rs";
import type { ChangeKind, VariantContent } from "@/shared/semantic-board/index";
import type {
	MeasuredArchitecture,
	PaintedDrawing,
} from "@/transformers/semantic-renderer/lib/drawing";
import { SOLVE_STAGE, rendererHost } from "@/transformers/semantic-renderer/lib/host";
import { bridgeCrossings } from "@/transformers/semantic-renderer/lib/layout/crossings";
import {
	COMPOUND_OPTIONS,
	PLACING_GROUP,
	compoundGraph,
} from "@/transformers/semantic-renderer/lib/layout/compound-graph";
import { drawnBlocks } from "@/transformers/semantic-renderer/lib/blocks/index";
import { routeTracks } from "@/transformers/semantic-renderer/lib/track/route";

/**
 * Whether a board holds no container and no group region: every card on the
 * board itself.
 * @param graph The measured hierarchy.
 * @returns True when it is flat.
 */
function flat(graph: ElkNode): boolean {
	return (graph.children ?? []).every(
		(child) => !child.children?.length && child.layoutOptions?.[PLACING_GROUP] === undefined,
	);
}

/**
 * Lay an architecture out on tracks.
 * @param content The architecture.
 * @param measured Its measured cards and labels.
 * @param standings Comparison standings, which keep marked relationships off one trunk.
 * @returns The drawing painting and the atlas read.
 */
async function layoutTracks(
	content: VariantContent,
	measured: MeasuredArchitecture,
	standings?: Readonly<Record<string, ChangeKind>>,
): Promise<PaintedDrawing> {
	const graph = compoundGraph(content, measured, standings);
	if (flat(graph)) return drawnBlocks(content, measured, graph);
	const placed = await rendererHost().solve(graph, { ...COMPOUND_OPTIONS, [SOLVE_STAGE]: "track" });
	const drawing = routeTracks(content, placed, measured);
	return { ...drawing, bridged: bridgeCrossings(drawing) };
}

export { layoutTracks };
