// The one place a semantic board changes.
//
// Every command that will ever change a board — create, edit, and later branch,
// resolve and adopt — arrives here, and the guarantees are made once rather
// than once per command:
//
//   one writer at a time, taken over the whole board (ADR 0016). The lease is
//     the board's, not a variant's, because a parent change and what it does to
//     its children are one act.
//   one expected-version check, made under that lease, before anything is
//     applied. Checking it outside would be checking against a board somebody
//     else could still change.
//   one version advance per accepted write, and never one for a refused write.
//   one atomic write, temp file and fsync and rename (`atomic-write.ts`), so a
//     reader sees the whole old board or the whole new one and a crash mid-write
//     cannot leave half a board where the board was.
//   one validation of the candidate before any of that, so a command that would
//     make the board incoherent is refused with the file untouched.
//
// Nothing between the read and the write is asynchronous. The lease is taken
// first and given back last, and everything in between is one synchronous pass.

import { writeFileAtomic } from "@/runtime/engine/atomic-write";
import {
	BoardHeldError,
	claimWriterId,
	takeClaimRevocation,
	withBoardLock,
	type LockRequest,
} from "@/runtime/engine/board-lock";
import { mintId } from "@/shared/ids/ids";
import {
	nextVersion,
	parseSemanticBoard,
	SEMANTIC_BOARD_SCHEMA_VERSION,
	type SemanticBoard,
} from "@/shared/semantic-board/index";
import fs from "node:fs";
import path from "node:path";
import {
	locateSemanticBoard,
	semanticBoardAddress,
	type SemanticBoardLocation,
} from "@/runtime/semantic-board-store/lib/location";
import {
	readSemanticBoardAt,
	type SemanticBoardRead,
} from "@/runtime/semantic-board-store/lib/read";
import { refuse, type SemanticRefusalCode } from "@/runtime/semantic-board-store/lib/outcome";
import type { SemanticTransition } from "@/runtime/semantic-board-store/lib/transitions";
import type { DescendantOutcome } from "@/runtime/semantic-board-store/lib/propagate";
import type { WriteNotice } from "@/runtime/semantic-board-store/lib/replaced-relationships";
import type { VaultDiagnostic } from "@/shared/semantic-policy/index";
import { readSemanticBoardConfiguration } from "@/runtime/semantic-board-store/lib/configuration";
import { newVocabularyProblem } from "@/runtime/semantic-board-store/lib/vocabulary";

/**
 * Who is writing.
 *
 * A person names themselves: the identity is the pane, so that the same pane
 * asking twice renews its hold rather than queuing behind itself.
 *
 * An agent does not, and deliberately cannot. The lease is reentrant by holder
 * identity, so two unrelated agent writes sharing one identity would both be
 * admitted and neither would own giving the board back — the mutual exclusion
 * would be gone and nothing would say so. An unclaimed agent write therefore
 * gets a fresh identity minted here, per write, and an agent working under a
 * claim gets the claim's, which is the one case where writes really are the
 * same writer and should join.
 */
interface SemanticWriter {
	/** Whether a person or an agent is writing. */
	readonly kind: "human" | "agent";
	/** A person's pane. Ignored for an agent, which is never asked. */
	readonly id?: string;
	/** What the write is for, shown to whoever is waiting for the board. */
	readonly reason?: string;
}

/** One stated command against one board. */
interface SemanticWriteCommand {
	/** The board name as typed. */
	readonly board: string;
	/** Who is writing. */
	readonly writer: SemanticWriter;
	/** What to do to the board. */
	readonly transition: SemanticTransition;
	/** The version the writer read, when it is stating one. */
	readonly expectedVersion?: number | undefined;
	/** Cancels waiting for the lease, never a write already under way. */
	readonly signal?: Readonly<AbortSignal>;
}

/** Why a write did nothing, and what the board is actually at. */
interface SemanticWriteRejection {
	readonly outcome: "rejected";
	readonly code: SemanticRefusalCode;
	readonly problem: string;
	readonly location: SemanticBoardLocation;
	/** The version the board is actually at, when there is a board. */
	readonly version: number | null;
}

/** What a write did, or why it did nothing. */
type SemanticWriteResult =
	| {
			readonly outcome: "applied";
			readonly board: SemanticBoard;
			readonly location: SemanticBoardLocation;
			/** The version the board was at before this write. */
			readonly previousVersion: number | null;
			/**
			 * What every draft under the change did about it. Empty for a command
			 * that reaches no draft; a caller reads it to tell a write that landed
			 * from one that landed and left proposals needing somebody.
			 */
			readonly descendants: readonly DescendantOutcome[];
			/**
			 * What the write did that the caller should say alongside the board it
			 * read back: a relationship removed and stated again as a new one, for
			 * instance. Empty for a write that did nothing worth a warning.
			 */
			readonly warnings: readonly VaultDiagnostic[];
			/**
			 * The identity this write held the board under.
			 *
			 * The claim when the board is claimed, and the identity minted for this
			 * write alone when it is not (ADR 0016). Reported rather than derived
			 * afterwards, because it is the only thing that tells one writer's change
			 * from another's: after ADR 0023 every semantic write is an agent's, so
			 * "an agent wrote it" distinguishes nothing, and a reader deciding whether
			 * a change is news or its own echo is asking about this.
			 */
			readonly heldAs: string;
	  }
	| SemanticWriteRejection;

