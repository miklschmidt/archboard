import type { ArchitectureRetainedModule } from "#shared/schemas/model.ts";
import { decodeModel } from "#runtime/operations/read/model-read.ts";
import { historyResult } from "#runtime/operations/history/result.ts";
import { modelRecords } from "#runtime/operations/history/states.ts";
import { readingArchive } from "#runtime/operations/proposals/read.ts";
import { readCheckpointInputs, type ArchiveContext } from "#runtime/store/model-archive.ts";

/**
 * Read a module from one checkpoint. Decoding its inputs is enough to know, and costs far less
 * than a complete reading, which proves the checkpoint's whole history as well.
 * @param context The addressed archive.
 * @param checkpoint The checkpoint.
 * @param selection The state it records.
 * @param module The module's qualified identity.
 * @returns The module, or undefined when this checkpoint does not hold it.
 */
async function moduleIn(
	context: ArchiveContext,
	checkpoint: string,
	selection: Parameters<typeof decodeModel>[1],
	module: string,
) {
	const reading = decodeModel(await readCheckpointInputs(context, checkpoint), selection);
	return reading.success ? reading.modules.find(({ id }) => id === module) : undefined;
}

/**
 * Find the newest retained canonical reading that still holds a module.
 * A model records only that an identity left, so the search reads the checkpoints in turn.
 * @param vault The addressed vault.
 * @param module The removed module's qualified identity.
 * @returns The checkpoint and the module's name, or null when no reading holds it.
 */
async function readRetainedModule(
	vault: string,
	module: string,
): Promise<ArchitectureRetainedModule> {
	return historyResult("ARCHIVE_UNREADABLE", async () => {
		const context = await readingArchive(vault);
		if (context === undefined) return { success: true as const, retained: null };
		const records = await modelRecords(context);
		const newestFirst = records
			.filter(({ record }) => record.migration === undefined)
			.toSorted((a, b) => b.record.createdAt.localeCompare(a.record.createdAt));
		for (const { id, record } of newestFirst) {
			// oxlint-disable-next-line no-await-in-loop -- newest first, and the first answer ends the search
			const held = await moduleIn(context, id, record.selection, module);
			if (held !== undefined)
				return {
					success: true as const,
					retained: { checkpoint: id, name: held.name, createdAt: record.createdAt },
				};
		}
		return { success: true as const, retained: null };
	});
}

export { readRetainedModule };
