// Which edit of a board note this is, and whether it has moved past what a
// writer said it was editing (TASK-103).
//
// The count orders archboard's own writes. It does not replace ADR 0006's byte
// hash: an editor that does not maintain the count carries it across unchanged,
// while the hash still detects that the note's bytes moved.

import fs from "node:fs";

import type { BoardIdentity } from "@/runtime/engine/board";
import { CURRENT_VARIANT, boardDisplayName, boardKey } from "@/runtime/engine/board";
import { readFrontmatterValue, setFrontmatterValue } from "@/runtime/engine/obsidian-md";

const FRONTMATTER_VERSION = "version";
const FRONTMATTER_PROBE_BYTES = 16 * 1024;

type NoteVersion =
	| { kind: "none" }
	| { kind: "at"; value: number }
	| { kind: "foreign"; raw: string };

type VersionMove = "unchanged" | "behind" | "ahead" | "unknown";

type BoardConflictReason = "changed" | "unseen";

interface BoardWriteConflict {
	board: string;
	file: string;
	reason: BoardConflictReason;
	expectedHash?: string;
	actualHash: string;
	lastReadAt?: string;
	fileModifiedAt?: string;
	versionMove: VersionMove;
	expectedVersion?: number;
	actualVersion?: number;
	outcomes: { reload: string; overwrite: string; saveAs: string };
	message: string;
}

interface BoardVersionConflict {
	board: string;
	file?: string;
	/** What the writer was working from. Null means it last saw no note version. */
	expected: number | null;
	actual: number | null;
	/** How many writes the board moved. Negative means the note went backwards. */
	movedBy: number;
	message: string;
}

type StatedVersionResult = { ok: true; expected?: number | null } | { ok: false; problem: string };

/** What a refused save knows about the two copies it could not reconcile. */
interface WriteConflictInput {
	target: BoardIdentity;
	file: string;
	reason: BoardConflictReason;
	expectedHash?: string;
	actualHash: string;
	lastReadAt?: string;
	fileModifiedAt?: string;
	expectedVersion?: number | null;
	actualVersion?: number | null;
	/** The board the save read from, which is only interesting when it differs. */
	savedFrom?: string;
}

/** What a refused write knows about the version it was made against. */
interface VersionConflictInput {
	board: string;
	file?: string;
	expected: number | null;
	actual: number | null;
}

/** Where the version a write is checked against may come from. */
interface ExpectedVersionInput {
	/** What the writer stated, when it stated anything. */
	stated?: number | null;
	/** Which writer to fall back on what it was last told. */
	rememberedBy?: string;
}

/** One write, as the version check sees it. */
interface VersionCheckInput extends ExpectedVersionInput {
	board: string;
	file?: string;
	/** False for a write that never reaches the note, which nothing checks. */
	writesNote: boolean;
}

/**
 * What a note says its version is: a count archboard wrote, something else's
 * value, or nothing.
 * @param content The note.
 * @returns The version as the note states it.
 */
function noteVersion(content: string): NoteVersion {
	const raw = readFrontmatterValue(content, FRONTMATTER_VERSION);
	if (raw === undefined) {
		return { kind: "none" };
	}
	if (!/^\d+$/.test(raw.trim())) {
		return { kind: "foreign", raw };
	}
	return { kind: "at", value: Number(raw.trim()) };
}

/**
 * The count a note carries.
 * @param content The note.
 * @returns The count, or null when it carries none archboard can read.
 */
function versionNumber(content: string): number | null {
	const version = noteVersion(content);
	return version.kind === "at" ? version.value : null;
}

/**
 * The count the note in one file carries.
 *
 * Only the note head is read, because the frontmatter precedes a scene that
 * can be megabytes.
 * @param file The note's path.
 * @returns The count, or null when the file is unreadable or carries none.
 */
