// The answer shapes every canvas route shares, and the two request helpers
// every wrapper starts from.

import type { ServerElement } from "@/runtime/engine/types";

interface ApiResponse {
	success: boolean;
	element?: ServerElement;
	elements?: ServerElement[];
	message?: string;
	error?: string;
	count?: number;
}

/**
 * The board as one line: how many elements, the sha-256 of its note, and which
 * edit of that note this is. Comparing two of these is how an agent finds out
 * whether anything it did not do has happened, without reading the board
 * (TASK-075).
 *
 * The hash says whether the note is the same document; the version says which
 * of two documents is newer, and is what a writer sends back as
 * `--expect-version` to have its next write refused if the board has moved on
 * (TASK-091). Null on a board whose note carries no version archboard can read,
 * and on a board that has stopped saving, which wrote no note at all.
 */
interface BoardFingerprint {
	elements: number;
	note: string;
	version: number | null;
}

/**
 * What a write says about itself, whichever route it went through
 * (TASK-075). `element` is the one the caller named, where there was one;
 * `elements` is everything the write touched in the form the board now holds
 * it, side effects and all; `fingerprint` is the board in one line; `document`
 * is the whole board and is present only when it was asked for.
 */
interface WriteAnswer {
	element?: ServerElement;
	elements?: ServerElement[];
	fingerprint?: BoardFingerprint;
	document?: ServerElement[];
	alsoDeleted?: string[];
}

/** Ask a write for the whole board back. Off by default, everywhere. */
interface WriteOptions {
	document?: boolean;
}

/** The agent spelling accepted by the server's element-input entry. */
type ElementInput = Record<string, unknown>;

/**
 * A POST carrying a JSON body.
 * @param body What to send.
 * @returns The request options.
 */
function postingJson(body: unknown): RequestInit {
	return {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	};
}

export {
	type ApiResponse,
	type BoardFingerprint,
	type ElementInput,
	type WriteAnswer,
	type WriteOptions,
	postingJson,
};
