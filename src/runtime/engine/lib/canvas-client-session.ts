// What one invocation of the CLI says about itself, and what it has been
// told: which board it is addressed to, what it is doing to that board, and
// which version of the board it last heard about.
//
// One-shot state. The canvas imports this file and reads none of it; the CLI
// process that reads it is one command long.

import {
	expectedVersion,
	forgetRememberedVersions,
	rememberVersion as rememberBoardVersion,
} from "@/runtime/engine/board-version";
import type { HoldReport } from "@/runtime/engine/board-hold";
import { isBoardRefusal } from "@/runtime/engine/lib/canvas-client-refusal";
import { isRecord } from "@/runtime/engine/lib/unknown-record";

// ---- Which board this invocation is talking about ----
//
// Set once, from something the caller typed: `--board <key>` on the command
// line. It is deliberately NOT read from
// the environment and NOT remembered between invocations — a board that comes
// from somewhere the caller cannot see is the whole problem (ADR 0009). The
// canvas refuses a request that carries no board, so leaving this unset does
// not silently pick one; it produces a refusal that says what to pass.
let requestedBoard: string | null = null;

/**
 * Name the board every request from this invocation is addressed to.
 * @param key The board key the caller typed, or null to address none.
 */
function setRequestedBoard(key: string | null): void {
	requestedBoard = key?.trim() || null;
}

/**
 * The board this invocation is addressed to.
 * @returns The board key, or null when the caller named none.
 */
function currentRequestedBoard(): string | null {
	return requestedBoard;
}

/**
 * Add one query parameter to a path, whether or not it already has a query.
 * @param path The request path.
 * @param key The parameter's name.
 * @param value Its value.
 * @returns The path with the parameter appended.
 */