function versionOfNoteAt(file: string): number | null {
	try {
		const handle = fs.openSync(file, "r");
		try {
			const buffer = Buffer.alloc(FRONTMATTER_PROBE_BYTES);
			const read = fs.readSync(handle, buffer, 0, buffer.length, 0);
			return versionNumber(buffer.subarray(0, read).toString("utf-8"));
		} finally {
			fs.closeSync(handle);
		}
	} catch {
		return null;
	}
}

/**
 * Which way a note's count moved since archboard last wrote it.
 * @param baseline What archboard last wrote.
 * @param now What the note says now.
 * @returns The direction, or "unknown" when either side carries no count.
 */
function versionMove(baseline: number | null | undefined, now: number | null): VersionMove {
	if (baseline === null || baseline === undefined || now === null) {
		return "unknown";
	}
	if (now === baseline) {
		return "unchanged";
	}
	return now > baseline ? "ahead" : "behind";
}

/**
 * The sentence shared by the write refusal and the pane's changed-note mark.
 * @param move Which way the count moved.
 * @param baseline What archboard last wrote.
 * @param now What the note says now.
 * @returns The sentence.
 */
function describeVersionMove(
	move: VersionMove,
	baseline?: number | null,
	now?: number | null,
): string {
	switch (move) {
		case "unchanged":
			return (
				`The note is still marked version ${now}, which archboard also wrote, so whatever wrote it ` +
				"does not keep that mark — Obsidian, a sync client or a text editor."
			);
		case "behind":
			return (
				`The note has gone back to version ${now} from ${baseline}, so it was reverted or an older ` +
				"copy of it was restored rather than edited."
			);
		case "ahead":
			return (
				`The note is at version ${now} and archboard last wrote ${baseline}, so another archboard ` +
				`wrote it ${(now ?? 0) - (baseline ?? 0)} time(s) since.`
			);
		default:
			return (
				"Neither side carries a version archboard can order by, so which of the two is newer cannot " +
				"be said from the note alone."
			);
	}
}

// A board name may hold a space, an apostrophe or anything else the shell
// splits on or pairs up (only "@" and path-hostile characters are refused),
// and the recovery commands are typed back into a shell as printed. A word
// the shell would leave alone is printed bare; anything else is single-quoted,
// the one quoting every POSIX shell reads literally (TASK-153).
const PLAIN_WORD_RE = /^[A-Za-z0-9@%+=:,./_-]+$/;
/**
 * One word of a recovery command, as a shell reads it.
 * @param word The word.
 * @returns The word, quoted where a shell would otherwise split or pair it.
 */
