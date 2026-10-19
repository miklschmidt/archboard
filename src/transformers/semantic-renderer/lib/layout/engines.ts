// Layout engines (TASK-348): each takes an architecture and its measured text
// and answers the drawing the painter and the atlas read. A render names its
// engine; nothing outside this seam knows which one drew.
import type { ChangeKind } from "@archboard/board/comparison";
import type { LayoutEngineName } from "@archboard/board/render-reply";
import type { VariantContent } from "@archboard/board/content";
import type {
	MeasuredArchitecture,
	PaintedDrawing,
} from "@/transformers/semantic-renderer/lib/drawing";
import { layoutBlocks, layoutTracks } from "@/transformers/semantic-renderer/lib/blocks/index";

/**
 * One way of laying an architecture out: the content, its measured text, the
 * comparison standings when it is read against another variant, and each
 * child that is an entry point of its container on the variant, true when first.
 */
type LayoutEngine = (
	content: VariantContent,
	measured: MeasuredArchitecture,
	standings: Readonly<Record<string, ChangeKind>> | undefined,
	entries: ReadonlyMap<string, boolean>,
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
