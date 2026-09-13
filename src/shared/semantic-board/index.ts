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
	ResponsibilitySchema,
	DescriptionSchema,
} from "@/shared/semantic-board/lib/primitives";
export {
	FlowStepSchema,
	type FlowStep,
	SemanticFlowSchema,
	type SemanticFlow,
	ViewScopeSchema,
	type ViewScope,
	SemanticViewSchema,
	type SemanticView,
} from "@/shared/semantic-board/lib/views";
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
	type Adoption,
	SEMANTIC_BOARD_SCHEMA_VERSION,
	FIRST_BOARD_VERSION,
	SemanticVariantSchema,
	type SemanticVariant,
	SemanticBoardLevelSchema,
	type SemanticBoardLevel,
	SemanticBoardSchema,
	type SemanticBoard,
	currentVariant,
	nextVersion,
	findVariant,
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
export { scopedContent, findView } from "@/shared/semantic-board/lib/scope";
export {
	type ChangeKind,
	type PlacedStep,
	type PlacedBeat,
	type FieldChange,
	type SubjectChange,
	type VariantComparison,
	compareVariants,
	withRemoved,
	standingOf,
} from "@/shared/semantic-board/lib/compare";
export { type SemanticBoardParse, parseSemanticBoard };
export {
	BoardBranchInputSchema,
	type BoardBranchInput,
	FlowStepInputSchema,
	type FlowStepInput,
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
	BoardCreateInputSchema,
	type BoardCreateInput,
} from "@/shared/semantic-board/lib/input";
export {
	OfferedViewSchema,
	type OfferedView,
	DiagramThemeSchema,
	type DiagramTheme,
	FontSourceSchema,
	type FontSource,
	DiagramBoxSchema,
	type DiagramBox,
	DiagramAtlasSchema,
	type DiagramAtlas,
	RenderedVariantSchema,
	type RenderedVariant,
	RenderIdentitySchema,
	DrawnBoardSchema,
	type DrawnBoard,
	NothingDrawnSchema,
	type NothingDrawn,
	SemanticRenderReplySchema,
	type SemanticRenderReply,
	wasDrawn,
} from "@/shared/semantic-board/lib/rendering";
export {
	BoardAdoptInputSchema,
	type BoardAdoptInput,
	ChoiceSchema,
	type Choice,
	ResolutionInputSchema,
	type ResolutionInput,
	SideSchema,
	type Side,
} from "@/shared/semantic-board/lib/resolution";
export {
	reconcileVariant,
	ReconciliationIssueSchema,
	ReconciliationKindSchema,
	ToldStandingSchema,
	VariantStandingSchema,
	type ToldStanding,
	type VariantStanding,
	type Reconciliation,
	type ReconciliationIssue,
	type ReconciliationKind,
	type ThreeStates,
} from "@/shared/semantic-board/lib/reconcile";
