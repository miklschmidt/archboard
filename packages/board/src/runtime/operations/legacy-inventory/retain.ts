import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ArchitectureCheckpointRequest } from "#shared/schemas/model.ts";
import { readModelFiles, modelRevision } from "#runtime/store/model-files.ts";
import { readMigrationPlan, MIGRATION_PLAN_PATH } from "#runtime/store/migration-plan.ts";
import {
	ArchiveError,
	CheckpointRecordSchema,
	archiveTip,
	tree,
	archiveCommit,
	captureOwnSource,
	type ArchiveContext,
} from "#runtime/store/model-archive.ts";

/**
 * Capture original files and the independently fingerprinted mapping choices.
 * @param vault The explicitly addressed legacy vault.
 * @param origin The retained import namespace.
 * @returns A stable source and planning snapshot without interpreting legacy meaning.
 */
function migrationSnapshot(vault: string, origin: string) {
	const source = readModelFiles(vault),
		plan = readMigrationPlan(vault, origin);
	if (
		source.diagnostics.length > 0 ||
		![...source.inputs.keys()].some((file) => file.endsWith(".semantic.json"))
	)
		throw new ArchiveError(
			"MODEL_INVALID",
			"Restore readable original legacy input files before retention.",
		);
	if (plan.problem !== undefined) throw new ArchiveError("MAPPING_INVALID", plan.problem);
	const originals = new Map(source.inputs);
	if (plan.plan !== undefined)
		originals.set(MIGRATION_PLAN_PATH, readFileSync(join(vault, MIGRATION_PLAN_PATH)));
	return { source, plan, originals };
}
/**
 * Require both exact revisions before a checkpoint can become durably retained.
 * @param snapshot The captured original input set.
 * @param expectedRevision The original source fingerprint.
 * @param expectedPlan The independently captured planning fingerprint.
 */
function requireSnapshot(
	snapshot: ReturnType<typeof migrationSnapshot>,
	expectedRevision: string,
	expectedPlan: string | null,
): void {
	if (
		snapshot.source.revision.digest !== expectedRevision ||
		snapshot.plan.revision !== expectedPlan
	)
		throw new ArchiveError(
			"STALE_REVISION",
			"Original source or mapping choices changed. Read them again before a new retention intent.",
		);
}
/**
 * Retain exact original bytes even when their meaning remains unresolved.
 * @param context The existing archive owner.
 * @param vault The explicitly addressed legacy vault.
 * @param request The exact source and plan retention intent.
 * @returns One prepared checkpoint through the existing signer.
 */
async function prepareMigrationCheckpoint(
	context: ArchiveContext,
	vault: string,
	request: ArchitectureCheckpointRequest,
) {
	const { origin, expectedPlan } = request;
	if (origin === undefined || expectedPlan === undefined)
		throw new ArchiveError(
			"MODEL_INVALID",
			"Migration retention requires origin and expectedPlan.",
		);
	const snapshot = migrationSnapshot(vault, origin);
	requireSnapshot(snapshot, request.expectedRevision, expectedPlan);
	const inputs = new Map([
		[
			"migration-originals.json",
			Buffer.from(
				JSON.stringify(
					[...snapshot.originals].map(([file, bytes]) => ({
						file,
						base64: bytes.toString("base64"),
					})),
				),
			),
		],
	]);
	const record = CheckpointRecordSchema.parse({
		schemaVersion: 1,
		kind: "checkpoint",
		vault: context.vault,
		model: origin,
		state: { id: origin, name: "Original legacy documents" },
		selection: null,
		revision: modelRevision(inputs),
		createdAt: new Date().toISOString(),
		request,
		migration: { origin, source: snapshot.source.revision, planRevision: expectedPlan },
		sources: await captureOwnSource(context),
	});
	const retained = new Map([...inputs].map(([file, bytes]) => [`inputs/${file}`, bytes]));
	retained.set("record.json", Buffer.from(JSON.stringify(record)));
	const checkpoint = await archiveCommit(
		context,
		await tree(context, retained),
		[
			...new Set(
				[await archiveTip(context), ...request.dependencies].filter(
					(id): id is string => id !== undefined,
				),
			),
		],
		"archboard: retain original migration inputs",
	);
	requireSnapshot(migrationSnapshot(vault, origin), request.expectedRevision, expectedPlan);
	return checkpoint;
}
export { prepareMigrationCheckpoint };
