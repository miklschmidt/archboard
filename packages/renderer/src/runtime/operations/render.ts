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
	drawBoard,
	type BoardRenderChoices,
	type BoardRenderOutcome,
	type DrawnInput,
} from "#shared/rules/render/board.ts";
import type { SemanticBoard } from "@archboard/board/document";
import type { SemanticPolicy } from "@archboard/board/policy";
import { wasDrawn, type SemanticRenderReply } from "@archboard/board/render-reply";
import { installBunHost } from "#runtime/services/bun-host.ts";
import { boardRecipe, type RecipeVault } from "#runtime/operations/recipe/board-recipe.ts";
import { embedRecipeInSvg } from "#runtime/operations/recipe/svg-recipe.ts";

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
 * @param recipe For a board render that stands alone, the vault its recipe names; the SVG then
 * carries its render recipe (ADR 0057).
 * @param recipe.vault The vault.
 * @returns The answer, or which name the board does not have.
 */
async function renderBoard(
	board: SemanticBoard,
	choices: BoardRenderChoices,
	policy: SemanticPolicy,
	recipe?: { readonly vault: RecipeVault },
): Promise<BoardRenderOutcome> {
	installBunHost();
	const drawing = await drawBoard(board, choices, policy);
	if (!drawing.ok) return drawing;
	const reply =
		recipe === undefined
			? drawing.reply
			: carryingRecipe(board, choices, drawing.reply, drawing.input, recipe.vault);
	return { ok: true, reply };
}

/**
 * A drawn answer whose SVG carries its render recipe.
 * @param board The board, as read.
 * @param choices What the render asked for.
 * @param reply What the render answered.
 * @param input What the picture was drawn from.
 * @param vault The vault the recipe names.
 * @returns The answer, its SVG carrying the recipe; an answer with no picture as it was.
 */
function carryingRecipe(
	board: SemanticBoard,
	choices: BoardRenderChoices,
	reply: SemanticRenderReply,
	input: DrawnInput,
	vault: RecipeVault,
): SemanticRenderReply {
	if (!wasDrawn(reply)) return reply;
	const recipe = boardRecipe(board, choices, reply, input, vault);
	return { ...reply, svg: embedRecipeInSvg(reply.svg, recipe) };
}

export { renderArchitecture, renderBoard, renderSemanticView };
