import { isDeepStrictEqual } from "node:util";
import type { z } from "zod";
import type { ArchitectureMigrationRequestSchema } from "#shared/schemas/migration-installation.ts";
import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { LegacyInventory } from "#shared/schemas/migration.ts";
import { readCapturedLegacyInventory } from "#runtime/operations/legacy-inventory/inventory.ts";
import { readMigrationPreview } from "#runtime/operations/legacy-inventory/preview.ts";
import { prepareMigrationCheckpoint } from "#runtime/operations/legacy-inventory/retain.ts";
import { migrationCandidate } from "#runtime/operations/legacy-inventory/install-candidate.ts";
import { requireModel } from "#runtime/operations/proposals/read.ts";
import { decodeModel } from "#runtime/operations/read/model-read.ts";
import { changedFiles } from "#runtime/operations/model-edit/candidate.ts";
import { subjectsOf } from "#runtime/operations/proposals/subjects.ts";
import { modelRevision } from "#runtime/store/model-files.ts";
import {
	migrationInstallationFiles,
	migrationContextFingerprint,
} from "#runtime/store/migration-installation.ts";
import {
	archiveTip,
	assertArchiveWritable,
	ArchiveError,
	archiveCommit,
	tree,
	CheckpointRecordSchema,
	captureOwnSource,
	type ArchiveContext,
} from "#runtime/store/model-archive.ts";
import { checkoutContext, operationRef, type ModelJournal } from "#runtime/store/model-state.ts";
type Request = z.infer<typeof ArchitectureMigrationRequestSchema>;
/**
 * Require a complete preview of only an unmigrated vault.
 * @param inventory Captured originals and choices.
 * @param preview The fresh composed reading.
 * @param request The authorized fingerprints.
 */
function requireComplete(
	inventory: LegacyInventory,
	preview: ArchitectureModel,
	request: Request,
): void {
	if (
		!isDeepStrictEqual(inventory.source, request.expectedSource) ||
		inventory.planRevision !== request.expectedPlan ||
		!isDeepStrictEqual(preview.revision, request.previewRevision)
	)
		throw new ArchiveError(
			"STALE_REVISION",
			"The complete preview fingerprints changed. Obtain a new preview.",
		);
	if (preview.migrationPreview!.readingDiagnostics!.length > 0)
		throw new ArchiveError(
			"MAPPING_UNRESOLVED",
			"Every converted current beat requires an explicit valid original view.",
		);
	if (
		preview.migrationPreview!.history!.some(
			(entry) => entry.state.lifecycle === "draft" && entry.conversion === undefined,
		)
	)
		throw new ArchiveError(
			"MAPPING_UNRESOLVED",
			"Map every original draft and its exact baseline before cutover.",
		);
}
/**
 * Refuse source, target, plan, policy, or checkout interference.
 * @param vault The addressed vault.
 * @param context Its archive owner.
 * @param request The authorized fingerprints.
 * @returns The complete stable before image.
 */
async function captureCutover(vault: string, context: ArchiveContext, request: Request) {
	const before = migrationInstallationFiles(vault);
	if (
		before.diagnostics.length > 0 ||
		!isDeepStrictEqual(before.revision, request.expectedRevision)
	)
		throw new ArchiveError(
			"STALE_REVISION",
			"Source, target paths, or mapping bytes changed after preview.",
		);
	if ((await migrationContextFingerprint(vault, context)) !== request.expectedContext)
		throw new ArchiveError(
			"RECOVERY_CONTEXT_CHANGED",
			"The addressed checkout changed after preview.",
		);
	if ([...before.inputs.keys()].some(isCanonicalTarget))
		throw new ArchiveError(
			"TARGET_CHANGED",
			"Canonical target inputs already exist. Preserve them and choose an unmigrated vault.",
		);
	return before;
}
/**
 * Identify authored target inputs that migration cannot replace.
 * @param path The normalized input path.
 * @returns Whether another canonical input already occupies the vault.
 */
function isCanonicalTarget(path: string): boolean {
	return (
		/^(?:model|migration)\.json$/u.test(path) ||
		/\.(?:module|flows|proposal|walkthrough)\.json$/u.test(path)
	);
}
/**
 * Prepare every signed dependency before creating the existing installation journal.
 * @param vault The addressed vault.
 * @param context Its archive owner.
 * @param parsed The exact authorized intent.
 * @returns A complete journal ready for the existing installer.
 */
async function prepareCutover(
	vault: string,
	context: ArchiveContext,
	parsed: Request,
): Promise<ModelJournal> {
	const before = await captureCutover(vault, context, parsed);
	const inventory = readCapturedLegacyInventory(vault, parsed.origin);
	if (!inventory.success) throw new ArchiveError("MAPPING_INVALID", inventory.error);
	const preview = requireModel(await readMigrationPreview(vault, parsed.origin));
	requireComplete(inventory, preview, parsed);
	await assertArchiveWritable(context);
	const checkout = await checkoutContext(context);
	const originals = await prepareMigrationCheckpoint(context, vault, {
		target: "migration",
		origin: parsed.origin,
		expectedPlan: parsed.expectedPlan,
		expectedRevision: parsed.expectedSource.digest,
		operationId: parsed.operationId,
		writer: parsed.writer,
		doing: parsed.doing,
		dependencies: [],
	});
	const {
		model: candidate,
		inputs,
		dependencies,
	} = await migrationCandidate(context, inventory, preview, originals, parsed);
	const after = modelRevision(inputs);
	requireModel(decodeModel({ inputs, revision: after, diagnostics: [] }));
	const subjects = [
		...new Set([
			...subjectsOf(candidate).keys(),
			...candidate.proposals.flatMap((proposal) =>
				proposal.changes.map((change) => change.subject),
			),
		]),
	];
	const request = {
		...parsed,
		type: "migrate" as const,
		target: { model: candidate.manifest.id, state: candidate.manifest.current?.id ?? null },
	};
	const record = CheckpointRecordSchema.parse({
		schemaVersion: 1,
		kind: "checkpoint",
		vault: context.vault,
		model: candidate.manifest.id,
		state: candidate.manifest.current,
		selection: candidate.selectedState,
		revision: after,
		createdAt: new Date().toISOString(),
		request: {
			target: "current",
			operationId: parsed.operationId,
			writer: parsed.writer,
			doing: parsed.doing,
			expectedRevision: before.revision.digest,
			dependencies,
		},
		installation: request,
		subjects,
		sources: await captureOwnSource(context),
		reconciliations: candidate.proposals.map((proposal) => ({
			state: proposal.id,
			standing: proposal.standing,
		})),
	});
	const retained = new Map([...inputs].map(([path, bytes]) => [`inputs/${path}`, bytes]));
	retained.set("record.json", Buffer.from(JSON.stringify(record)));
	const tip = await archiveTip(context);
	const checkpoint = await archiveCommit(
		context,
		await tree(context, retained),
		[...new Set([...(tip === undefined ? [] : [tip]), ...dependencies])],
		"archboard: install explicit vault migration",
	);
	if (!isDeepStrictEqual(migrationInstallationFiles(vault).revision, before.revision))
		throw new ArchiveError("STALE_REVISION", "Inputs changed during signed preparation.");
	return {
		schemaVersion: 1,
		context: checkout,
		request,
		subjects,
		before: before.revision,
		after,
		checkpoint,
		ref: operationRef(vault, parsed.operationId, "transactions"),
		phase: "prepared",
		files: changedFiles(before.inputs, inputs),
	};
}
export { prepareCutover };
