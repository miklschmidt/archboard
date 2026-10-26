import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic, unlinkDurably } from "@archboard/workspace/atomic-write";
import { git } from "@archboard/process/git";
import { editResult } from "#runtime/operations/history/result.ts";
import { readModelFiles } from "#runtime/store/model-files.ts";
import {
	ArchiveError,
	readCheckpointInputs,
	readRecord,
	retainOperation,
	prepareCheckpointAppend,
	commitCheckpointAppend,
	archiveTip,
	type ArchiveContext,
} from "#runtime/store/model-archive.ts";
import {
	JournalSchema,
	readState,
	writeState,
	modelStatePath,
	requireCheckout,
	operationRef,
	type ModelJournal,
} from "#runtime/store/model-state.ts";
type FileImage = ModelJournal["files"][number];

/**
 * Find foreign input values before any replay changes a file.
 * @param vault The explicitly addressed vault.
 * @param journal The durable installation record.
 * @param complete Whether every input must match its final image.
 */
function requireImages(vault: string, journal: ModelJournal, complete = false): void {
	const captured = readModelFiles(vault);
	if (captured.diagnostics.length !== 0)
		throw new ArchiveError(
			"RECOVERY_CONFLICT",
			"An unreadable or unsafe input blocks installation. Preserve it before recovery.",
		);
	const before = new Map(journal.before.files.map((file) => [file.path, file.sha256]));
	const after = new Map(journal.after.files.map((file) => [file.path, file.sha256]));
	const current = new Map(captured.revision.files.map((file) => [file.path, file.sha256]));
	for (const path of new Set([...before.keys(), ...after.keys(), ...current.keys()])) {
		const permitted = complete ? [after.get(path)] : [before.get(path), after.get(path)];
		if (!permitted.includes(current.get(path)))
			throw new ArchiveError(
				"RECOVERY_CONFLICT",
				"An input matches neither the permitted before image nor the after image. Preserve the foreign content, then restore a logged image and retry recovery.",
				path,
			);
	}
}
/**
 * Fingerprint a logged image, preserving an absent path as absence.
 * @param encoded The logged base64 image, or absent path.
 * @returns The image digest, or absence.
 */
function imageHash(encoded: string | null): string | undefined {
	return encoded === null
		? undefined
		: createHash("sha256").update(Buffer.from(encoded, "base64")).digest("hex");
}
/**
 * Compare logged bytes with the signed before token and exact retained after image.
 * @param file The normalized file path or logged image.
 * @param before The exact original read token.
 * @param inputs The retained architecture bytes.
 */
function requireFileImage(
	file: FileImage,
	before: Map<string, string>,
	inputs: Map<string, string>,
): void {
	const original = before.get(file.path);
	if (!before.has(file.path) && !inputs.has(file.path))
		throw new ArchiveError(
			"RECOVERY_CONFLICT",
			"A journal operation names no retained input.",
			file.path,
		);
	if (imageHash(file.before) !== original || file.after !== (inputs.get(file.path) ?? null))
		throw new ArchiveError(
			"RECOVERY_CONFLICT",
			"Journal images disagree with their retained fingerprints.",
			file.path,
		);
}
/**
 * Prove that private recovery data describes its immutable signed checkpoint.
 * @param context The caller checkout or invocation context.
 * @param journal The durable installation record.
 * @returns The matching signed checkpoint record.
 */
async function requirePrepared(context: ArchiveContext, journal: ModelJournal) {
	const record = await readRecord(context, journal.checkpoint);
	if (record.kind !== "checkpoint")
		throw new ArchiveError("RECOVERY_CONFLICT", "The journal names no architecture checkpoint.");
	const expected = {
		vault: context.vault,
		edit: journal.request,
		revision: journal.after,
		subjects: journal.subjects,
	};
	if (
		!isDeepStrictEqual(
			{
				vault: record.vault,
				edit: record.edit,
				revision: record.revision,
				subjects: record.subjects,
			},
			expected,
		) ||
		!isDeepStrictEqual(journal.before, journal.request.expectedRevision)
	)
		throw new ArchiveError(
			"RECOVERY_CONFLICT",
			"The journal disagrees with its signed operation. Preserve both and restore the original journal.",
		);
	const inputs = await readCheckpointInputs(context, journal.checkpoint);
	if (!isDeepStrictEqual(inputs.revision, journal.after))
		throw new ArchiveError(
			"RECOVERY_CONFLICT",
			"Retained inputs disagree with the installation fingerprint.",
		);
	const before = new Map(journal.before.files.map((file) => [file.path, file.sha256]));
	const after = new Map(
		[...inputs.inputs].map(([path, bytes]) => [path, bytes.toString("base64")]),
	);
	for (const file of journal.files) requireFileImage(file, before, after);
	return record;
}
/**
 * Retain only the checkpoint that this journal prepared.
 * @param context The caller checkout or invocation context.
 * @param ref The private retention ref.
 * @param checkpoint The prepared checkpoint identity.
 */
