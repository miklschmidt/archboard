// Layout engines (TASK-348): each takes an architecture and its measured text
// and answers the drawing the painter and the atlas read. A render names its
// engine; nothing outside this seam knows which one drew.
import type { ChangeKind, LayoutEngineName, VariantContent } from "@/shared/semantic-board/index";
import type {
	MeasuredArchitecture,
	PaintedDrawing,
} from "@/transformers/semantic-renderer/lib/drawing";
import { layoutCompound } from "@/transformers/semantic-renderer/lib/layout/compound";
import { layoutTracks } from "@/transformers/semantic-renderer/lib/track/index";

/** One way of laying an architecture out. */
type LayoutEngine = (
	content: VariantContent,
	measured: MeasuredArchitecture,
	standings?: Readonly<Record<string, ChangeKind>>,
) => Promise<PaintedDrawing>;

const ENGINES: Readonly<Record<LayoutEngineName, LayoutEngine>> = {
	graphviz: layoutCompound,
	track: layoutTracks,
};

/**
 * The engine a render named.
 * @param name Its name.
 * @returns The engine.
 */
function layoutEngine(name: LayoutEngineName): LayoutEngine {
	return ENGINES[name];
}

export { layoutEngine, type LayoutEngine };
