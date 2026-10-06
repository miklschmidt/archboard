// Layout engines (TASK-348): each takes an architecture and its measured text
// and answers the drawing the painter and the atlas read. A render names its
// engine; nothing outside this seam knows which one drew.
import type { ChangeKind, LayoutEngineName, VariantContent } from "@/shared/semantic-board/index";
import type {
	MeasuredArchitecture,
	PaintedDrawing,
} from "@/transformers/semantic-renderer/lib/drawing";
import { layoutBlocks, layoutTracks } from "@/transformers/semantic-renderer/lib/blocks/index";

/**
 * One way of laying an architecture out: the content, its measured text, the
 * comparison standings when it is read against another variant, and the
 * children that are entry points of their containers on the variant.
 */
type LayoutEngine = (
	content: VariantContent,
	measured: MeasuredArchitecture,
	standings: Readonly<Record<string, ChangeKind>> | undefined,
	entries: ReadonlySet<string>,
) => Promise<PaintedDrawing>;

const ENGINES: Readonly<Record<LayoutEngineName, LayoutEngine>> = {
	track: layoutTracks,
	blocks: layoutBlocks,
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
