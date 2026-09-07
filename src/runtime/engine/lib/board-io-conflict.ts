// Has something that is not archboard written this note? The one comparison
// behind a write's refusal and the board bar's changed-note mark (ADR 0006).

import fs from "fs";

import { baselineForFile } from "@/runtime/engine/board-store";
import { hashBoardBytes } from "@/runtime/engine/board";
import {
	type BoardWriteConflict,
	type VersionMove,
	versionMove,
	versionNumber,
} from "@/runtime/engine/board-version";

/**
 * A write archboard would not make, because somebody else has been here.
 *
 * Carries the conflict as data — the three outcomes and which one costs what —
 * so a surface can offer them rather than reword them (ADR 0006).
 */
class BoardWriteConflictError extends Error {
	readonly conflict: BoardWriteConflict;
	/**
	 * Wrap one described conflict, using its message as the error's.
	 * @param conflict The conflict as `describeWriteConflict` shaped it.
	 */
	constructor(conflict: BoardWriteConflict) {
		super(conflict.message);
		this.name = "BoardWriteConflictError";
		this.conflict = conflict;
	}
}

/**
 * What archboard found at a path that it did not put there.
 *
 * Shaped so that `describeWriteConflict` can be spread straight onto it, which
 * is the point: one set of facts, and the refusal and the mark are two ways of
 * saying it.
 */
interface ForeignWrite {
	file: string;
	reason: "changed" | "unseen";
	expectedHash?: string;
	actualHash: string;
	lastReadAt?: string;
	fileModifiedAt: string;
	/**
	 * Which way the note's version moved between archboard's last write here and
	 * now (TASK-091). The hash establishes that these are not archboard's bytes;
	 * this says who wrote them. `unchanged` is the foreign writer named — a
	 * version key is carried across a save verbatim by everything that does not
	 * maintain it — `behind` is a revert or a pull, `ahead` is another archboard.
	 */
	versionMove: VersionMove;
	/** What archboard last wrote there, and what the note says now. */
	expectedVersion: number | null;
	actualVersion: number | null;
}

interface WriteOptions {
	/** The human's "overwrite it anyway". Never set by archboard on its own behalf. */
	force?: boolean;
	/**
	 * The board key the save was issued for, when it is not the note being
	 * written (`board save --board <this> --as <that>`), so a refusal prints
	 * the command that was actually run. Absent means a same-board save.
	 */
	savedFrom?: string;
}

type Baseline = ReturnType<typeof baselineForFile>;

/**
 * The half of a foreign write that depends on whether archboard ever read
 * this path: `changed` with what it last saw, or `unseen`.
 * @param expected The baseline for the path, or null when there is none.
 * @returns The reason and, when known, the expected hash and read time.
 */
function baselineFacts(expected: Baseline): Pick<ForeignWrite, "reason" | "expectedHash" | "lastReadAt"> {
	return expected
		? { reason: "changed", expectedHash: expected.hash, lastReadAt: expected.at }
		: { reason: "unseen" };
}

/**
 * Has something that is not archboard written this note?
 *
 * ADR 0006's comparison, on its own, because two things ask it. A write asks in
 * order to refuse, and it asks about the bytes it has already read. The mark in
 * the board bar asks about a board nobody is writing, so that a person drawing
 * on a copy the vault no longer holds finds out before their next edit is
 * refused rather than after (TASK-062).
 *
 * They must not be two comparisons. The mark's whole claim is that it shows the
 * state in which the next write *would* be refused, and a second implementation
 * of the same question is a second implementation that drifts — showing a mark
 * over a write that would go through, or staying quiet over one that would not.
 * So the bytes come in from whoever read them and only the comparison lives
 * here.
 *
 * Nothing at the path is not somebody else's work: an empty destination is what
 * a `board new` writes into, and the write goes ahead. Bytes archboard has
 * never read are, because it cannot tell what writing over them would delete —
 * that is the `unseen` half of the same refusal.
 * @param file The note's path.
 * @param destination The bytes at that path right now, or undefined when there are none.
 * @returns The foreign write's facts, or null when the bytes are archboard's own.
 */
function foreignWriteTo(file: string, destination: Buffer | undefined): ForeignWrite | null {
	if (!destination) {
		return null;
	}
	const actualHash = hashBoardBytes(destination);
	// Asked of the whole registry rather than of one board, because a baseline
	// belongs to a path: `board save --as other` writes a file some other open
	// board is the one that read.
	const expected = baselineForFile(file);
	if (expected?.hash === actualHash) {
		return null;
	}
	// Read only once the bytes are already known to differ: the version answers
	// "who wrote this", which is a question that only arises after the hash has
	// said somebody did. The hash still decides, and this only ever describes.
	const actualVersion = versionNumber(destination.toString("utf-8"));
	const expectedVersion = expected?.version ?? null;
	return {
		file,
		...baselineFacts(expected),
		actualHash,
		fileModifiedAt: fs.statSync(file).mtime.toISOString(),
		versionMove: versionMove(expectedVersion, actualVersion),
		expectedVersion,
		actualVersion,
	};
}

export { BoardWriteConflictError, type ForeignWrite, type WriteOptions, foreignWriteTo };
