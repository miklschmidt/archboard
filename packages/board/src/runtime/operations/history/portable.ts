import { subjectsOf } from "#runtime/operations/proposals/subjects.ts";
import { isDeepStrictEqual } from "node:util";
import type { z } from "zod";
import {
	ArchitectureImportRequestSchema,
	ArchitecturePortableBundleSchema,
	type PortableInstallationSchema,
	type InitializationInstallationSchema,
	type ArchitectureInitializationRequestSchema,
} from "#shared/schemas/model-portable.ts";
import { readArchitectureModel } from "#runtime/operations/read/model-read.ts";
import { readModelFiles } from "#runtime/store/model-files.ts";
import {
	archiveContext,
	archiveTip,
	ArchiveError,
	assertArchiveWritable,
	archiveCommit,
	tree,
	CheckpointRecordSchema,
	readRecord,
	type ArchiveContext,
} from "#runtime/store/model-archive.ts";
import {
	bundleDigest,
	portableInputs,
	requirePortableClosure,
	exportPortableHistory,
	withPortableArchive,
	importPortableObjects,
} from "#runtime/store/model-portable.ts";
import { historyResult, editResult } from "#runtime/operations/history/result.ts";
import {
	withModelLock,
	writeState,
	checkoutContext,
	operationRef,
	modelWriteFailure,
	modelBoundaryFailure,
	type ModelJournal,
} from "#runtime/store/model-state.ts";
import { activeJournal, installJournal } from "#runtime/store/model-install.ts";
import { notifyArchitecture } from "#runtime/store/model-news.ts";
import { StateMetadataSchema } from "#shared/schemas/model-definitions.ts";

/**
 * Export exact authored inputs and their complete architecture archive without retaining source files.
 * @param vault The explicitly addressed source vault.
 * @returns The portable envelope or structured refusal.
 */
async function exportArchitectureModel(vault: string) {
	return historyResult("ARCHIVE_WRITE_FAILED", async () => {
		const model = readArchitectureModel(vault);
		if (!model.success) return model;
		const captured = readModelFiles(vault);
		if (captured.diagnostics.length !== 0 || !isDeepStrictEqual(captured.revision, model.revision))
			throw new ArchiveError("STALE_REVISION", "Inputs changed before export capture.");
		const context = await archiveContext(vault);
		const history = await exportPortableHistory(context);
		const bundle = ArchitecturePortableBundleSchema.parse({
			format: "archboard-model",
			schemaVersion: 1,
			model: model.manifest.id,
			revision: model.revision,
			inputs: [...captured.inputs].map(([path, bytes]) => ({
				path,
				bytes: bytes.toString("base64"),
			})),
			history,
		});
		await requirePortableClosure(context, history.tips, model);
		const boundary = modelBoundaryFailure(vault);
		if (boundary !== undefined) return boundary;
		if (!isDeepStrictEqual(readModelFiles(vault).revision, model.revision))
			throw new ArchiveError(
				"STALE_REVISION",
				"Inputs changed during export. Keep external writers idle and retry.",
			);
		return { success: true as const, bundle };
	});
}
/**
 * Reject another intent under an existing installation identity.
 * @param expected The durable request.
 * @param request The requested installation.
 */
function requireSame(
	expected: unknown,
	request:
		| z.infer<typeof PortableInstallationSchema>
		| z.infer<typeof InitializationInstallationSchema>,
): void {
	if (!isDeepStrictEqual(expected, request))
		throw new ArchiveError(
			"OPERATION_REUSED",
			"This operation identity names another request. Retry its original intent or use a new identity.",
		);
}
/**
 * Reopen an interrupted or completed installation under its existing intent.
 * @param vault The explicit destination vault.
 * @param context Its existing archive.
 * @param request The normalized import intent.
 * @param guard The installation lease assertion.
 * @param notification Whether a fresh completion needs announcement.
 * @param notification.emit Whether completion needs announcement.
 * @returns The recorded receipt, or absence for a new import.
 */
async function previousInstallation(
	vault: string,
	context: ArchiveContext,
	request:
		| z.infer<typeof PortableInstallationSchema>
		| z.infer<typeof InitializationInstallationSchema>,
	guard: () => void,
	notification: { emit: boolean },
) {
	const pending = activeJournal(vault);
	if (pending !== undefined) {
		if (pending.request.operationId !== request.operationId)
			throw new ArchiveError(
				"RECOVERY_REQUIRED",
				"Finish the pending installation before importing another bundle.",
			);
		requireSame(pending.request, request);
		notification.emit = pending.phase !== "completed";
		return installJournal(context, vault, pending, guard);
	}
	const completed = await archiveTip(context, operationRef(vault, request.operationId));
	if (completed !== undefined) {
		const record = await readRecord(context, completed);
		requireSame(record.kind === "checkpoint" ? record.installation : undefined, request);
		if (record.kind !== "checkpoint")
			throw new ArchiveError("OPERATION_REUSED", "The operation identity names another record.");
		notification.emit = false;
		return editResult(completed, record);
	}
	return undefined;
}
/**
 * Require an empty, initialization-only, or byte-identical installation target.
 * @param before The destination inputs.
 * @param bundle The complete incoming model.
 * @param initialization The optional initialization intent.
 * @returns Whether installation can proceed without replacing foreign inputs.
 */
