import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { git } from "@archboard/process/git";
import { errnoCode } from "@archboard/diagnostics/errno";
import { logger } from "@archboard/diagnostics/logger";
import {
	ARCHIVE_REF,
	archiveContext,
	archiveTip,
	archiveRecords,
	ArchiveError,
} from "#runtime/store/model-archive.ts";
import { editResult } from "#runtime/operations/history/result.ts";
import type { Completion } from "#runtime/store/model-news.ts";

/**
 * Observe loose and packed archive refs without starting Git on an idle poll.
 * @param directory The archive's common Git directory.
 * @returns Its cheap replaceable observation token.
 */
function fingerprint(directory: string): string {
	let loose = "",
		packed = "";
	try {
		loose = readFileSync(join(directory, ARCHIVE_REF), "utf8");
	} catch (error) {
		if (errnoCode(error) !== "ENOENT") throw error;
	}
	try {
		const file = statSync(join(directory, "packed-refs"));
		packed = `${file.ino}:${file.size}:${file.mtimeMs}`;
	} catch (error) {
		if (errnoCode(error) !== "ENOENT") throw error;
	}
	return `${loose}:${packed}`;
}

/**
 * Locate the existing archive ref once for cheap subsequent observations.
 * @param vault The addressed vault.
 * @returns Its initial ref observation.
 */
async function openObservation(vault: string) {
	const context = await archiveContext(vault);
	const directory = await git(context.root, [
		"rev-parse",
		"--path-format=absolute",
		"--git-common-dir",
	]);
	if (directory === undefined) throw new Error("Git returned no archive directory.");
	const signature = fingerprint(directory);
	return { context, directory, signature, tip: await archiveTip(context) };
}

/**
 * Read only records newly reachable after a real archive ref change.
 * @param observation The previous ref observation.
 * @returns The newly retained records.
 */
async function advanceObservation(observation: Awaited<ReturnType<typeof openObservation>>) {
	const tip = await archiveTip(observation.context);
	const roots =
		tip === undefined
			? []
			: [tip, ...(observation.tip === undefined ? [] : [`^${observation.tip}`])];
	const records = tip === observation.tip ? [] : await archiveRecords(observation.context, roots);
	observation.tip = tip;
	return records;
}

/**
 * Select accepted operations belonging to the addressed vault only.
 * @param records The newly retained archive records.
 * @param vault The archive's relative vault identity.
 * @returns Their durable completion receipts.
 */
function completions(records: Awaited<ReturnType<typeof archiveRecords>>, vault: string) {
	return records.flatMap(({ id, record }) => {
		if (record.kind !== "checkpoint") return [];
		if (record.vault !== vault) return [];
		if (record.edit === undefined) return [];
		return [editResult(id, record)];
	});
}

/**
 * Observe accepted retained operations from other processes through the same archive owner.
 * @param vault The explicitly addressed vault.
 * @param listener The consumer of durable operation metadata.
 * @returns Nonoverlapping polling and cancellation for the existing observation cadence.
 */
function observeArchitectureHistory(vault: string, listener: (completion: Completion) => void) {
	let observation: Awaited<ReturnType<typeof openObservation>> | undefined;
	let stopped = false,
		pending = false;
	/** Observe one ref change and only the newly retained records of this vault. */
	async function observe(): Promise<void> {
		if (observation === undefined) {
			observation = await openObservation(vault);
			return;
		}
		const signature = fingerprint(observation.directory);
		if (signature === observation.signature) return;
		const records = await advanceObservation(observation);
		observation.signature = signature;
		if (stopped) return;
		for (const completion of completions(records.toReversed(), observation.context.vault))
			listener(completion);
	}
	return {
		/** Start at most one observation while the previous Git read finishes. */
		poll(): void {
			if (stopped || pending) return;
			pending = true;
			void observe()
				.catch((error: unknown) => {
					if (
						!stopped &&
						!(error instanceof ArchiveError && error.code === "ARCHIVE_NOT_INITIALIZED")
					)
						logger.warn("Architecture history observation failed.", { error });
				})
				.finally(() => {
					pending = false;
				});
		},
		/** Stop delivery without canceling another owner's Git work. */
		stop(): void {
			stopped = true;
		},
	};
}

export { observeArchitectureHistory };
