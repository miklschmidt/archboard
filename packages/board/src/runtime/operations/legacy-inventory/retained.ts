import type { z } from "zod";
import { LegacyOriginalInputsSchema } from "#shared/schemas/migration-inputs.ts";
import { createHash } from "node:crypto";
import type { ArchitectureModelRead, ModelDiagnostic } from "#shared/schemas/model.ts";
import { LegacyMappingPlanSchema } from "#shared/schemas/migration.ts";
import { DEFAULT_SEMANTIC_POLICY } from "#shared/schemas/semantic-policy.ts";
import { ArchiveError, type CheckpointRecordSchema } from "#runtime/store/model-archive.ts";
import { modelRevision, type readModelFiles } from "#runtime/store/model-files.ts";
import { MIGRATION_PLAN_PATH } from "#runtime/store/migration-plan.ts";
import { inventoryFromInputs } from "#runtime/operations/legacy-inventory/inventory.ts";
import { previewFromInventory } from "#runtime/operations/legacy-inventory/preview.ts";
import { previewCoverage } from "#runtime/operations/legacy-inventory/history.ts";
import { decodeLegacyInput } from "#runtime/operations/legacy-inventory/inputs.ts";
import { decodeModel, failure } from "#runtime/operations/read/model-read.ts";

type Record = z.infer<typeof CheckpointRecordSchema>;
type Captured = ReturnType<typeof readModelFiles>;
/**
 * Recover exact original bytes and independently prove source and plan fingerprints.
 * @param captured The immutable archive input set.
 * @param record Its retained migration metadata.
 * @returns Original files and the exact saved plan.
 */
function migrationInputs(captured: Captured, record: Record) {
	const migration = record.migration!;
	const original = LegacyOriginalInputsSchema.parse(
		JSON.parse(captured.inputs.get("migration-originals.json")!.toString()),
	);
	const inputs = new Map(original.map(({ file, base64 }) => [file, Buffer.from(base64, "base64")]));
	if (inputs.size !== original.length)
		throw new ArchiveError("CHECKPOINT_INVALID", "Retained originals repeat a path.");
	const planBytes = inputs.get(MIGRATION_PLAN_PATH);
	inputs.delete(MIGRATION_PLAN_PATH);
	const source = modelRevision(inputs);
	const planRevision =
		planBytes === undefined ? null : createHash("sha256").update(planBytes).digest("hex");
	if (source.digest !== migration.source.digest || planRevision !== migration.planRevision)
		throw new ArchiveError(
			"CHECKPOINT_INVALID",
			"Retained originals disagree with their source or mapping fingerprint.",
		);
	const plan =
		planBytes === undefined
			? undefined
			: LegacyMappingPlanSchema.parse(JSON.parse(planBytes.toString()));
	return { inputs, source, planRevision, plan, original };
}
/**
 * Preserve unsupported original bytes alongside every supported in-memory document.
 * @param inputs The exact original file set.
 * @param diagnostics Unsupported original records.
 * @returns Original documents with lossless evidence for unsupported byte sequences.
 */
function originalDocuments(inputs: Map<string, Buffer>, diagnostics: ModelDiagnostic[]) {
	return [...inputs]
		.filter(([file]) => file.endsWith(".semantic.json"))
		.map(([file, bytes]) => {
			try {
				return decodeLegacyInput(file, bytes, diagnostics);
			} catch {
				diagnostics.push({
					code: "LEGACY_INVALID",
					file,
					message: "The original bytes are not supported UTF-8.",
					recovery: "Inspect sourceBase64. Preserve the original before explicit repair.",
				});
				return { file, source: bytes.toString(), sourceBase64: bytes.toString("base64") };
			}
		});
}
/**
 * Assess captured originals through the existing inventory owner.
 * @param snapshot The proven original input set and saved choices.
 * @param record Its immutable migration metadata.
 * @param diagnostics Unsupported original document evidence.
 * @returns The original inventory when its documents can be interpreted.
 */
function retainedInventory(
	snapshot: ReturnType<typeof migrationInputs>,
	record: Record,
	diagnostics: ModelDiagnostic[],
) {
	if (diagnostics.length > 0) return undefined;
	return inventoryFromInputs(
		{ inputs: snapshot.inputs, revision: snapshot.source, diagnostics: [] },
		record.migration!.origin,
		{
			...(snapshot.plan === undefined ? {} : { plan: snapshot.plan }),
			revision: snapshot.planRevision,
		},
	);
}
/**
 * Keep unresolved originals inspectable without claiming a complete model or substituting modules.
 * @param captured The retained archive revision.
 * @param record The immutable migration metadata.
 * @param originals Every original document and byte sequence.
 * @param diagnostics Explicit reasons that canonical composition remains unavailable.
 * @returns An empty reading that carries complete original evidence.
 */