async function retainJournal(
	context: ArchiveContext,
	ref: string,
	checkpoint: string,
): Promise<void> {
	if ((await retainOperation(context, ref, checkpoint)) !== checkpoint)
		throw new ArchiveError("RECOVERY_CONFLICT", "A transaction ref names another checkpoint.");
}
/**
 * Remove only recovery machinery after the signed result becomes durable.
 * @param context The caller checkout or invocation context.
 * @param vault The explicitly addressed vault.
 * @param journal The durable installation record.
 * @param result The result derived from the signed record.
 * @returns The applied result and remaining cleanup status.
 */
async function cleanupInstallation(
	context: ArchiveContext,
	vault: string,
	journal: ModelJournal,
	result: ReturnType<typeof editResult>,
) {
	try {
		if ((await archiveTip(context, journal.ref)) !== undefined)
			await git(context.root, ["update-ref", "-d", journal.ref, journal.checkpoint]);
		if (existsSync(modelStatePath(vault, "transaction.json")))
			unlinkDurably(modelStatePath(vault, "transaction.json"));
		return { ...result, cleanup: "complete" as const };
	} catch {
		return { ...result, cleanup: "pending" as const };
	}
}
/**
 * Install one exact image after the caller rechecks the complete discovered file set.
 * @param vault The explicitly addressed vault.
 * @param file The normalized file path or logged image.
 */
function installFile(vault: string, file: FileImage): void {
	const path = join(vault, file.path);
	if (file.after === null) {
		if (existsSync(path)) unlinkDurably(path);
		return;
	}
	const bytes = Buffer.from(file.after, "base64");
	if (!existsSync(path) || !readFileSync(path).equals(bytes)) writeFileAtomic(path, bytes);
}
/**
 * Record durable progress without treating a failed record write as completion.
 * @param vault The explicitly addressed vault.
 * @param journal The durable installation record.
 * @param next The durable progress phase.
 */
function phase(vault: string, journal: ModelJournal, next: ModelJournal["phase"]): void {
	writeState(vault, "transaction.json", { ...journal, phase: next });
	journal.phase = next;
}
/**
 * Finish one logged installation while all current readers pass its recovery boundary.
 * @param context The caller checkout or invocation context.
 * @param vault The explicitly addressed vault.
 * @param journal The durable installation record.
 * @param guard The installation lease ownership assertion.
 * @returns The durable completed result.
 */
async function installJournal(
	context: ArchiveContext,
	vault: string,
	journal: ModelJournal,
	guard: () => void,
) {
	const record = await requirePrepared(context, journal);
	const result = editResult(journal.checkpoint, record);
	if (journal.phase === "completed") {
		await retainJournal(
			context,
			operationRef(vault, journal.request.operationId),
			journal.checkpoint,
		);
		return cleanupInstallation(context, vault, journal, result);
	}
	await requireCheckout(context, journal.context);
	requireImages(vault, journal);
	await retainJournal(context, journal.ref, journal.checkpoint);
	const append = await prepareCheckpointAppend(context, journal.checkpoint);
	guard();
	phase(vault, journal, "installing");
	for (const file of journal.files) {
		// oxlint-disable-next-line no-await-in-loop -- each file retains the recorded checkout context
		await requireCheckout(context, journal.context);
		guard();
		requireImages(vault, journal);
		installFile(vault, file);
	}
	await requireCheckout(context, journal.context);
	requireImages(vault, journal, true);
	phase(vault, journal, "installed");
	await commitCheckpointAppend(context, append);
	guard();
	await retainJournal(
		context,
		operationRef(vault, journal.request.operationId),
		journal.checkpoint,
	);
	phase(vault, journal, "completed");
	return cleanupInstallation(context, vault, journal, result);
}
/**
 * Read the one journal without hiding malformed recovery state.
 * @param vault The explicitly addressed vault.
 * @returns The pending journal, or absence.
 */
function activeJournal(vault: string) {
	return readState(vault, "transaction.json", JournalSchema);
}
export { installJournal, activeJournal };
