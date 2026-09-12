// The read-only semantic board viewer: an agent authors meaning, the server
// draws it, and this module shows the picture and owns the camera and the
// selection over it (ADR 0023).
//
// Nothing here writes a board. There is no authoring path, no geometry and no
// version to check, because the browser never states anything about a semantic
// board — it asks for a picture of one and says which part of it a person is
// looking at.

export {
	SemanticBoardError,
	fetchSemanticBoardDocument,
	fetchSemanticBoards,
	fetchSemanticRender,
	type SemanticAtlas,
	type SemanticBoardEntry,
	type SemanticBox,
	type SemanticDrawing,
	type SemanticFailureCode,
	type SemanticNothingDrawn,
	type SemanticRender,
	type SemanticOfferedView,
	type SemanticRenderRequest,
	type SemanticTheme,
	type SemanticVariantRef,
} from "@/ui/semantic-board-canvas/api/semantic-boards";
export {
	SemanticBoardStage,
	type SemanticBoardStageProps,
} from "@/ui/semantic-board-canvas/components/SemanticBoardStage";
export type { SelectedSubject } from "@/ui/semantic-board-canvas/lib/board-document";
export {
	boardAddressOf,
	boardKeyFor,
	sameBoardName,
	type SemanticPaneReading,
	type SemanticTarget,
} from "@/ui/semantic-board-canvas/lib/address";
export { SemanticStanding } from "@/ui/semantic-board-canvas/components/SemanticStanding";
export { announceSemanticBoardChange } from "@/ui/semantic-board-canvas/lib/board-changes";
export {
	semanticBoardKeys,
	semanticBoardListQuery,
	semanticRenderQuery,
} from "@/ui/semantic-board-canvas/lib/queries";
