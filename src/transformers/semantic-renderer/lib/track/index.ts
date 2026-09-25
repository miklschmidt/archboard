// The track engine (TASK-349): Graphviz places cards and label boxes on ranks,
// and every relationship is drawn on tracks it owns in the channels between
// them (`placement.ts`, `route.ts`). One placement and one routing pass.
import type { ChangeKind, VariantContent } from "@/shared/semantic-board/index";
import type {
	MeasuredArchitecture,
	PaintedDrawing,
} from "@/transformers/semantic-renderer/lib/drawing";
import { SOLVE_STAGE, rendererHost } from "@/transformers/semantic-renderer/lib/host";
import { bridgeCrossings } from "@/transformers/semantic-renderer/lib/layout/crossings";
import {
	COMPOUND_OPTIONS,
	compoundGraph,
} from "@/transformers/semantic-renderer/lib/layout/compound-graph";
import { routeTracks } from "@/transformers/semantic-renderer/lib/track/route";

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
	const placed = await rendererHost().solve(compoundGraph(content, measured, standings), {
		...COMPOUND_OPTIONS,
		[SOLVE_STAGE]: "track",
	});
	const drawing = routeTracks(content, placed, measured);
	return { ...drawing, bridged: bridgeCrossings(drawing) };
}

export { layoutTracks };