/**
 * What the pass inside the lease did, before the lease says who held it.
 *
 * The same thing a caller gets, minus the one fact that pass has no business
 * knowing: which identity the board was held under is decided when the lease is
 * taken, and carrying it through a read-check-apply-write sequence that never
 * reads it would be a parameter somebody later has to account for.
 */
type LeasedWriteResult =
	| Omit<Extract<SemanticWriteResult, { outcome: "applied" }>, "heldAs">
	| SemanticWriteRejection;

/**
 * How a board is spelled on disk: indented with tabs and ending in a newline,
 * because it sits in a vault a person opens in a text editor, and a one-line
 * document there is a document nobody will ever read a diff of.
 * @param board The board to spell.
 * @returns The bytes to write.
 */
function serializeBoard(board: SemanticBoard): string {
	return `${JSON.stringify(board, null, "\t")}\n`;
}

/**
 * Shape a rejection.
 * @param location Where the board lives.
 * @param version The version the board is actually at.
 * @param code Why the write was refused.
 * @param problem What went wrong, in a sentence.
 * @returns The rejection.
 */
function rejected(
	location: SemanticBoardLocation,
	version: number | null,
	code: SemanticRefusalCode,
	problem: string,
): SemanticWriteRejection {
	return { outcome: "rejected", code, problem, location, version };
}

/** An admitted write: the identity it holds the board under, and why. */
interface Admission {
	readonly ok: true;
	readonly id: string;
	/** Whether that identity is a standing claim rather than this write alone. */
	readonly claimed: boolean;
}

/**
 * Whether this writer is allowed to write at all, and under whose identity.
 *
 * An agent writing a board somebody has claimed writes as the claim, which is
 * what makes the lease reentrant across separate commands — twenty writes under
 * one claim are one uninterrupted act. An agent writing without a claim gets an
 * identity of its own, minted here rather than taken from the caller, so that
 * two such writes can never be mistaken for one writer. An agent whose claim was
 * taken back is refused once, so it learns rather than writing over the person
 * who took it.
 * @param key The board's canonical key.
 * @param writer The writer as stated.
 * @returns The identity to hold the lease under, or the refusal.
 */
function admit(
	key: string,
	writer: SemanticWriter,
): Admission | { readonly ok: false; readonly problem: string } {
	if (writer.kind !== "agent") {
		return { ok: true, id: writer.id ?? `pane-${mintId()}`, claimed: false };
	}
	if (takeClaimRevocation(key) !== null) {
		return {
			ok: false,
			problem: `the claim on "${key}" was taken back; claim the board again before writing`,
		};
	}
	const claim = claimWriterId(key);
	return claim === null
		? { ok: true, id: `agent-${mintId()}`, claimed: false }
		: { ok: true, id: claim, claimed: true };
}

/**
 * The board as it stands, ready for the transition, or the refusal a caller
 * gets instead. A board that is simply not there yet is not a refusal: that is
 * what a create command expects to find.
 * @param location Where the board lives.
 * @param expected The version the writer stated, when it stated one.
 * @returns The board and its version, or why the write cannot go ahead.
 */
function boardBefore(
	location: SemanticBoardLocation,
	expected: number | undefined,
):
	| { readonly ok: true; readonly board: SemanticBoard | null; readonly version: number | null }
	| SemanticWriteRejection {
	const read = readSemanticBoardAt(location);
	const unusable = unusableRefusal(location, read);
	if (unusable !== null) {
		return unusable;
	}
	const board = read.ok ? read.board : null;
	const version = board === null ? null : board.version;
	const stale = versionRefusal(expected, version);
	return stale === null
		? { ok: true, board, version }
		: rejected(location, version, stale.code, stale.problem);
}

/**
 * Whether what is on disk can be written to at all: it is either nothing yet,
 * or a coherent board that really is this one.
 * @param location Where the board lives.
 * @param read What the read found.
 * @returns The refusal, or null when the write may go ahead.
 */
function unusableRefusal(
	location: SemanticBoardLocation,
	read: SemanticBoardRead,
): SemanticWriteRejection | null {
	if (read.ok) {
		return misaddressedRefusal(location, read.board);
	}
	return read.code === "BOARD_UNREADABLE"
		? rejected(location, null, read.code, read.problem)
		: null;
}