const shellWord = (word: string): string =>
	PLAIN_WORD_RE.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`;

/**
 * A moment as a refusal prints it.
 * @param iso The timestamp, when there is one.
 * @returns The moment in UTC, or "unknown".
 */
const clock = (iso: string | undefined): string =>
	iso ? new Date(iso).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "unknown";

/**
 * The name a refusal offers for keeping both copies: the board's own name,
 * marked as the one that came off the canvas.
 * @param identity The board being saved.
 * @returns The suggested name.
 */
function suggestSaveAsName(
	identity: Pick<BoardIdentity, "board" | "variant" | "displayName">,
): string {
	const suffix =
		identity.variant === CURRENT_VARIANT ? "from-canvas" : `${identity.variant}-from-canvas`;
	return `${boardDisplayName(identity)}@${suffix}`;
}

/**
 * The refusal a save gets when the destination changed underneath it (ADR
 * 0006): what happened, which way the note's count moved, and the three
 * commands that resolve it.
 * @param input The board, its note, why the save was refused, and what each
 * side's hash and version were.
 * @returns The conflict, message and all.
 */
function describeWriteConflict(input: WriteConflictInput): BoardWriteConflict {
	const key = boardKey(input.target);
	// Every outcome is typed as printed. The two that write name the board the
	// save is issued for and say what they are doing, because the write boundary
	// cannot tell a person at a terminal from an agent and refuses an unstated
	// write (TASK-095); a fixed line per outcome is honest, since the outcome is
	// the intent (TASK-153). Reload is not a write and needs neither.
	const savedFrom = input.savedFrom ?? key;
	const from = shellWord(savedFrom);
	const as = savedFrom === key ? "" : ` --as ${shellWord(key)}`;
	const outcomes = {
		reload: `browser show ${shellWord(key)} --pane <spec> --reload`,
		overwrite: `board save --board ${from}${as} --force --doing "keeping the canvas"`,
		saveAs: `board save --board ${from} --as ${shellWord(suggestSaveAsName(input.target))} --doing "keeping both"`,
	};
	const move = versionMove(input.expectedVersion, input.actualVersion ?? null);
	const message = [
		conflictLead(key, input),
		describeVersionMove(move, input.expectedVersion, input.actualVersion),
		"Excalidraw scenes do not merge, so one of the two copies has to lose. Choose which:",
		`  reload     take the note, discard the canvas   ->  ${outcomes.reload}`,
		`  overwrite  keep the canvas, discard the note   ->  ${outcomes.overwrite}`,
		`  elsewhere  keep both, under another name       ->  ${outcomes.saveAs}`,
	].join("\n");
	return {
		board: key,
		file: input.file,
		reason: input.reason,
		...evidenceFields(input),
		versionMove: move,
		outcomes,
		message,
	};
}

/**
 * What the refusal opens with: whether the note changed after archboard read
 * it, or was never read at all, and when each happened.
 * @param key The board key.
 * @param input What the refused save knows.
 * @returns The opening lines.
 */
function conflictLead(key: string, input: WriteConflictInput): string {
	if (input.reason === "changed") {
		return (
			`Refusing to save "${key}": ${input.file} changed on disk after archboard read it, so saving would ` +
			"delete that change. Nothing was written.\n" +
			`archboard read the note at ${clock(input.lastReadAt)}; the file was last modified ${clock(input.fileModifiedAt)}.`
		);
	}
	return (
		`Refusing to save "${key}": there is already a note at ${input.file} that archboard has never read, ` +
		"so it cannot tell what saving would delete. Nothing was written.\n" +
		`That file was last modified ${clock(input.fileModifiedAt)}.`
	);
}

/**
 * The hashes, times and versions behind a refusal, each stated only where it
 * is known.
 * @param input What the refused save knows.
 * @returns The fields.
 */
function evidenceFields(
	input: WriteConflictInput,
): Pick<BoardWriteConflict, "actualHash"> & Partial<BoardWriteConflict> {
	return {
		...(input.expectedHash ? { expectedHash: input.expectedHash } : {}),
		actualHash: input.actualHash,
		...(input.lastReadAt ? { lastReadAt: input.lastReadAt } : {}),
		...(input.fileModifiedAt ? { fileModifiedAt: input.fileModifiedAt } : {}),
		...(typeof input.expectedVersion === "number"
			? { expectedVersion: input.expectedVersion }
			: {}),
		...(typeof input.actualVersion === "number" ? { actualVersion: input.actualVersion } : {}),
	};
}

/**
 * The refusal a write gets when the board has moved past the version its
 * writer was working from (TASK-091).
 * @param input The board, its note, the version the writer stated and the one
 * the note is at.
 * @returns The conflict, message and all.
 */
function describeVersionConflict(input: VersionConflictInput): BoardVersionConflict {
	const { board, expected, actual } = input;
	const from = expected === null ? "a board with no note yet" : `version ${expected}`;
	const now =
		actual === null
			? "the note carries no version archboard can read"
			: `the board is at ${actual}`;
	const since = describeMovement(expected, actual);
	return {
		board,
		...fileField(input.file),
		expected,
		actual,
		movedBy: (actual ?? 0) - (expected ?? 0),
		message: [
			`Refusing to write "${board}": you were working from ${from}, and ${now}. Nothing was written.`,
			since,
			"Use the document in this refusal before writing over what they did rather than repeating this write " +
				"against whatever is there now. This refusal is the only one you get: your next write goes against " +
				"the version named above.",
		].join("\n"),
	};
}

/**
 * What happened between the version a writer was working from and the one the
 * board is at.
 * @param expected What the writer was working from.
 * @param actual What the board is at.
 * @returns The sentence.
 */
function describeMovement(expected: number | null, actual: number | null): string {
	if (actual === null) {
		return "A note archboard has never written carries no version, so this board is not the one you read.";
	}
	if (expected === null) {
		return "This board had no note when you last saw it and has one now, so somebody has written it since.";
	}
	if (actual > expected) {
		return `Another writer has been here ${actual - expected} time(s) since the version you were working from.`;
	}
	return "The note is behind the version you were working from, so it was reverted or an older copy was restored.";
}

/**
 * Stamp a rendered note as one edit, unless it is byte-identical to the note
 * already at the destination. A foreign `version` property is preserved: an
 * editor that keeps its own value there is not overruled.
 * @param rendered The note as it was rendered.
 * @param destination The note already at the destination, when there is one.
 * @returns The note to write, and the version it now carries.
 */
function stampBoardVersion(
	rendered: RenderedNote,
	destination: Buffer | undefined,
): RenderedNote & { version: number | null } {
	const current = destinationVersion(destination);
	if (current.kind === "foreign") {
		return { ...rendered, version: null };
	}
	const at = current.kind === "at" ? current.value : null;
	if (destination?.equals(rendered.bytes)) {
		return { ...rendered, version: at };
	}
	const next = (at ?? 0) + 1;
	const note = setFrontmatterValue(rendered.note, FRONTMATTER_VERSION, String(next));
	return { note, bytes: Buffer.from(note, "utf-8"), version: next };
}

/**
 * What the note already at the destination says its version is.
 * @param destination The note there, when there is one.
 * @returns The version, or none when the destination is empty.
 */
function destinationVersion(destination: Buffer | undefined): NoteVersion {
	return destination ? noteVersion(destination.toString("utf-8")) : { kind: "none" };
}

/** A note as it was rendered, before anything stamps it. */
interface RenderedNote {
	note: string;
	bytes: Buffer;
}

/**
 * Parse what a write says it was editing.
 *
 * One parser for both writers (ADR 0022): a person's pane states the version
 * it last saw on every write, exactly as an agent does, and is refused the
 * same way when the note has moved. The difference is only in what silence
 * means. An agent may stay silent, because under a claim the canvas remembers
 * what it last told that writer; a pane has no remembered path and must
 * always state, `0` when it has seen no note yet.
 * @param raw What the write stated.
 * @param writer Which side wrote it, which decides what silence means.
 * @returns The version it was editing, or why the statement is not one.
 */
function statedVersion(raw: unknown, writer: "human" | "agent"): StatedVersionResult {
	if (raw === undefined || raw === "") {
		return silentVersion(writer);
	}
	if (typeof raw !== "string" || !/^\d+$/.test(raw.trim())) {
		return {
			ok: false,
			problem:
				"`expectVersion` must be a whole number: the version you were editing, as the last write's " +
				`fingerprint reported it or as \`board info\` says. Got ${JSON.stringify(raw)}.`,
		};
	}
	const stated = Number(raw.trim());
	return { ok: true, expected: stated === 0 ? null : stated };
}

