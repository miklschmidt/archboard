// The canonical contract for a semantic board (ADR 0023).
//
// One Zod schema is the authority: the TypeScript types are inferred from it,
// so there is no second description of a board to keep in step, and a JSON
// Schema can be generated from it on the day something outside this repository
// needs one. Nothing here reads a file, mints an id or draws anything —
// `src/runtime/semantic-board-store` owns persistence and
// `src/runtime/semantic-renderer` owns the picture.

import { z } from "zod";
import { SemanticBoardSchema, type SemanticBoard } from "@/shared/semantic-board/lib/aggregate";
import { checkSemanticBoard, describeIntegrityIssues } from "@/shared/semantic-board/lib/integrity";

/** A document that parsed and is coherent, or the reason it is neither. */
type SemanticBoardParse =
	| { readonly ok: true; readonly board: SemanticBoard }
	| { readonly ok: false; readonly problem: string };

/**
 * Read an untrusted value as a board: the shape first, then the rules the
 * shape cannot state. Both failures come back the same way, because a caller
 * that has to tell them apart is a caller deciding whether to draw something
 * incoherent.
 * @param value Anything at all, typically the contents of a board file.
 * @returns The board, or why it is not one.
 */
function parseSemanticBoard(value: unknown): SemanticBoardParse {
	const parsed = SemanticBoardSchema.safeParse(value);
	if (!parsed.success) {
		return { ok: false, problem: z.prettifyError(parsed.error) };
	}
	const issues = checkSemanticBoard(parsed.data);
	if (issues.length > 0) {
		return { ok: false, problem: describeIntegrityIssues(issues) };
	}
	return { ok: true, board: parsed.data };
}

