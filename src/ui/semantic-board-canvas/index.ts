// The read-only semantic board viewer: an agent authors meaning, the renderer
// draws it — in this page when the page runs one, or on the server — and this
// module shows the picture and owns the camera and the selection over it
// (ADR 0023).
//
// Nothing here writes a board. There is no authoring path, no geometry and no
// version to check, because the browser never states anything about a semantic
// board — it reads one, draws or asks for a picture of it, and says which part
// of it a person is looking at.

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
	vaultCheckQuery,
} from "@/ui/semantic-board-canvas/lib/queries";
export {
	createLocalPictureSource,
	type DrawBoard,
	type LocalPictureSetup,
} from "@/ui/semantic-board-canvas/lib/local-pictures";
export type { PictureStorage } from "@/ui/semantic-board-canvas/lib/picture-cache";
export {
	takePicturesFrom,
	type PictureSource,
} from "@/ui/semantic-board-canvas/lib/picture-source";