/**
 * Refuse a board that is not the board its own address says it is.
 *
 * Checked on the way in and on the way out. A file copied or renamed inside a
 * vault keeps the name written inside it; a command can equally well ask to
 * write a board called one thing to the address of another. Either way the
 * document would answer to two identities, and reads, the listing, the lease
 * and the message a pane receives would each pick one of them.
 * @param location Where the board lives.
 * @param board The board read or about to be written.
 * @returns The refusal, or null when the two agree.
 */
function misaddressedRefusal(
	location: SemanticBoardLocation,
	board: SemanticBoard,
): SemanticWriteRejection | null {
	if (semanticBoardAddress(board.name).key === location.key) {
		return null;
	}
	return rejected(
		location,
		board.version,
		"BOARD_MISADDRESSED",
		`${location.file} holds a board that calls itself "${board.name}", which is a different board ` +
			`from "${location.name}". Rename one of them, or move the file back to where its name says ` +
			"it belongs. Nothing was written.",
	);
}

/**
 * Refuse a command that must state which version it read and did not.
 *
 * The check is here rather than only at the transport, because this is the
 * boundary every caller goes through: a dynamic tool, a route and a command all
 * arrive at this function, and a precondition enforced in one of them is a
 * precondition the other two do not have.
 * @param location Where the board lives.
 * @param command The stated command.
 * @returns The refusal, or null when the command may go ahead.
 */
function missingVersionRefusal(
	location: SemanticBoardLocation,
	command: SemanticWriteCommand,
): SemanticWriteRejection | null {
	if (!command.transition.changesExistingBoard || command.expectedVersion !== undefined) {
		return null;
	}
	return rejected(
		location,
		null,
		"EXPECT_VERSION_REQUIRED",
		`This write does not say which version of "${location.name}" it was written against, so there ` +
			"is no way to tell whether somebody else has changed it since. Read the board, write the " +
			"change against what it said, and state the version it reported. Reading it again " +
			"immediately before writing would make the check pass by construction and hide the change " +
			"you were meant to notice. Nothing was written.",
	);
}

/**
 * Write the checked board and say what the write did.
 *
 * After every check and never before: a refused write leaves no directory
 * behind for somebody to wonder about.
 * @param location Where the board lives.
 * @param board The board as it should now be.
 * @param previousVersion The version it was at before this write.
 * @param candidate What the command reported beside the board: every draft's answer and the notices the write answers with.
 * @param candidate.descendants What every draft under the change did about it.
 * @param candidate.notices What the command did that the answer should say.
 * @returns What the write did.
 */
function persisted(
	location: SemanticBoardLocation,
	board: SemanticBoard,
	previousVersion: number | null,
	candidate: {
		readonly descendants?: readonly DescendantOutcome[];
		readonly notices?: readonly WriteNotice[];
	},
): LeasedWriteResult {
	const descendants = candidate.descendants ?? [];
	const notices = candidate.notices ?? [];
	fs.mkdirSync(path.dirname(location.file), { recursive: true });
	writeFileAtomic(location.file, serializeBoard(board));
	const warnings = notices.map((notice) => ({
		severity: "warning" as const,
		code: notice.code,
		file: location.file,
		path: notice.path,
		board: board.name,
		message: notice.message,
	}));
	return { outcome: "applied", board, location, previousVersion, descendants, warnings };
}

/**
 * Apply one command to the board on disk, inside the lease.
 *
 * This is the synchronous pass: read, check, apply, validate, stamp, write.
 * Every early return leaves the file exactly as it was.
 * @param location Where the board lives.
 * @param command The stated command.
 * @param at The timestamp to stamp the write with.
 * @returns What the write did.
 */
function applyUnderLease(
	location: SemanticBoardLocation,
	command: SemanticWriteCommand,
	at: string,
): LeasedWriteResult {
	const missing = missingVersionRefusal(location, command);
	if (missing !== null) {
		return missing;
	}
	const before = boardBefore(location, command.expectedVersion);
	if (!("ok" in before)) {
		return before;
	}
	const candidate = command.transition.apply(before.board, at);
	if (!candidate.ok) {
		return rejected(location, before.version, candidate.code, candidate.problem);
	}
	const checked = acceptable(location, command, before.board, {
		...candidate.board,
		// Every accepted write stamps the contract it was written under. A board
		// created before a field existed and then written to now holds what this
		// build can say, and saying so is the whole purpose of the field: a reader
		// that finds an older version knows what it may not expect to find.
		// Nothing migrates a file nobody wrote to — reading is unchanged.
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		version: nextVersion(before.board),
		updatedAt: at,
	});
	if (!("board" in checked)) {
		return { ...checked, version: before.version };
	}
	return persisted(location, checked.board, before.version, candidate);
}

