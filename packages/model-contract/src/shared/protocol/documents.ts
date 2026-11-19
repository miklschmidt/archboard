// Every document the model's sides read, parsed by its kind: the files of a
// vault, the records the store keeps beside them, the readings a pane or a
// picture is handed, and the single values a caller checks before it trusts
// them. A caller names the kind and gets the data or the reason, and never
// holds the schema that decides.

import { z } from "zod";
import { ModelSnapshotSchema } from "#shared/canonical-contracts/schemas/model-snapshot.ts";
import {
	FlowChangeSchema,
	FlowCollectionSchema,
} from "#shared/canonical-contracts/schemas/model-flows.ts";
import {
	ArchitectureManifestSchema,
	ArchitectureModelReadSchema,
	ArchitectureModuleSchema,
	GitObjectIdSchema,
	QualifiedSubjectIdSchema,
} from "#shared/canonical-contracts/schemas/model.ts";
import { ArchitectureModuleEditSchema } from "#shared/canonical-contracts/schemas/model-operations.ts";
import { checkVariantContent } from "#shared/coherence/rules/integrity.ts";
import { decodeLegacyBoard } from "#shared/coherence/rules/decode.ts";
import { parseLegacyBoard } from "#shared/coherence/rules/parse-legacy-board.ts";
import type { IntegrityIssue } from "#shared/coherence/rules/issues.ts";
import {
	PanePresentRequestSchema,
	SemanticPaneContextSchema,
} from "#shared/protocol/pane-context.ts";
import { LayoutEngineSchema, SemanticRenderReplySchema } from "#shared/protocol/render-reply.ts";
import { STORE_DOCUMENTS } from "#shared/protocol/store-documents.ts";
import { EdgeTrafficSchema, VariantContentSchema } from "#shared/schemas/content.ts";
import type { LegacyBoard } from "#shared/schemas/legacy-board.ts";
import {
	ArchitectureMigrationRequestSchema,
	InstalledMigrationSchema,
} from "#shared/schemas/migration-installation.ts";
import { LegacyOriginalInputsSchema } from "#shared/schemas/migration-inputs.ts";
import { LegacyMappingPlanSchema } from "#shared/schemas/migration.ts";
import { StateLineageSchema, StateMetadataSchema } from "#shared/schemas/model-definitions.ts";
import { ArchitecturePaneReadingSchema } from "#shared/schemas/model-pane.ts";
import {
	ArchitectureInitializationRequestSchema,
	ArchitecturePortableBundleSchema,
} from "#shared/schemas/model-portable.ts";
import {
	CorrectionSchema,
	LifecycleSchema,
	ProposalSchema,
	SelectedStateSchema,
	StateSelectionSchema,
} from "#shared/schemas/model-proposals.ts";
import { WalkthroughSchema } from "#shared/schemas/model-walkthroughs.ts";
import { SemanticIdSchema } from "#shared/schemas/primitives.ts";
import { PaletteColorSchema, SemanticPolicySchema } from "#shared/schemas/semantic-policy.ts";
import { VaultConfigurationSchema } from "#shared/schemas/vault-configuration.ts";
import { DiagramGrammarSchema } from "#shared/schemas/vocabulary.ts";

/** The documents read with one schema each, by kind. */
const DOCUMENTS = {
	// A vault's files.
	manifest: ArchitectureManifestSchema,
	module: ArchitectureModuleSchema,
	flowCollection: FlowCollectionSchema,
	walkthrough: WalkthroughSchema,
	proposal: ProposalSchema,
	vaultConfiguration: VaultConfigurationSchema,
	installedMigration: InstalledMigrationSchema,
	// What the store keeps and carries beside them.
	portableBundle: ArchitecturePortableBundleSchema,
	portableInputPath: ArchitecturePortableBundleSchema.shape.inputs.element.shape.path,
	legacyMappingPlan: LegacyMappingPlanSchema,
	legacyOriginalInputs: LegacyOriginalInputsSchema,
	initializationRequest: ArchitectureInitializationRequestSchema,
	migrationRequest: ArchitectureMigrationRequestSchema,
	// A record's parts, read on their own.
	stateMetadata: StateMetadataSchema,
	newStateMetadata: StateMetadataSchema.omit({ id: true, formerNames: true }),
	selectedState: SelectedStateSchema,
	stateLineage: StateLineageSchema,
	correction: CorrectionSchema,
	lifecycle: LifecycleSchema,
	// Single values a caller checks before it trusts them.
	gitObjectId: GitObjectIdSchema,
	qualifiedSubjectId: QualifiedSubjectIdSchema,
	semanticId: SemanticIdSchema,
	stateSelection: StateSelectionSchema,
	flowChange: FlowChangeSchema,
	editChanges: ArchitectureModuleEditSchema.options[1].shape.changes,
	semanticPolicy: SemanticPolicySchema,
	layoutEngine: LayoutEngineSchema,
	diagramGrammar: DiagramGrammarSchema,
	paletteColor: PaletteColorSchema,
	edgeTraffic: EdgeTrafficSchema,
	// What a reader is handed.
	model: ArchitectureModelReadSchema.options[0],
	modelSnapshot: ModelSnapshotSchema,
	paneContext: SemanticPaneContextSchema,
	paneReading: ArchitecturePaneReadingSchema,
	renderReply: SemanticRenderReplySchema,
	panePresentRequest: PanePresentRequestSchema,
	...STORE_DOCUMENTS,
} as const;

/** The kinds read with one schema. */
type SchemaKind = keyof typeof DOCUMENTS;

