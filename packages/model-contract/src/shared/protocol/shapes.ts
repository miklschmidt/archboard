// The model's shapes that other contracts are built from (ADR 0058, owner
// decision 18: one keyed getter over a closed set). A command declares the
// answer it prints, a protocol embeds a revision or a refusal in its own reply,
// and an option offers the layout engines: each takes the shape by its key, so
// what it declares is the model's own definition and cannot drift from it.
// Reading a value is never done through a shape: `parseDocument`,
// `parseModelRequest` and `readModelReply` read.
//
// Every key has a consumer outside the contract that builds a schema of its own
// from it. A key nobody composes does not belong here.

import { ModelSnapshotSchema } from "#shared/canonical-contracts/schemas/model-snapshot.ts";
import {
	ArchitectureArchiveInitializationSchema,
	ArchitectureCheckpointListSchema,
	ArchitectureCheckpointRequestSchema,
	ArchitectureCheckpointRetainSchema,
	ArchitectureModelFailureSchema,
	ArchitectureModelReadSchema,
	ArchitectureModelSchema,
	ArchitecturePublicationDestinationSchema,
	ArchitecturePublicationRequestSchema,
	ArchitecturePublicationSchema,
} from "#shared/canonical-contracts/schemas/model.ts";
import {
	ArchitectureClaimListSchema,
	ArchitectureClaimResultSchema,
	ArchitectureModuleEditResultSchema,
	ArchitectureRecoveryResultSchema,
	ArchitectureRenderRequestSchema,
	ArchitectureRenderResultSchema,
} from "#shared/canonical-contracts/schemas/model-operations.ts";
import { SemanticSubjectKindSchema } from "#shared/protocol/pane-context.ts";
import {
	ArchitectureRasterReceiptSchema,
	SemanticRasterReceiptSchema,
} from "#shared/protocol/raster-receipt.ts";
import {
	DiagramThemeSchema,
	DrawnPictureSchema,
	LayoutEngineSchema,
	LegendLayoutSchema,
	OfferedViewSchema,
	RenderedVariantSchema,
	StandaloneThemeSchema,
	SubjectStandingSchema,
} from "#shared/protocol/render-reply.ts";
import { LegacyInventoryReadSchema, LegacyMappingWriteSchema } from "#shared/schemas/migration.ts";
import { ArchitecturePaneReadingSchema } from "#shared/schemas/model-pane.ts";
import { ArchitectureInitializationRequestSchema } from "#shared/schemas/model-portable.ts";
import { ReconciliationKindSchema } from "#shared/schemas/reconciliation.ts";
import {
	EvidenceKindSchema,
	SemanticPolicySchema,
	VaultCheckSchema,
	VaultDiagnosticSchema,
} from "#shared/schemas/semantic-policy.ts";
import { DiagramGrammarSchema, VariantLifecycleSchema } from "#shared/schemas/vocabulary.ts";

/** The shapes, by key. */
const SHAPES = {
	// What a reading answers, and its parts other replies carry.
	modelRead: ArchitectureModelReadSchema,
	model: ArchitectureModelSchema,
	refusal: ArchitectureModelFailureSchema,
	revision: ArchitectureModelSchema.shape.revision,
	selectedState: ArchitectureModelSchema.shape.selectedState,
	explanation: ArchitectureModelSchema.shape.explanation.unwrap(),
	modelSnapshot: ModelSnapshotSchema,
	paneReading: ArchitecturePaneReadingSchema,
	// What an operation is asked and answers, as a command declares them.
	checkpointRequest: ArchitectureCheckpointRequestSchema,
	checkpointRetain: ArchitectureCheckpointRetainSchema,
	checkpointList: ArchitectureCheckpointListSchema,
	archiveInitialization: ArchitectureArchiveInitializationSchema,
	editResult: ArchitectureModuleEditResultSchema,
	claimResult: ArchitectureClaimResultSchema,
	claimList: ArchitectureClaimListSchema,
	recoveryResult: ArchitectureRecoveryResultSchema,
	initializationRequest: ArchitectureInitializationRequestSchema,
	legacyInventory: LegacyInventoryReadSchema,
	legacyMappingWrite: LegacyMappingWriteSchema,
	publication: ArchitecturePublicationSchema,
	publicationRequest: ArchitecturePublicationRequestSchema,
	publicationDestination: ArchitecturePublicationDestinationSchema,
	renderRequest: ArchitectureRenderRequestSchema,
	renderSuccess: ArchitectureRenderResultSchema.options[0],
	// What a picture is and carries.
	drawnPicture: DrawnPictureSchema,
	renderedVariant: RenderedVariantSchema,
	offeredView: OfferedViewSchema,
	subjectStanding: SubjectStandingSchema,
	// What a rasterized picture's receipt says: of a model reading, and of a legacy board's view.
	rasterReceipt: ArchitectureRasterReceiptSchema,
	legacyRasterReceipt: SemanticRasterReceiptSchema,
	// The vocabularies an option or a field offers.
	diagramTheme: DiagramThemeSchema,
	standaloneTheme: StandaloneThemeSchema,
	layoutEngine: LayoutEngineSchema,
	legendLayout: LegendLayoutSchema,
	diagramGrammar: DiagramGrammarSchema,
	variantLifecycle: VariantLifecycleSchema,
	semanticSubjectKind: SemanticSubjectKindSchema,
	reconciliationKind: ReconciliationKindSchema,
	evidenceKind: EvidenceKindSchema,
	// A vault's policy and what its check says.
	semanticPolicy: SemanticPolicySchema,
	codeCheckRules: SemanticPolicySchema.shape.codeCheck.unwrap().shape.rules,
	vaultCheck: VaultCheckSchema,
	vaultDiagnostic: VaultDiagnosticSchema,
	diagnosticSubject: VaultDiagnosticSchema.shape.subject.unwrap(),
} as const;

/** Every shape another contract may be built from. */
type ModelShapeKey = keyof typeof SHAPES;

/** The shape of one key. */
type ModelShape<K extends ModelShapeKey> = (typeof SHAPES)[K];

/**
 * The shape another contract embeds or offers, by its key.
 * @param key The shape's key.
 * @returns The shape.
 */
function modelShape<K extends ModelShapeKey>(key: K): ModelShape<K> {
	return SHAPES[key];
}

export { modelShape, type ModelShape, type ModelShapeKey };
