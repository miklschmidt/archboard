// The model contract: every shape the model's sides exchange and persist,
// handed out as operations that read them and the types derived from them.
// No caller holds a schema: it parses a document, a request or a reply by its
// kind, prints a schema by its name, and builds its own contract from a shape
// it takes by its key.

export {
	parseDocument,
	type DocumentKind,
	type DocumentOptions,
	type ModelDocument,
	type ModelDocumentInput,
} from "#shared/protocol/documents.ts";
export {
	parseModelRequest,
	type ModelRequest,
	type ModelRequestInput,
	type RequestOperation,
} from "#shared/protocol/requests.ts";
export {
	readModelReply,
	type ModelReply,
	type ReplyDelivery,
	type ReplyOperation,
} from "#shared/protocol/replies.ts";
export { describeModelSchema, type ModelSchemaName } from "#shared/protocol/schema-description.ts";
export { modelShape, type ModelShape } from "#shared/protocol/shapes.ts";
export {
	normalizePaneKey,
	paneAddressKey,
	parsePaneKey,
	statedVariant,
	type LegacyIdentity,
} from "#shared/protocol/pane-key.ts";
export {
	defaultLayoutEngine,
	type DiagramAtlas,
	type DiagramBox,
	type DiagramTheme,
	type DrawnPicture,
	type DrawnSubjects,
	type LayoutEngineName,
	type LegendLayout,
	type NothingDrawn,
	type NothingDrawnReason,
	type OfferedView,
	type SemanticRenderReply,
	type StandaloneTheme,
} from "#shared/protocol/render-reply.ts";
export { nestedSteps, readFlow, type FlatStep } from "#shared/rules/flow-steps.ts";
export {
	defaultSemanticPolicy,
	type DiagnosticSubject,
	type SemanticPolicy,
	type VaultDiagnostic,
} from "#shared/schemas/semantic-policy.ts";
export {
	subjectsOf,
	type SemanticEdge,
	type SemanticNode,
	type VariantContent,
} from "#shared/schemas/content.ts";
export { normalizeGroupIds } from "#shared/schemas/primitives.ts";
export {
	addressedVariant,
	findVariant,
	resolveVariant,
	variantNamed,
	type LegacyBoard,
	type SemanticVariant,
} from "#shared/schemas/legacy-board.ts";
export {
	everythingView,
	type FlowDecision,
	type FlowLoop,
	type FlowStep,
	type SemanticFlow,
	type SemanticView,
	type ViewScope,
} from "#shared/schemas/views.ts";
export type { SemanticWalkthrough, WalkthroughBeat } from "#shared/schemas/walkthrough.ts";
export type { LegacyListing } from "#shared/protocol/legacy-listing.ts";
export type { DiagramGrammar, EdgeEmphasis } from "#shared/schemas/vocabulary.ts";
export type {
	ChangedField,
	ReconciliationIssue,
	ToldStanding,
} from "#shared/schemas/reconciliation.ts";
export type { InterfaceCounts } from "#shared/schemas/model-interfaces.ts";
export type {
	LegacyInventory,
	LegacyInventoryRead,
	LegacyMappingPlan,
	LegacyMappingWrite,
	LegacyOccurrence,
	MigrationConflict,
} from "#shared/schemas/migration.ts";
export type {
	ArchitectureClaim,
	ArchitectureClaimList,
	ArchitectureClaimRequest,
	ArchitectureClaimResult,
	ArchitectureEvent,
	ArchitectureFeedFrame,
	ArchitectureModuleEdit,
	ArchitectureModuleEditResult,
	ArchitectureRecoveryResult,
} from "#shared/canonical-contracts/schemas/model-operations.ts";
export type {
	ArchitectureCheckpoint,
	ArchitectureCheckpointList,
	ArchitectureCheckpointRequest,
	ArchitectureCheckpointRetain,
	ArchitectureCheckpointRows,
	ArchitectureModel,
	ArchitectureModelRead,
	ArchitectureRetainedModule,
	ArchitectureSummary,
	ModelDiagnostic,
	ModuleNavigationRead,
	ReadingIdentity,
} from "#shared/canonical-contracts/schemas/model.ts";
