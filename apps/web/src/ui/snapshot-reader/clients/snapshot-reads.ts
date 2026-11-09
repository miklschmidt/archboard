// The snapshot page reads one file, and everything a picture needs comes from it: the model
// readings, the vault check, the code findings, which a snapshot has none of, and the icons, which
// the renderer starts with. Nothing is asked of an Archboard server.

import { queryOptions } from "@tanstack/react-query";
import { readRetainedFrom } from "#ui/architecture-drawing/canvas/picture/reads/clients/retained-reads.ts";
import {
	openedSnapshot,
	type ModelSnapshot,
	type OpenedSnapshot,
} from "#ui/snapshot-reader/rules/snapshot-file.ts";

/**
 * Open the snapshot file once, make every read of the page answer from it, and start the renderer
 * with its icons.
 * @param location The file.
 * @returns Query options for the opened snapshot, or why it was refused.
 */
function snapshotFileQuery(location: URL) {
	return queryOptions({
		queryKey: ["model-snapshot", location.href],
		/**
		 * Fetch and read the file.
		 * @param context The query's cancellation.
		 * @returns The opened snapshot, or why it was refused.
		 */
		queryFn: async (context): Promise<OpenedSnapshot> => {
			// The renderer is its own chunk, fetched while the file is read.
			const renderer = import("@archboard/renderer/browser");
			const opened = await fetchSnapshot(location, context.signal);
			if (opened.kind === "refused") return opened;
			readFromSnapshot(opened.snapshot);
			const { startBrowserRenderer } = await renderer;
			startBrowserRenderer({ icons: opened.snapshot.icons });
			return opened;
		},
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
	});
}

/**
 * Fetch a snapshot file and read it.
 * @param location The file.
 * @param signal Cancels the fetch.
 * @returns The snapshot, or why the page refuses it.
 * @throws {Error} When the read was cancelled.
 */
async function fetchSnapshot(location: URL, signal: AbortSignal): Promise<OpenedSnapshot> {
	const where = location.href;
	let response: Response;
	try {
		response = await fetch(location, { signal });
	} catch (error) {
		if (signal.aborted) throw error;
		return refused(`The snapshot at ${where} could not be reached. Check the address and retry.`);
	}
	if (!response.ok) {
		return refused(
			`The snapshot at ${where} could not be read: the host answered ${response.status}.`,
		);
	}
	try {
		return openedSnapshot(await response.json());
	} catch (error) {
		if (signal.aborted) throw error;
		return refused(
			`The file at ${where} is not JSON. Write a snapshot with archboard model snapshot.`,
		);
	}
}

/**
 * A refusal.
 * @param reason What to tell the reader.
 * @returns The refusal.
 */
function refused(reason: string): OpenedSnapshot {
	return { kind: "refused", reason };
}

/**
 * Answer the page's reads from a snapshot from now on.
 * @param snapshot The snapshot.
 */
function readFromSnapshot(snapshot: ModelSnapshot): void {
	readRetainedFrom({
		listing: noLegacyBoards,
		document: noLegacyBoards,
		/**
		 * The vault check that the snapshot carries.
		 * @returns Its policy and diagnostics.
		 */
		vaultCheck: async () => snapshot.check,
		/**
		 * No code findings: a snapshot carries no code pass.
		 * @returns No readings.
		 */
		codeFindings: async () => ({ readings: [] }),
	});
}

/**
 * A snapshot holds one model and no legacy boards.
 * @returns Never.
 * @throws {Error} Always.
 */
async function noLegacyBoards(): Promise<never> {
	throw new Error("A model snapshot holds no legacy boards.");
}

export { snapshotFileQuery };