/**
 * What a write that stated no version means. An agent may stay silent,
 * because under a claim the canvas remembers what it last told that writer; a
 * pane has no remembered path and must always state one.
 * @param writer Which side wrote it.
 * @returns Silence accepted, or why it is refused.
 */
function silentVersion(writer: "human" | "agent"): StatedVersionResult {
	if (writer === "agent") {
		return { ok: true };
	}
	return {
		ok: false,
		problem:
			"`expectVersion` is required on a pane's write: the version the pane last saw, as " +
			"`initial_elements`, `board_switched`, `elements_changed` or the last write's fingerprint " +
			"reported it, or 0 when it has seen no note yet. Got nothing.",
	};
}

const processRememberedVersions = new Map<string, number | null>();

/**
 * What each writer in this process was last told about a board.
 * @returns The remembered versions, by writer.
 */
function rememberedVersions(): Map<string, number | null> {
	return processRememberedVersions;
}

/**
 * What one writer was last told.
 * @param writer The writer, when the caller knows which.
 * @returns The version, null for a board with no note, undefined when it has
 * been told nothing.
 */
function rememberedVersion(writer: string | undefined): number | null | undefined {
	return writer ? rememberedVersions().get(writer) : undefined;
}

/**
 * Record what one writer has just been told.
 * @param writer The writer.
 * @param version The version, or null for a board with no note.
 */