function originalsOnly(
	captured: Captured,
	record: Record,
	originals: ReturnType<typeof originalDocuments>,
	diagnostics: ModelDiagnostic[],
): ArchitectureModelRead {
	const migration = record.migration!;
	const model = decodeModel({
		inputs: new Map([
			[
				"model.json",
				Buffer.from(
					JSON.stringify({
						schemaVersion: 1,
						id: migration.origin,
						name: migration.origin,
						current: null,
					}),
				),
			],
			[".archboard/config.yaml", Buffer.from(Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY))],
		]),
		revision: captured.revision,
		diagnostics: [],
	});
	if (!model.success) return model;
	return {
		...model,
		migrationPreview: {
			origin: migration.origin,
			source: migration.source,
			planRevision: migration.planRevision,
			coverage: [],
			plannedBoards: [],
			originals,
			diagnostics,
		},
	};
}
/**
 * Explain why a retained original set cannot yet supply a canonical candidate.
 * @param diagnostics Existing source or planning diagnostics.
 * @returns The complete retained evidence and explicit conversion recovery.
 */
function unresolvedDiagnostics(diagnostics: ModelDiagnostic[]) {
	return [
		...diagnostics,
		{
			code: "MAPPING_UNRESOLVED",
			file: MIGRATION_PLAN_PATH,
			message: "This checkpoint retains original coverage without a complete canonical candidate.",
			recovery:
				"Inspect the originals. Save complete choices against live originals before another preview.",
		},
	];
}
/**
 * Capture the complete immutable evidence needed by one original reading.
 * @param captured Exact archive inputs.
 * @param record Their immutable checkpoint metadata.
 * @returns The original bytes, supported inventory, and explicit diagnostics.
 */
function migrationContext(captured: Captured, record: Record) {
	const snapshot = migrationInputs(captured, record),
		diagnostics: ModelDiagnostic[] = [];
	const originals = originalDocuments(snapshot.inputs, diagnostics);
	const inventory = retainedInventory(snapshot, record, diagnostics);
	return { captured, record, originals, inventory, diagnostics, original: snapshot.original };
}
type MigrationContext = ReturnType<typeof migrationContext>;
/**
 * Reopen immutable originals without consulting present-day source or plan files.
 * @param captured Exact archive inputs.
 * @param record Their immutable checkpoint metadata.
 * @param selector An optional qualified original state.
 * @returns Scoped architecture or an explicit originals-only reading.
 */
function retainedMigrationPreview(
	captured: Captured,
	record: Record,
	selector?: string,
): ArchitectureModelRead {
	const context = migrationContext(captured, record);
	const result = materializeOriginals(context, selector);
	return result.success
		? {
				...result,
				migrationPreview: { ...result.migrationPreview!, originalInputs: context.original },
			}
		: result;
}
/**
 * Distinguish a complete retained conversion plan from inspectable unresolved originals.
 * @param inventory The captured original inventory, when readable.
 * @returns Whether canonical composition has complete source and owner choices.
 */
function convertibleInventory(
	inventory: ReturnType<typeof retainedInventory>,
): inventory is Extract<NonNullable<ReturnType<typeof retainedInventory>>, { success: true }> {
	return (
		inventory?.success === true &&
		inventory.planRevision !== null &&
		inventory.diagnostics.length === 0 &&
		inventory.unresolved.length === 0
	);
}
/**
 * Materialize supported coverage while keeping failed conversions inspectable as originals.
 * @param context Complete original checkpoint evidence.
 * @param selector The optional explicit original state.
 * @returns Original coverage or diagnostic evidence without a fabricated model.
 */
function materializeOriginals(
	context: MigrationContext,
	selector: string | undefined,
): ArchitectureModelRead {
	const { inventory, diagnostics, originals } = context;
	if (convertibleInventory(inventory)) {
		const result = previewFromInventory(inventory, selector);
		if (result.success)
			return { ...result, migrationPreview: { ...result.migrationPreview!, originals } };
		if (selector !== undefined) return result;
		return unconvertedReading(context, result.diagnostics);
	}
	if (selector !== undefined)
		return failure("MAPPING_UNRESOLVED", unresolvedDiagnostics(diagnostics));
	return unconvertedReading(context, diagnostics);
}
/**
 * Preserve all original evidence when canonical conversion remains unavailable.
 * @param context The complete original checkpoint evidence.
 * @param diagnostics Unsupported source or conversion evidence.
 * @returns An explicitly empty canonical reading with retained originals.
 */
function unconvertedReading(
	context: MigrationContext,
	diagnostics: ModelDiagnostic[],
): ArchitectureModelRead {
	const { captured, record, originals, inventory } = context;
	const result = originalsOnly(
		captured,
		record,
		originals,
		unresolvedDiagnostics([...diagnostics, ...(inventory?.diagnostics ?? [])]),
	);
	if (result.success && inventory?.success)
		result.migrationPreview = { ...result.migrationPreview!, ...previewCoverage(inventory) };
	return result;
}
export { retainedMigrationPreview };
