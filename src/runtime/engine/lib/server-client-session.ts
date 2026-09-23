// What one CLI invocation says about itself on every request it makes: which
// board it is for, what it says it is doing, and which version of that board it
// believes it is writing against.
//
// Carried here rather than threaded through thirty call sites. The CLI is one
// command per process, so "this invocation" is a process-wide fact and stating
// it once is what keeps a write's `--board`, `--doing` and `--expect-version`
// from being forgotten by whichever call site was written last.

import { isRecord } from "@/runtime/engine/lib/unknown-record";

/** The board this invocation names, or null when it names none. */
let requestedBoard: string | null = null;

/** What this invocation says it is doing, or null when it says nothing. */
let writeDoing: string | null = null;
let writeSession: string | null = null;

/**
 * The version this invocation states it is writing against: a number, null for
 * "against a board that carries no version", or undefined for "states none".
 */
let expectedVersion: number | null | undefined;

/**
 * Name the board every later request is about.
 * @param key The board key, or null to name none.
 */
function setRequestedBoard(key: string | null): void {
	requestedBoard = key;
}

/**
 * The board this invocation named.
 * @returns The key, or null.
 */
function currentRequestedBoard(): string | null {
	return requestedBoard;
}

/**
 * A path with one more query parameter on it.
 * @param path The path, with or without a query string already.
 * @param key The parameter.
 * @param value Its value.
 * @returns The path.
 */
function addQuery(path: string, key: string, value: string | number): string {
	const separator = path.includes("?") ? "&" : "?";
	return `${path}${separator}${key}=${encodeURIComponent(String(value))}`;
}

/**
 * A path carrying the board this invocation named, when it named one.
 * @param path The path.
 * @returns The path, with `?board=` when there is a board to state.
 */
function withBoard(path: string): string {
	return requestedBoard === null ? path : addQuery(path, "board", requestedBoard);
}

/**
 * Say what this invocation is doing, which every write states.
 * @param doing The line, or null when nothing was said.
 */
function setWriteDoing(doing: string | null): void {
	writeDoing = doing;
}

/**
 * Say which agent session this invocation is writing as.
 *
 * Per invocation, never from the environment: one private app-server child
 * serves every thread of a workbench, so a value read out of that process's
 * environment would stamp one session's identity on another's writes — the
 * exact failure that made the old pane attribution worse than nothing.
 *
 * What it is for is one thing: letting that session skip the board news it
 * wrote itself. Nothing on a board rests on it, nothing validates it, and a
 * write that says nothing is delivered to everybody, its own author included.
 * @param session The session's own thread identity, or null when there is none to state.
 */
function setWriteSession(session: string | null): void {
	writeSession = session;
}

/**
 * Which session this invocation is writing as.
 * @returns The identity, or null.
 */
function currentWriteSession(): string | null {
	return writeSession;
}

/**
 * What this invocation says it is doing.
 * @returns The line, or null.
 */
function currentWriteDoing(): string | null {
	return writeDoing;
}

/**
 * A path carrying what this invocation is doing, when it said.
 *
 * Unless the caller has already said it. A command that builds its own query —
 * a semantic write states its line and the version it read together — is the
 * one that knows; adding a second `doing=` behind it would put two values on
 * the wire, and the canvas would read an array where it expects a line and
 * refuse the write as undescribed.
 * @param path The path.
 * @returns The path, with `?doing=` when there is a line to state and none yet.
 */
function withDoing(path: string): string {
	if (writeDoing === null || /[?&]doing=/u.test(path)) {
		return path;
	}
	return addQuery(path, "doing", writeDoing);
}

/**
 * State the version this invocation is writing against.
 * @param version The version, null for a board that carries none, undefined for unstated.
 */
function setExpectedVersion(version: number | null | undefined): void {
	expectedVersion = version;
}

/**
 * The version this invocation states.
 * @returns The version, null, or undefined when it states none.
 */
function currentExpectedVersion(): number | null | undefined {
	return expectedVersion;
}

/**
 * A path carrying the version this invocation states, when it states one.
 * @param path The path.
 * @returns The path, with `?expectVersion=` when there is one to state.
 */
function withExpectedVersion(path: string): string {
	if (expectedVersion === undefined || expectedVersion === null) {
		return path;
	}
	// The same rule, for the same reason: the caller that built the query is the
	// one that knows what it is writing against.
	return /[?&]expectVersion=/u.test(path) ? path : addQuery(path, "expectVersion", expectedVersion);
}

/**
 * The board an answer says it was about, when it says.
 * @param data The answer body.
 * @returns The board key, or null.
 */
function answeredBoard(data: unknown): string | null {
	if (!isRecord(data)) {
		return null;
	}
	const board = data["board"];
	return typeof board === "string" ? board : null;
}

/**
 * A path carrying everything a write states about itself: the line it is doing
 * under, and the version it believes it is writing against. Only a write, so a
 * read never carries either.
 * @param path The path, board already stated.
 * @param method The request method; anything but GET is a write.
 * @returns The path.
 */
function withWriteClaims(path: string, method?: string): string {
	if (method === undefined || method.toUpperCase() === "GET") {
		return path;
	}
	return withExpectedVersion(withDoing(path));
}

export {
	setWriteSession,
	currentWriteSession,
	addQuery,
	withWriteClaims,
	answeredBoard,
	currentExpectedVersion,
	currentRequestedBoard,
	currentWriteDoing,
	setExpectedVersion,
	setRequestedBoard,
	setWriteDoing,
	withBoard,
	withDoing,
	withExpectedVersion,
};
