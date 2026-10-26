import { isDeepStrictEqual } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic, unlinkDurably } from "@archboard/workspace/atomic-write";
import { git } from "@archboard/workspace/checkouts";
import { readModelFiles, modelRevision } from "#runtime/store/model-files.ts";
import {
	ArchiveError,
	readCheckpointInputs,
	readRecord,
	retainOperation,
	appendCheckpoint,
	archiveTip,
	type ArchiveContext,
} from "#runtime/store/model-archive.ts";
import {
	JournalSchema,
	readState,
	writeState,
	modelStatePath,
	requireCheckout,
	operationKey,
	operationRef,
	type ModelJournal,
} from "#runtime/store/model-state.ts";

/** Find foreign input values before any replay changes a file. */
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
		const value = current.get(path);
		if (value !== after.get(path) && (complete || value !== before.get(path)))
			throw new ArchiveError(
				"RECOVERY_CONFLICT",
				"An input matches neither the permitted before image nor the after image. Preserve the foreign content, then restore a logged image and retry recovery.",
				path,
			);
	}
}
/** Prove that a private journal still describes its retained signed checkpoint. */
async function requirePrepared(context: ArchiveContext, journal: ModelJournal): Promise<void> {
	const record = await readRecord(context, journal.checkpoint);
	if (
		record.kind !== "checkpoint" ||
		!isDeepStrictEqual(record.edit, journal.request) ||
		!isDeepStrictEqual(record.revision, journal.after)
	)
		throw new ArchiveError(
			"RECOVERY_CONFLICT",
			"The journal disagrees with its retained checkpoint. Preserve both and restore the original journal.",
		);
	const inputs = await readCheckpointInputs(context, journal.checkpoint);
	if (!isDeepStrictEqual(inputs.revision, journal.after))
		throw new ArchiveError(
			"RECOVERY_CONFLICT",
			"Retained inputs disagree with the installation fingerprint.",
		);
	for (const file of journal.files) {
		const before = file.before === null ? undefined : Buffer.from(file.before, "base64");
		const after = file.after === null ? undefined : Buffer.from(file.after, "base64");
		const beforeHash =
			before === undefined
				? undefined
				: modelRevision(new Map([[file.path, before]])).files[0]?.sha256;
		const afterHash =
			after === undefined
				? undefined
				: modelRevision(new Map([[file.path, after]])).files[0]?.sha256;
		if (
			beforeHash !== journal.before.files.find((value) => value.path === file.path)?.sha256 ||
			afterHash !== journal.after.files.find((value) => value.path === file.path)?.sha256 ||
			(after !== undefined && !after.equals(inputs.inputs.get(file.path) ?? Buffer.alloc(0)))
		)
			throw new ArchiveError(
				"RECOVERY_CONFLICT",
				"Journal images disagree with their fingerprints.",
				file.path,
			);
	}
}
/** Remove only recovery machinery after the recorded result becomes durable. */
async function cleanupInstallation(context: ArchiveContext, vault: string, journal: ModelJournal) {
	try {
		if ((await archiveTip(context, journal.ref)) !== undefined)
			await git(context.root, ["update-ref", "-d", journal.ref, journal.checkpoint]);
		if (existsSync(modelStatePath(vault, "transaction.json")))
			unlinkDurably(modelStatePath(vault, "transaction.json"));
		return { ...journal.result, cleanup: "complete" as const };
	} catch {
		return { ...journal.result, cleanup: "pending" as const };
	}
}
/** Finish one logged installation. Every Archboard current read blocks until completion. */
async function installJournal(
	context: ArchiveContext,
	vault: string,
	journal: ModelJournal,
	guard: () => void,
) {
	if (journal.phase === "completed") {
		await retainOperation(
			context,
			operationRef(vault, journal.request.operationId),
			journal.checkpoint,
		);
		writeState(vault, `outcome-${operationKey(journal.request.operationId)}.json`, journal);
		return cleanupInstallation(context, vault, journal);
	}
	await requireCheckout(context, journal.context);
	await requirePrepared(context, journal);
	requireImages(vault, journal);
	const retained = await retainOperation(context, journal.ref, journal.checkpoint);
	if (retained !== journal.checkpoint)
		throw new ArchiveError("RECOVERY_CONFLICT", "The transaction ref names another checkpoint.");
	guard();
	journal.phase = "installing";
	writeState(vault, "transaction.json", journal);
	for (const file of journal.files) {
		// oxlint-disable-next-line no-await-in-loop -- each file must retain the recorded checkout context
		await requireCheckout(context, journal.context);
		guard();
		// Recheck the complete set before each atomic file operation. External writers must remain quiescent.
		requireImages(vault, journal);
		const path = join(vault, file.path);
		const after = file.after === null ? undefined : Buffer.from(file.after, "base64");
		if (after === undefined) {
			if (existsSync(path)) unlinkDurably(path);
		} else if (!existsSync(path) || !readFileSync(path).equals(after)) writeFileAtomic(path, after);
	}
	await requireCheckout(context, journal.context);
	requireImages(vault, journal, true);
	journal.phase = "installed";
	writeState(vault, "transaction.json", journal);
	await appendCheckpoint(context, journal.checkpoint, await archiveTip(context));
	guard();
	await retainOperation(
		context,
		operationRef(vault, journal.request.operationId),
		journal.checkpoint,
	);
	journal.phase = "completed";
	writeState(vault, "transaction.json", journal);
	writeState(vault, `outcome-${operationKey(journal.request.operationId)}.json`, journal);
	return cleanupInstallation(context, vault, journal);
}
/** Read the one active journal, refusing malformed durable state. */
function activeJournal(vault: string) {
	return readState(vault, "transaction.json", JournalSchema);
}
export { installJournal, activeJournal, requireImages };