/**
 * Whether the board a command produced may be written: it is coherent, and it
 * is the board this address names.
 * @param location Where it would be written.
 * @param command The stated command, for a refusal to say what it was doing.
 * @param before The family before this command.
 * @param candidate The board the transition produced, already stamped.
 * @returns The board, or why it may not be written.
 */
function acceptable(
	location: SemanticBoardLocation,
	command: SemanticWriteCommand,
	before: SemanticBoard | null,
	candidate: SemanticBoard,
): { readonly board: SemanticBoard } | Omit<SemanticWriteRejection, "version"> {
	const parsed = parseSemanticBoard(candidate);
	if (!parsed.ok) {
		return {
			outcome: "rejected",
			code: "INVALID_CONTENT",
			problem: `refusing to ${command.transition.summary}: ${parsed.problem}`,
			location,
		};
	}
	const wrongAddress = misaddressedRefusal(location, parsed.board);
	if (wrongAddress !== null) return wrongAddress;
	const configured = readSemanticBoardConfiguration();
	const configuredLevel = configured.ok
		? newVocabularyProblem(parsed.board, before, configured.configuration)
		: null;
	if (configuredLevel !== null) {
		return {
			outcome: "rejected",
			code: "INVALID_CONTENT",
			problem: `refusing to ${command.transition.summary}: ${configuredLevel}`,
			location,
		};
	}
	return { board: parsed.board };
}

/**
 * Whether the writer is working from the board as it stands.
 *
 * A writer that states no version is not checked — that is the caller saying
 * it does not care, and it is how a first create works. A writer that states
 * one is refused the moment it disagrees, before anything is applied.
 * @param expected The version the writer stated, when it stated one.
 * @param actual The version the board is at, or null when there is no board.
 * @returns The refusal, or null when the write may proceed.
 */
function versionRefusal(
	expected: number | undefined,
	actual: number | null,
): { readonly code: SemanticRefusalCode; readonly problem: string } | null {
	if (expected === undefined || expected === actual) {
		return null;
	}
	const at = actual === null ? "no board is there" : `it is at version ${actual}`;
	const { code, problem } = refuse(
		"BOARD_VERSION_CONFLICT",
		`this write expected version ${expected} and ${at}; read the board again and restate the change`,
	);
	return { code, problem };
}

/**
 * How the lease is asked for: the board's key, the identity the write runs
 * under, and the writer's own words about what it is doing.
 * @param key The board's canonical key.
 * @param command The stated command.
 * @param admission The identity admitted for this write.
 * @returns The lock request.
 */
function leaseRequest(
	key: string,
	command: SemanticWriteCommand,
	admission: Admission,
): LockRequest {
	return {
		board: key,
		holder: {
			id: admission.id,
			kind: command.writer.kind,
			...(command.writer.reason === undefined ? {} : { reason: command.writer.reason }),
			...(admission.claimed ? { claimed: true } : {}),
		},
		...(command.signal === undefined ? {} : { signal: command.signal }),
	};
}

/**
 * Change one board.
 * @param command The stated command.
 * @returns What the write did, or why it did nothing.
 * @throws {Error} When the board name is not usable or would escape the vault.
 */
async function writeSemanticBoard(command: SemanticWriteCommand): Promise<SemanticWriteResult> {
	// The key comes from the name alone, without reading a directory, so the
	// lease is taken before anything looks at the filesystem. Two processes
	// creating "Payments" and "payments" on a case-sensitive filesystem would
	// otherwise each resolve an absent path of their own, take the lease in turn
	// and leave two files where the vault has one board (ADR 0010).
	const address = semanticBoardAddress(command.board);
	const admission = admit(address.key, command.writer);
	if (!admission.ok) {
		return {
			outcome: "rejected",
			code: "CLAIM_REVOKED",
			problem: admission.problem,
			location: { ...address, file: "" },
			version: null,
		};
	}
	const at = new Date().toISOString();
	try {
		const result = await withBoardLock(leaseRequest(address.key, command, admission), () =>
			applyUnderLease(locateSemanticBoard(command.board), command, at),
		);
		// Said here rather than carried through the pass inside the lease: the pass
		// reads, checks, applies and writes, and an identity it takes but never uses
		// is one more thing a reader of it has to account for. This is a fact about
		// the lease, so it is reported where the lease was taken.
		return result.outcome === "applied" ? { ...result, heldAs: admission.id } : result;
	} catch (error) {
		if (error instanceof BoardHeldError) {
			return {
				outcome: "rejected",
				code: "BOARD_HELD",
				problem: error.message,
				location: { ...address, file: "" },
				version: null,
			};
		}
		throw error;
	}
}

export {
	type SemanticWriter,
	type SemanticWriteCommand,
	type SemanticWriteResult,
	writeSemanticBoard,
};
