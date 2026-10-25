// The semantic renderer under Bun: the renderer core (shared/rules/render), with the
// Bun host installed before anything is drawn or measured. The CLI, the rasterizer
// and the Archboard server's render route import this; a browser installs its own
// host and imports the core.
import {
	renderArchitecture as renderArchitectureIn,
	renderSemanticView as renderSemanticViewIn,
} from "#shared/rules/render/diagram.ts";
import {
	type DiagramRenderRequest,
	type RenderedDiagram,
	type SemanticViewRenderRequest,
} from "#shared/protocol/render-request.ts";
import {
	renderBoard as renderBoardIn,
	type BoardRenderChoices,
	type BoardRenderOutcome,
} from "#shared/rules/render/board.ts";
import type { SemanticBoard } from "@archboard/board/document";
import type { SemanticPolicy } from "@archboard/board/policy";
import { installBunHost } from "#runtime/services/bun-host.ts";

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
 * One view of a board, in whichever grammar it asks for.
 * @param request What to draw, in which grammar and on which ground.
 * @returns The document, its size and its atlas.
 */
async function renderSemanticView(request: SemanticViewRenderRequest): Promise<RenderedDiagram> {
	installBunHost();
	return renderSemanticViewIn(request);
}

/**
 * Answer a render of one board: the variant and view it names, drawn.
 * @param board The board, as read.
 * @param choices The variant, view, theme and faces asked for.
 * @param policy The vault's presentation policy.
 * @returns The answer, or which name the board does not have.
 */
async function renderBoard(
	board: SemanticBoard,
	choices: BoardRenderChoices,
	policy: SemanticPolicy,
): Promise<BoardRenderOutcome> {
	installBunHost();
	return renderBoardIn(board, choices, policy);
}

export { renderArchitecture, renderBoard, renderSemanticView };
