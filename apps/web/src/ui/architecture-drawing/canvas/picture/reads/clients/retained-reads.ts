// Retained documents come from an explicit capture. Live panes read only canonical models.

import type { RememberedFindings } from "@archboard/code-intel/code-check";
import {
	fetchCodeFindings,
	ReadingError,
	type RetainedListing,
	fetchVaultCheck,
} from "#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts";
import type { VaultCheckSchema } from "@archboard/model/policy";
import type { z } from "zod";

type VaultCheck = z.infer<typeof VaultCheckSchema>;

/** Where models are read from. */
interface RetainedReads {
	/** List only the original documents supplied by the capture. */
	readonly listing: (vault: string, signal?: AbortSignal) => Promise<RetainedListing>;
	/**
	 * One legacy board's whole document.
	 * @param vault The vault the legacy board is in.
	 * @param model The legacy board, by name.
	 * @param signal Cancels the read.
	 * @returns The document, not yet checked.
	 */
	readonly document: (vault: string, model: string, signal?: AbortSignal) => Promise<unknown>;
	/**
	 * The vault's checked policy and diagnostics.
	 * @param vault The vault.
	 * @param signal Cancels the read.
	 * @returns The check.
	 */
	readonly vaultCheck: (vault: string, signal?: AbortSignal) => Promise<VaultCheck>;
	/**
	 * What the last code pass found on each model it read. Never a pass.
	 * @param vault The vault.
	 * @param signal Cancels the read.
	 * @returns The remembered readings.
	 */
	readonly codeFindings: (vault: string, signal?: AbortSignal) => Promise<RememberedFindings>;
}

/**
 * Retained documents require a capture supplied by replay.
 * @returns An explicit refusal without a live model request.
 * @throws {ReadingError} When no retained provider is installed.
 */
async function captureRequired(): Promise<never> {
	throw new ReadingError(
		"MODEL_UNREADABLE",
		"Open an exact retained recording to read original legacy board content.",
	);
}

const liveEvidence: RetainedReads = {
	document: captureRequired,
	listing: captureRequired,
	vaultCheck: fetchVaultCheck,
	codeFindings: fetchCodeFindings,
};

let current: RetainedReads = liveEvidence;

/**
 * Where models are read from now.
 * @returns The reads.
 */
function retainedReads(): RetainedReads {
	return current;
}

/**
 * Read models from somewhere else from now on.
 * @param reads Where.
 */
function readRetainedFrom(reads: RetainedReads): void {
	current = reads;
}

export { retainedReads, readRetainedFrom, type RetainedReads };