function rememberVersion(writer: string, version: number | null): void {
	rememberedVersions().set(writer, version);
}

/**
 * Forget what one writer was told, which is what ending its claim does.
 * @param writer The writer.
 */
function forgetRememberedVersion(writer: string): void {
	rememberedVersions().delete(writer);
}

/**
 * Forget what every writer of one kind was told.
 * @param prefix Which writers, by the prefix their names share.
 */
function forgetRememberedVersions(prefix: string): void {
	for (const writer of rememberedVersions().keys()) {
		if (writer.startsWith(prefix)) {
			rememberedVersions().delete(writer);
		}
	}
}

/**
 * The version a write is checked against. Stated wins over remembered, and
 * the note's own current number is not a source: checking a write against
 * what the note says now would pass every write.
 * @param input What the writer stated, and which writer to fall back on.
 * @returns The version, null for a board with no note, undefined when nothing
 * says one.
 */
function expectedVersion(input: ExpectedVersionInput): number | null | undefined {
	return input.stated !== undefined ? input.stated : rememberedVersion(input.rememberedBy);
}

/**
 * Check one write while its caller holds the board lock. Reading remembered
 * state here means a preceding waiter can update it before this write checks.
 * @param input The board, its note, whether this write reaches the note at
 * all, and what the writer says it was editing.
 * @returns The conflict, or null when the write may go ahead.
 */
function checkBoardVersion(input: VersionCheckInput): BoardVersionConflict | null {
	if (!input.writesNote) {
		return null;
	}
	const expected = expectedVersion(input);
	if (expected === undefined) {
		return null;
	}
	const actual = input.file ? versionOfNoteAt(input.file) : null;
	if (actual === expected) {
		return null;
	}
	// The refusal is the writer's telling: its next write goes against what the
	// note is really at rather than against the number just refused.
	if (input.rememberedBy) {
		rememberVersion(input.rememberedBy, actual);
	}
	return describeVersionConflict({
		board: input.board,
		...fileField(input.file),
		expected,
		actual,
	});
}

/**
 * The note's path as a field a report states only when the board has one.
 * @param file The path, when the board has a note.
 * @returns The field, or nothing.
 */
function fileField(file: string | undefined): { file: string } | Record<string, never> {
	return file === undefined ? {} : { file };
}

/**
 * Record the current note version as something this writer has just been told.
 * @param writer The writer.
 * @param file The note's path, when the board has one.
 * @returns The version recorded.
 */
function rememberVersionAt(writer: string, file?: string): number | null {
	const version = file ? versionOfNoteAt(file) : null;
	rememberVersion(writer, version);
	return version;
}

export {
	type VersionMove,
	type BoardConflictReason,
	type BoardWriteConflict,
	type BoardVersionConflict,
	type StatedVersionResult,
	versionNumber,
	versionOfNoteAt,
	versionMove,
	describeVersionMove,
	describeWriteConflict,
	stampBoardVersion,
	statedVersion,
	rememberedVersion,
	rememberVersion,
	forgetRememberedVersion,
	forgetRememberedVersions,
	expectedVersion,
	checkBoardVersion,
	rememberVersionAt,
};
