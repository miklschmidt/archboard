// The semantic renderer under Bun: the renderer core (src/transformers/
// semantic-renderer), with the Bun host installed before anything is drawn or
// measured. The CLI, the rasterizer and the canvas server's render route import
// this; a browser installs its own host and imports the core.
import {
	renderArchitecture as renderArchitectureIn,
	renderDataFlow as renderDataFlowIn,
	renderSemanticView as renderSemanticViewIn,
	type DiagramRenderRequest,
	type RenderedDiagram,
	type SemanticViewRenderRequest,
} from "@/transformers/semantic-renderer/index";
import { installBunHost } from "@/runtime/semantic-renderer/lib/bun-host";

/**
 * A semantic architecture in, one self-contained SVG plus its geometry out.
 * @param request What to draw, and on which ground.
 * @returns The document, its size and its atlas.
 */
async function renderArchitecture(request: DiagramRenderRequest): Promise<RenderedDiagram> {
	installBunHost();
	return renderArchitectureIn(request);
}

/**
 * A semantic data flow in, one self-contained SVG plus its geometry out.
 * @param request What to draw, and on which ground.
 * @returns The document, its size and its atlas.
 */
function renderDataFlow(request: DiagramRenderRequest): RenderedDiagram {
	installBunHost();
	return renderDataFlowIn(request);
}

/**
 * One view of a board, in whichever grammar it asks for.
 * @param request What to draw, in which grammar and on which ground.
 * @returns The document, its size and its atlas.
 */
async function renderSemanticView(request: SemanticViewRenderRequest): Promise<RenderedDiagram> {
	installBunHost();
	return renderSemanticViewIn(request);
}

/**
 * How wide a piece of text is as the Bun canvas measures it, in a diagram face.
 * @param text The text.
 * @param face The face: its CSS family name and weight.
 * @param face.family The CSS family name the document registers.
 * @param face.weight The weight.
 * @param fontSize The size.
 * @returns Its width.
 * @throws {Error} When the canvas gives no 2D context.
 */
function diagramTextWidth(
	text: string,
	face: { readonly family: string; readonly weight: number },
	fontSize: number,
): number {
	installBunHost();
	const context = new OffscreenCanvas(1, 1).getContext("2d");
	if (context === null) throw new Error("The Bun canvas gives no 2D context");
	context.font = `${face.weight} ${fontSize}px "${face.family}"`;
	return context.measureText(text).width;
}

export {
	type ReadingDirection,
	type SubjectStanding,
	type StatedStandings,
	type DiagramRenderRequest,
	type SemanticViewRenderRequest,
	type RenderedDiagram,
	type RenderErrorCode,
	SemanticRenderError,
	paletteFor,
	type Palette,
} from "@/transformers/semantic-renderer/index";
export { diagramTextWidth, renderArchitecture, renderDataFlow, renderSemanticView };