function addQuery(path: string, key: string, value: string | number): string {
	return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

/**
 * Attach the board to a request path, unless the caller already named one.
 * @param path The request path.
 * @returns The path naming a board, where this invocation has one.
 */
function withBoard(path: string): string {
	if (!requestedBoard || /[?&]board=/.test(path)) {
		return path;
	}
	return addQuery(path, "board", requestedBoard);
}

// ---- Whether the board this invocation touched is being saved ----
//
// The canvas puts a `held` block on every answer about a board that has stopped
// saving (ADR 0006, TASK-079), and it is worth saying whatever the command was:
// an agent that draws on a held board is drawing into a copy that lives in the
// canvas process and in no note. Kept here, next to the request that saw it, so
// that the CLI adds it to its answer in one place rather than in forty.
// One-shot process, so it lasts exactly one command.
let heldBoard: HoldReport | null = null;

/**
 * Whether an answer this invocation saw said its board had stopped saving.
 * @returns The hold, or null when nothing said so.
 */
function boardHoldSeen(): HoldReport | null {
	return heldBoard;
}

/**
 * Read the hold off one answer, refusals included, because the answer that
 * most needs it is the one refusing the write that stopped the board saving.
 * @param data The answer body.
 */
function noteHold(data: unknown): void {
	if (!isRecord(data)) {
		return;
	}
	const held = data["held"];
	heldBoard = isRecord(held) ? asHoldReport(held) : null;
}

/**
 * One `held` block as the report the CLI prints. The canvas owns the shape;
 * this is the boundary that names it.
 * @param held The block as it arrived.
 * @returns The report.
 */
function asHoldReport(held: Record<string, unknown>): HoldReport {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the canvas's own answer shape, named at the wire boundary
	return held as unknown as HoldReport;
}

// ---- What this invocation is doing to the board ----
//
// Set once, from `--doing` on the command line, and attached to every request
// that could change a board — the
// same shape as the board above, and for the same reason. An agent must say
// what it is doing on every write (TASK-095), and a requirement threaded
// through forty call sites is a requirement one of them will get away with
// not meeting.
//
// A query parameter rather than a field in the body: DELETE has no body, and a
// line that rode inside an element's JSON would be one careless spread away
// from being written into the note, which is the one thing this must never be.
let writeDoing: string | null = null;

/**
 * Say what this invocation is doing to the board.
 * @param doing The line the caller typed, or null.
 */
function setWriteDoing(doing: string | null): void {
	writeDoing = doing?.trim() || null;
}

/**
 * What this invocation says it is doing.
 * @returns The line, or null when the caller said nothing.
 */
function currentWriteDoing(): string | null {
	return writeDoing;
}

// ---- And which version of each board this process was last told ----
//
// A write is checked against the version its writer was working from
// (TASK-091), and the writer must not have to remember it: a number an agent
// threads from one command's output into the next is a number it drops. So the
// number comes from the last thing the canvas said about that board, and this
// is where a client that lives long enough to have heard it keeps it.
//
// The CLI uses this inside one invocation, which is worth having
// where a command makes several writes — `import` clears a board and then
// batches a scene into it — and gets nothing across two, because a fresh
// process has heard nothing. On the canvas's side a claim is the identity that
// covers that gap; its remembered version lives in board-version.ts too.
//
// `--expect-version` is the override, for a
// writer that knows something this map does not. Explicit beats remembered.
let statedVersion: number | null | undefined;

/**
 * Override the version this invocation writes against.
 * @param version The version the caller stated, or null for a board with no note.
 */
function setExpectedVersion(version: number | null): void {
	statedVersion = version === null || Number.isNaN(version) ? undefined : version;
}

/**
 * What this process would send: what it was told, unless the caller overrode it.
 * @returns The version, null for a board with no note, or undefined when it has heard nothing.
 */
function currentExpectedVersion(): number | null | undefined {
	return expectedVersion({
		...(statedVersion === undefined ? {} : { stated: statedVersion }),
		...(requestedBoard ? { rememberedBy: clientVersionWriter(requestedBoard) } : {}),
	});
}

/**
 * Forget what this process has been told. For a check that wants a fresh caller.
 */
function forgetVersionsSeen(): void {
	forgetRememberedVersions("client:");
	statedVersion = undefined;
}

/**
 * The name this client remembers one board's version under.
 * @param board The board key.
 * @returns The writer name.
 */
function clientVersionWriter(board: string): string {
	return `client:${board.toLowerCase()}`;
}

/**
 * Whether an answer's `board` names the board the request was addressed to.
 * @param answered The board the answer names.
 * @returns True when they are the same board.
 */
function sameBoard(answered: unknown): boolean {
	return (
		typeof answered === "string" &&
		!!requestedBoard &&
		answered.toLowerCase() === requestedBoard.toLowerCase()
	);
}

/**
 * A board version out of one object, where it carries one.
 * @param from The object.
 * @param key Which field holds it.
 * @returns The version, null for a board with no note, undefined when it says nothing.
 */
function readVersion(from: unknown, key = "version"): number | null | undefined {
	if (!isRecord(from)) {
		return undefined;
	}
	const value = from[key];
	if (typeof value === "number" && Number.isInteger(value)) {
		return value;
	}
	return value === null ? null : undefined;
}

/**
 * The version an answer states about the board this request named.
 *
 * A fingerprint, a version conflict and a write-boundary refusal are always
 * about the board the request named. Another bare `version` is not: `board
 * save --as other` answers about the note it wrote, which is a different
 * board from the one the call was addressed to. So an ordinary answer's
 * version is taken only when it names the board that was asked for.
 * @param body The answer body.
 * @returns The version, or undefined when the answer states none about this board.
 */
function statedVersionIn(body: Record<string, unknown>): number | null | undefined {
	return (
		readVersion(body["fingerprint"]) ??
		(isBoardRefusal(body) ? readVersion(body) : undefined) ??
		readVersion(body["versionConflict"], "actual") ??
		(sameBoard(body["board"]) ? readVersion(body) : undefined)
	);
}

/**
 * Read the version out of anything the canvas says about a board, refusals
 * included.
 *
 * A refusal is a telling too, and the important one: a write turned away for
 * being against an old version is told which version the board is really at, so
 * the next write goes against that rather than against the number that was just
 * refused. Without this an agent would be refused for ever on one stale read.
 * @param data The answer body.
 */
function rememberVersion(data: unknown): void {
	if (!requestedBoard || !isRecord(data)) {
		return;
	}
	const found = statedVersionIn(data);
	if (found !== undefined) {
		rememberBoardVersion(clientVersionWriter(requestedBoard), found);
	}
}

/**
 * Attach what this invocation says about its write to anything that is not a
 * read: what it is doing, and which version it believes it is editing.
 *
 * Deny by default, like the boundary on the server that demands it: a request
 * with a method carries them unless it is a GET, so a route added later is
 * covered without anybody remembering. Nothing is refused here — the canvas
 * owns both refusals, because it is the only side that knows which routes are
 * board writes, and two lists that must agree are how they stop agreeing.
 * @param path The request path.
 * @param method The request's method; a missing one reads as GET.
 * @returns The path carrying this invocation's claims.
 */
function withWriteClaims(path: string, method?: string): string {
	if ((method ?? "GET").toUpperCase() === "GET") {
		return path;
	}
	return withExpectedVersion(withDoing(path));
}

/**
 * Attach what this invocation says it is doing, unless the caller said so.
 * @param path The request path.
 * @returns The path carrying the line, where there is one.
 */
function withDoing(path: string): string {
	if (!writeDoing || /[?&]doing=/.test(path)) {
		return path;
	}
	return addQuery(path, "doing", writeDoing);
}

/**
 * Attach the version this invocation writes against, unless the caller said
 * so. `0` is the wire spelling for a board with no note yet, so that "I saw
 * no version" is a statement rather than a silence.
 * @param path The request path.
 * @returns The path carrying the version, where this invocation has one.
 */
function withExpectedVersion(path: string): string {
	const expected = currentExpectedVersion();
	if (expected === undefined || /[?&]expectVersion=/.test(path)) {
		return path;
	}
	return addQuery(path, "expectVersion", expected ?? 0);
}

export {
	addQuery,
	boardHoldSeen,
	currentExpectedVersion,
	currentRequestedBoard,
	currentWriteDoing,
	forgetVersionsSeen,
	noteHold,
	rememberVersion,
	setExpectedVersion,
	setRequestedBoard,
	setWriteDoing,
	withBoard,
	withWriteClaims,
};