function destinationAllowsInstallation(
	before: ReturnType<typeof readModelFiles>,
	bundle: z.infer<typeof ArchitecturePortableBundleSchema>,
	initialization: unknown,
): boolean {
	if (before.inputs.size === 0) return true;
	if (
		initialization !== undefined &&
		[...before.inputs.keys()].every((path) => path === ".archboard/config.yaml")
	)
		return true;
	return isDeepStrictEqual(before.revision, bundle.revision);
}
/**
 * Import into an empty destination or restore history behind identical authored inputs.
 * @param vault The explicitly addressed destination vault.
 * @param input The portable envelope and complete destination token.
 * @param initialization The optional canonical initialization intent.
 * @returns The existing installation receipt or structured refusal.
 */
async function installArchitectureModel(
	vault: string,
	input: z.input<typeof ArchitectureImportRequestSchema>,
	initialization?: z.infer<typeof ArchitectureInitializationRequestSchema>,
) {
	const parsed = ArchitectureImportRequestSchema.parse(input);
	const { bundle, ...intent } = parsed;
	const notification = { emit: true };
	const result = await historyResult("MODEL_WRITE_FAILED", async () => {
		const { inputs, model } = portableInputs(bundle);
		const subjects = [
			...new Set([
				...subjectsOf(model).keys(),
				...model.proposals.flatMap((proposal) => proposal.changes.map((change) => change.subject)),
			]),
		];
		const target = { model: model.manifest.id, state: model.manifest.current?.id ?? null };
		const request =
			initialization === undefined
				? {
						...intent,
						type: "import" as const,
						bundleDigest: bundleDigest(bundle),
						target,
					}
				: {
						...initialization,
						type: "initialize" as const,
						expectedRevision: intent.expectedRevision,
						target: { model: model.manifest.id, state: null },
					};
		return withModelLock(vault, async (guard) => {
			const context = await archiveContext(vault);
			const previous = await previousInstallation(vault, context, request, guard, notification);
			if (previous !== undefined) return previous;
			const before = readModelFiles(vault);
			if (before.diagnostics.length !== 0)
				throw new ArchiveError(
					"MODEL_UNREADABLE",
					"Restore safe readable destination inputs before import.",
				);
			if (!isDeepStrictEqual(before.revision, request.expectedRevision))
				throw new ArchiveError(
					"STALE_REVISION",
					"Destination inputs differ from the complete expected revision.",
				);
			if (!destinationAllowsInstallation(before, bundle, initialization))
				throw new ArchiveError(
					"TARGET_CHANGED",
					"Import requires empty or byte-identical authored inputs. Preserve the destination and choose a fresh vault.",
				);
			await assertArchiveWritable(context);
			const checkout = await checkoutContext(context);
			return withPortableArchive(bundle, async (source) => {
				await importPortableObjects(source, context, bundle.history.tips);
				const tip = await archiveTip(context);
				const record = CheckpointRecordSchema.parse({
					schemaVersion: 1,
					kind: "checkpoint",
					vault: context.vault,
					model: bundle.model,
					state:
						model.manifest.current === null
							? null
							: StateMetadataSchema.strip().parse(model.manifest.current),
					selection: model.selectedState,
					revision: bundle.revision,
					createdAt: new Date().toISOString(),
					request: {
						target: "current",
						operationId: request.operationId,
						writer: request.writer,
						doing: request.doing,
						expectedRevision: before.revision.digest,
						dependencies: bundle.history.tips,
					},
					installation: request,
					subjects,
					sources: [],
				});
				const retained = new Map([...inputs].map(([path, bytes]) => [`inputs/${path}`, bytes]));
				retained.set("record.json", Buffer.from(JSON.stringify(record)));
				const checkpoint = await archiveCommit(
					context,
					await tree(context, retained),
					[...new Set([...(tip === undefined ? [] : [tip]), ...bundle.history.tips])],
					"archboard: import portable architecture",
				);
				if (!isDeepStrictEqual(readModelFiles(vault).revision, before.revision))
					throw new ArchiveError(
						"STALE_REVISION",
						"Destination inputs changed during signed preparation.",
					);
				const files = [...new Set([...before.inputs.keys(), ...inputs.keys()])]
					.toSorted()
					.filter((path) => !before.inputs.get(path)?.equals(inputs.get(path) ?? Buffer.alloc(0)))
					.map((path) => ({
						path,
						before: before.inputs.get(path)?.toString("base64") ?? null,
						after: inputs.get(path)?.toString("base64") ?? null,
					}));
				const journal: ModelJournal = {
					schemaVersion: 1,
					context: checkout,
					request,
					subjects,
					before: before.revision,
					after: bundle.revision,
					checkpoint,
					ref: operationRef(vault, request.operationId, "transactions"),
					phase: "prepared",
					files,
				};
				guard();
				writeState(vault, "transaction.json", journal);
				return installJournal(context, vault, journal, guard);
			});
		});
	});
	if (!result.success) return modelWriteFailure(vault, result, intent.operationId);
	if (notification.emit) notifyArchitecture(vault, result);
	return result;
}
/**
 * Import a portable model through the shared signed installation owner.
 * @param vault The destination vault.
 * @param input The portable request.
 * @returns The durable result or refusal.
 */
function importArchitectureModel(
	vault: string,
	input: z.input<typeof ArchitectureImportRequestSchema>,
) {
	return installArchitectureModel(vault, input);
}
export { exportArchitectureModel, importArchitectureModel, installArchitectureModel };
