// What a reading of the history lens admits (ADR 0045): the board a request
// names, read from its vault, or the refusal that says why the reading reads
// nothing. Which variants each reading reads is its own rule, in
// `footprint-reading.ts` and `locality-reading.ts`.

import { readSemanticBoard } from "@archboard/board/store-read";
import type { SemanticBoard } from "@archboard/board/document";
import type { HistoryRefusalCode } from "#shared/protocol/history-refusal.ts";

/** The code of a board the store could not read. */
type BoardReadCode = Extract<ReturnType<typeof readSemanticBoard>, { ok: false }>["code"];

/** Why a reading reads nothing: a code the caller maps, and what happened and what to do next. */
interface HistoryRefusal {
	readonly ok: false;
	readonly code: HistoryRefusalCode | BoardReadCode;
	readonly problem: string;
}

/** What a reading answers: its answer, or why it reads nothing. */
type HistoryReading<Answer> = { readonly ok: true; readonly answer: Answer } | HistoryRefusal;

/**
 * Refuse a reading.
 * @param code The code the caller maps.
 * @param problem What happened and what to do next.
 * @returns The refusal.
 */
function refused(code: HistoryRefusalCode, problem: string): HistoryRefusal {
	return { ok: false, code, problem };
}

/**
 * The board a request names, as the store reads it from the vault.
 * @param vault The vault directory.
 * @param name The board's name as the caller wrote it.
 * @returns The board, or why it cannot be read.
 */
function namedBoard(vault: string, name: string): SemanticBoard | HistoryRefusal {
	const read = readSemanticBoard(vault, name);
	return read.ok ? read.board : { ok: false, code: read.code, problem: read.problem };
}

/**
 * Whether a step of an admission refused.
 * @param value What the step answered.
 * @returns True for a refusal.
 */
function isRefusal(value: object | undefined): value is HistoryRefusal {
	return value !== undefined && "ok" in value && value.ok === false;
}

export { type HistoryReading, type HistoryRefusal, isRefusal, namedBoard, refused };
