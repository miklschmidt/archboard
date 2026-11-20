// The semantic renderer under Bun: the renderer core (shared/render), with the
// Bun host installed before anything is drawn or measured. The CLI, the rasterizer
// and the Archboard server's render route import this; a browser installs its own
// host and imports the core.
import {
	renderArchitecture as renderArchitectureIn,
	renderSemanticView as renderSemanticViewIn,
} from "#shared/render/rules/diagram.ts";
import {
	type DiagramRenderRequest,
	type RenderedDiagram,
	type SemanticViewRenderRequest,
} from "#shared/protocol/render-request.ts";
import {
	renderLegacyBoard as renderLegacyBoardIn,
	type LegacyRenderChoices,
	type LegacyRenderOutcome,
} from "#shared/render/rules/legacy-board.ts";
import { type LegacyBoard, type SemanticPolicy } from "@archboard/model-contract";
import { installBunHost } from "#runtime/bun-renderer/services/bun-host.ts";

/**
 * A semantic architecture in, one self-contained SVG plus its geometry out.
 * @param request What to draw, and on which ground.
 * @returns The document, its size and its atlas.
 */
async function renderArchitecture(
	request: DiagramRenderRequest & { grammar?: SemanticViewRenderRequest["grammar"] },
): Promise<RenderedDiagram> {
	installBunHost();
	return request.grammar === undefined
		? renderArchitectureIn(request)
		: renderSemanticViewIn({ ...request, grammar: request.grammar });
}

/**
 * One view of a document, in whichever grammar it asks for.
 * @param request What to draw, in which grammar and on which ground.
 * @returns The document, its size and its atlas.
 */
async function renderSemanticView(request: SemanticViewRenderRequest): Promise<RenderedDiagram> {
	installBunHost();
	return renderSemanticViewIn(request);
}

/**
 * Answer a render of one document: the variant and view it names, drawn.
 * @param document The document, as read.
 * @param choices The variant, view, theme and faces asked for.
 * @param policy The vault's presentation policy.
 * @returns The answer, or which name the document does not have.
 */
async function renderLegacyBoard(
	document: LegacyBoard,
	choices: LegacyRenderChoices,
	policy: SemanticPolicy,
): Promise<LegacyRenderOutcome> {
	installBunHost();
	return renderLegacyBoardIn(document, choices, policy);
}

export { renderArchitecture, renderLegacyBoard, renderSemanticView };