/** The documents whose reading is more than one schema: the legacy board and a variant's content. */
interface CheckedDocuments {
	/** A legacy board: its shape, then the rules a shape cannot state. */
	readonly legacyBoard: { readonly data: LegacyBoard; readonly error: string };
	/** A legacy board file's text: decoded, migrated to the current version, then checked. */
	readonly legacyBoardFile: {
		readonly data: {
			readonly board: LegacyBoard;
			/** The migrated raw document, kept for persistence without parser defaults. */
			readonly value: unknown;
			readonly changed: boolean;
		};
		readonly error: string;
	};
	/** A variant's content: its shape, then the rules of what a variant may hold. */
	readonly variantContent: {
		readonly data: z.output<typeof VariantContentSchema>;
		readonly error: z.ZodError | readonly IntegrityIssue[];
	};
}

/** Every kind of document the contract reads. */
type DocumentKind = SchemaKind | keyof CheckedDocuments;

/** The data a document of a kind holds once read. */
type ModelDocument<K extends DocumentKind> = K extends SchemaKind
	? z.output<(typeof DOCUMENTS)[K]>
	: K extends keyof CheckedDocuments
		? CheckedDocuments[K]["data"]
		: never;

/** What a document of a kind may be written as before it is read: defaults still unfilled. */
type ModelDocumentInput<K extends SchemaKind> = z.input<(typeof DOCUMENTS)[K]>;

/** Why a document of a kind is not one. */
type DocumentError<K extends DocumentKind> = K extends keyof CheckedDocuments
	? CheckedDocuments[K]["error"]
	: z.ZodError;

/** A document read: its data, or why it is not one. */
type ParsedDocument<K extends DocumentKind> =
	| { readonly success: true; readonly data: ModelDocument<K> }
	| { readonly success: false; readonly error: DocumentError<K> };

/** How to read a document's object. */
interface DocumentOptions {
	/** "strip" drops the keys the kind does not know, where it would refuse them. */
	readonly extra?: "strip";
}

/** Each kind read with one schema, by the data it reads. */
const SCHEMAS: { readonly [K in SchemaKind]: z.ZodType<ModelDocument<K>> } = DOCUMENTS;

/** How each document whose reading is more than one schema is read. */
const CHECKED: { readonly [K in keyof CheckedDocuments]: (raw: unknown) => ParsedDocument<K> } = {
	/**
	 * A legacy board: its shape, then the rules a shape cannot state.
	 * @param raw The value.
	 * @returns The board, or why it is not one.
	 */
	legacyBoard: (raw) => {
		const parsed = parseLegacyBoard(raw);
		return parsed.ok
			? { success: true, data: parsed.board }
			: { success: false, error: parsed.problem };
	},
	/**
	 * A legacy board file's text: decoded, migrated, then checked.
	 * @param raw The file's text.
	 * @returns The board with its migrated raw document, or why it is not one.
	 */
	legacyBoardFile: (raw) => {
		const decoded = decodeLegacyBoard(String(raw));
		return decoded.ok
			? {
					success: true,
					data: { board: decoded.board, value: decoded.value, changed: decoded.changed },
				}
			: { success: false, error: decoded.problem };
	},
	/**
	 * A variant's content: its shape, then the rules of what a variant may hold.
	 * @param raw The value.
	 * @returns The content, or the shape's error or the issues of the rules.
	 */
	variantContent: (raw) => {
		const shape = VariantContentSchema.safeParse(raw);
		if (!shape.success) return shape;
		const issues = checkVariantContent(shape.data, "content");
		return issues.length === 0 ? shape : { success: false, error: issues };
	},
};

/**
 * Read an untrusted value as a document of one kind.
 * @param kind The kind of document.
 * @param raw The value: parsed JSON or YAML, or for `legacyBoardFile` the file's text.
 * @param options How to treat keys the kind does not know.
 * @returns The document, or why it is not one.
 */
function parseDocument<K extends DocumentKind>(
	kind: K,
	raw: unknown,
	options?: DocumentOptions,
): ParsedDocument<K>;
/**
 * Read an untrusted value as a document of one kind.
 * @param kind The kind of document.
 * @param raw The value.
 * @param options How to treat keys the kind does not know.
 * @returns The document, or why it is not one.
 */
function parseDocument(
	kind: DocumentKind,
	raw: unknown,
	options: DocumentOptions = {},
): ParsedDocument<DocumentKind> {
	if (isChecked(kind)) return CHECKED[kind](raw);
	const schema = SCHEMAS[kind];
	return schema.safeParse(options.extra === "strip" ? known(schema, raw) : raw);
}

/**
 * Whether a kind is read by more than one schema.
 * @param kind The kind.
 * @returns True for the legacy board, its file and a variant's content.
 */
function isChecked(kind: DocumentKind): kind is keyof CheckedDocuments {
	return Object.hasOwn(CHECKED, kind);
}

/**
 * A value without the top-level keys its object schema does not know, as `.strip()` reads it.
 * @param schema The kind's schema.
 * @param raw The value.
 * @returns The value with only the keys the schema knows, or the value itself.
 */
function known(schema: z.ZodType, raw: unknown): unknown {
	if (!(schema instanceof z.ZodObject) || typeof raw !== "object" || raw === null) return raw;
	const keys = new Set(Object.keys(schema.shape));
	return Object.fromEntries(Object.entries(raw).filter(([key]) => keys.has(key)));
}

export {
	parseDocument,
	type DocumentKind,
	type DocumentOptions,
	type ModelDocument,
	type ModelDocumentInput,
	type ParsedDocument,
};