export {
	DiagramGrammarSchema,
	type DiagramGrammar,
	MessageKindSchema,
	type MessageKind,
	NodeKindSchema,
	type NodeKind,
	EdgeKindSchema,
	type EdgeKind,
	EdgeEmphasisSchema,
	type EdgeEmphasis,
	VariantLifecycleSchema,
	type VariantLifecycle,
} from "@/shared/semantic-board/lib/vocabulary";
export {
	SemanticIdSchema,
	DisplayNameSchema,
	GroupIdSchema,
	GroupMembershipsSchema,
	normalizeGroupIds,
	persistedGroupIds,
	ResponsibilitySchema,
	DescriptionSchema,
} from "@/shared/semantic-board/lib/primitives";
export {
	type BoundaryDirection,
	type BoundaryEdge,
	type GroupInspection,
	groupsUsed,
	inspectGroup,
	isMemberOf,
	gatheringGroups,
	placingGroups,
} from "@/shared/semantic-board/lib/groups";
export {
	type Caller,
	type ContainerInspection,
	type ContainerInterface,
	type EntryPoint,
	type InterfaceMeasures,
	inspectContainer,
	interfaceMeasures,
} from "@/shared/semantic-board/lib/container-interface";
export {
	FlowStepSchema,
	type FlowStep,
	type FlowMessage,
	type FlowDecision,
	type FlowAlternative,
	type FlowLoop,
	SemanticFlowSchema,
	type SemanticFlow,
	ViewScopeSchema,
	type ViewScope,
	SemanticViewSchema,
	type SemanticView,
} from "@/shared/semantic-board/lib/views";
export {
	type StepPlace,
	type FlatStep,
	isMessage,
	stepWords,
	placedSteps,
	everyStep,
	messagesOf,
	flatSteps,
	nestedSteps,
} from "@/shared/semantic-board/lib/flow-steps";
export {
	WalkthroughBeatSchema,
	type WalkthroughBeat,
	SemanticWalkthroughSchema,
	type SemanticWalkthrough,
} from "@/shared/semantic-board/lib/walkthrough";
export {
	DrillDownVariantSchema,
	type DrillDownVariant,
	DrillDownSchema,
	type DrillDown,
	DEFAULT_TRAFFIC_SPEED,
	DEFAULT_TRAFFIC_VOLUME,
	EdgeTrafficSchema,
	type EdgeTraffic,
	effectiveTraffic,
	SemanticNodeSchema,
	type SemanticNode,
	SemanticEdgeSchema,
	type SemanticEdge,
	VariantContentSchema,
	type VariantContent,
	type SubjectKind,
	BEAT_SUBJECT_KINDS,
	type VariantSubject,
	subjectsOf,
	subjectIds,
	emptyContent,
} from "@/shared/semantic-board/lib/content";
export { sameSemanticValue } from "@/shared/semantic-board/lib/semantic-value";
export {
	AdoptionSchema,
	ShelvingSchema,
	type Adoption,
	type Shelving,
	SEMANTIC_BOARD_SCHEMA_VERSION,
	FIRST_BOARD_VERSION,
	SemanticVariantSchema,
	type SemanticVariant,
	SemanticBoardLevelSchema,
	type SemanticBoardLevel,
	SemanticBoardSchema,
	type SemanticBoard,
	currentVariant,
	nothingBuilt,
	type VariantAddress,
	addressedVariant,
	nextVersion,
	findVariant,
	variantNamed,
	resolveVariant,
	CURRENT_DESIGNATION,
	asksForDesignation,
} from "@/shared/semantic-board/lib/aggregate";
export {
	type IntegrityIssue,
	checkSemanticBoard,
	checkVariantContent,
	describeIntegrityIssues,
} from "@/shared/semantic-board/lib/integrity";
export {
	EVERYTHING_VIEW,
	RESERVED_VIEW_NAMES,
	findView,
	overviewContent,
	scopedContent,
	type ReadingScope,
} from "@/shared/semantic-board/lib/scope";
export {
	drawingOf,
	comparedWith,
	type DrawnChanges,
	type DrawnProposal,
} from "@/shared/semantic-board/lib/drawing";
export {
	type ChangeKind,
	type PlacedStep,
	type PlacedBeat,
	type FieldChange,
	type SubjectChange,
	type VariantComparison,
	changeOf,
	compareVariants,
	withRemoved,
	standingOf,
} from "@/shared/semantic-board/lib/compare";
export {
	type InterfaceChange,
	type InterfaceComparison,
	compareInterfaces,
} from "@/shared/semantic-board/lib/compare-interface";
export { type SemanticBoardParse, parseSemanticBoard };
export {
	BoardBranchInputSchema,
	type BoardBranchInput,
	FlowStepInputSchema,
	type FlowStepInput,
	type FlowMessageInput,
	SemanticFlowInputSchema,
	type SemanticFlowInput,
	ViewScopeInputSchema,
	type ViewScopeInput,
	SemanticViewInputSchema,
	type SemanticViewInput,
	WalkthroughBeatInputSchema,
	type WalkthroughBeatInput,
	SemanticWalkthroughInputSchema,
	type SemanticWalkthroughInput,
	NodeReferenceSchema,
	SemanticNodeInputSchema,
	type SemanticNodeInput,
	SemanticEdgeInputSchema,
	type SemanticEdgeInput,
	VariantEditInputSchema,
	type VariantEditInput,
	ConfirmableRefusalSchema,
	type ConfirmableRefusal,
	BoardCreateInputSchema,
	type BoardCreateInput,
} from "@/shared/semantic-board/lib/input";
export {
	OfferedViewSchema,
	type OfferedView,
	DiagramThemeSchema,
	type DiagramTheme,
	StandaloneThemeSchema,
	type StandaloneTheme,
	LegendLayoutSchema,
	type LegendLayout,
	DEFAULT_LAYOUT_ENGINE,
	LayoutEngineSchema,
	type LayoutEngineName,
	FontSourceSchema,
	type FontSource,
	DiagramBoxSchema,
	type DiagramBox,
	DiagramAtlasSchema,
	type DiagramAtlas,
	RenderedVariantSchema,
	type RenderedVariant,
	type RenderedChanges,
	SubjectStandingSchema,
	RenderIdentitySchema,
	DrawnBoardSchema,
	type DrawnBoard,
	NothingDrawnReasonSchema,
	type NothingDrawnReason,
	NothingDrawnSchema,
	type NothingDrawn,
	SemanticRenderReplySchema,
	type SemanticRenderReply,
	wasDrawn,
} from "@/shared/semantic-board/lib/rendering";
export {
	BoardLinkSchema,
	type BoardLink,
	ListedBoardSchema,
	type ListedBoard,
	BoardListingSchema,
	type BoardListing,
	type ListedRead,
	acceptedBoardNames,
	listedBoard,
} from "@/shared/semantic-board/lib/listing";
export {
	BoardAdoptInputSchema,
	type BoardAdoptInput,
	BoardRenameInputSchema,
	type BoardRenameInput,
	BoardShelveInputSchema,
	type BoardShelveInput,
	ChoiceSchema,
	type Choice,
	ResolutionInputSchema,
	type ResolutionInput,
	SideSchema,
	type Side,
} from "@/shared/semantic-board/lib/resolution";
export { ORDER_STEP } from "@/shared/semantic-board/lib/positions";
export {
	reconcileVariant,
	ChangedFieldSchema,
	ReconciliationIssueSchema,
	ReconciliationKindSchema,
	ToldStandingSchema,
	VariantStandingSchema,
	type ToldStanding,
	type VariantStanding,
	type ChangedField,
	type Reconciliation,
	type ReconciliationIssue,
	type ReconciliationKind,
	type ThreeStates,
} from "@/shared/semantic-board/lib/reconcile";
export {
	BoardMoveAnswerSchema,
	type BoardMoveAnswer,
	BoardMoveInputSchema,
	BoardMovePreviewSchema,
	type BoardMovePreview,
	MoveEndSchema,
	type MoveEnd,
	MovedDrillDownSchema,
	type MovedDrillDown,
} from "@/shared/semantic-board/lib/move";
