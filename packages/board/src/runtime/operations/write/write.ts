// The one place an authored semantic board change lands. Read-time schema
// upgrades use the same lease and atomic writer in `read.ts`.
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

import {
	BoardHeldError,
	claimWriterId,
	takeClaimRevocation,
	withBoardLock,
	type ClaimEndCause,
	type LockRequest,
} from "#runtime/store/lock/lock.ts";
import { mintId } from "#shared/rules/ids.ts";
import { type SemanticBoard } from "#shared/schemas/board-document.ts";
import {
	locateSemanticBoard,
	semanticBoardAddress,
	type SemanticBoardAddress,
	type SemanticBoardLocation,
} from "#runtime/store/location.ts";
import {
	readSemanticBoardAtUnderLease,
	type SemanticBoardRead,
} from "#runtime/operations/read/read.ts";
import { resolveSemanticBoard } from "#runtime/store/former-names.ts";
import {
	relocation,
	renamedFrom,
	underNewName,
	writeBoardFile,
	type Relocation,
} from "#runtime/operations/rename/relocation.ts";
import { refuse, type SemanticRefusalCode } from "#runtime/operations/write/outcome.ts";
import type { SemanticTransition } from "#runtime/operations/write/transitions.ts";
import type { DescendantOutcome } from "#runtime/operations/variant/propagate.ts";
import type { WriteNotice } from "#runtime/operations/edit/replaced-relationships.ts";
import type { VaultDiagnostic } from "#shared/schemas/semantic-policy.ts";
import { readSemanticBoardConfiguration } from "#runtime/store/configuration.ts";
import { acceptedBoard } from "#runtime/operations/write/accepted.ts";

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
	/** The root of the vault the board lives in. */
	readonly vault: string;
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
	/** Why the writer's claim ended, on a CLAIM_REVOKED refusal. */
	readonly cause?: ClaimEndCause;
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
			/** The board's address before this write, when it renamed the board (ADR 0036). */
			readonly renamedFrom?: SemanticBoardAddress;
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
 * @param vault The vault root the board lives in.
 * @param key The board's canonical key.
 * @param writer The writer as stated.
 * @returns The identity to hold the lease under, or the refusal.
 */
function admit(
	vault: string,
	key: string,
	writer: SemanticWriter,
): Admission | { readonly ok: false; readonly problem: string; readonly cause: ClaimEndCause } {
	if (writer.kind !== "agent") {
		return { ok: true, id: writer.id ?? `pane-${mintId()}`, claimed: false };
	}
	const lost = takeClaimRevocation(vault, key);
	if (lost !== null) {
		const problem = `${lost.ended}, so your claim has ended; claim the board again before writing`;
		return { ok: false, problem, cause: lost.cause };
	}
	const claim = claimWriterId(vault, key);
	return claim === null
		? { ok: true, id: `agent-${mintId()}`, claimed: false }
		: { ok: true, id: claim, claimed: true };
}

/** How a write's checks read the board it is about. */
type BoardReader = (vault: string, location: SemanticBoardLocation) => SemanticBoardRead;

/**
 * The board as it stands, ready for the transition, or the refusal a caller
 * gets instead. A board that is simply not there yet is not a refusal: that is
 * what a create command expects to find.
 * @param vault The vault root the board lives in.
 * @param location Where the board lives.
 * @param expected The version the writer stated, when it stated one.
 * @param readBoard How the board is read: under its lease, which persists a
 * migration it awaits, unless the caller holds none and writes nothing.
 * @returns The board and its version, or why the write cannot go ahead.
 */
function boardBefore(
	vault: string,
	location: SemanticBoardLocation,
	expected: number | undefined,
	readBoard: BoardReader = readSemanticBoardAtUnderLease,
):
	| { readonly ok: true; readonly board: SemanticBoard | null; readonly version: number | null }
	| SemanticWriteRejection {
	const read = readBoard(vault, location);
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
 * behind for somebody to wonder about. A board whose name changed has its file
 * moved to where the new name lives as part of the same write.
 * @param moved Where the board is written, and where its file was when it moves.
 * @param board The board as it should now be.
 * @param previousVersion The version it was at before this write.
 * @param candidate What the command reported beside the board: every draft's answer and the notices the write answers with.
 * @param candidate.descendants What every draft under the change did about it.
 * @param candidate.notices What the command did that the answer should say.
 * @returns What the write did.
 */
function persisted(
	moved: Relocation,
	board: SemanticBoard,
	previousVersion: number | null,
	candidate: {
		readonly descendants?: readonly DescendantOutcome[];
		readonly notices?: readonly WriteNotice[];
	},
): LeasedWriteResult {
	const { location } = moved;
	const descendants = candidate.descendants ?? [];
	const notices = candidate.notices ?? [];
	writeBoardFile(moved, board);
	const warnings = notices.map((notice) => ({
		severity: "warning" as const,
		code: notice.code,
		file: location.file,
		path: notice.path,
		board: board.name,
		message: notice.message,
	}));
	return {
		outcome: "applied",
		board,
		location,
		previousVersion,
		descendants,
		warnings,
		...renamedFrom(moved),
	};
}

/**
 * Apply one command to the board on disk, inside the lease.
 *
 * This is the synchronous pass: read, check, apply, validate, stamp, write.
 * Every early return leaves the file exactly as it was.
 * @param location Where the board lives.
 * @param command The stated command.
 * @param at The timestamp to stamp the write with.
 * @param heldAs The identity the board is held under, which a rename holds the new name under too.
 * @returns What the write did.
 */
function applyUnderLease(
	location: SemanticBoardLocation,
	command: SemanticWriteCommand,
	at: string,
	heldAs: string,
): LeasedWriteResult {
	const missing = missingVersionRefusal(location, command);
	if (missing !== null) {
		return missing;
	}
	const before = boardBefore(command.vault, location, command.expectedVersion);
	if (!("ok" in before)) {
		return before;
	}
	const candidate = command.transition.apply(before.board, at);
	if (!candidate.ok) {
		return rejected(location, before.version, candidate.code, candidate.problem);
	}
	const moved = relocation(command.vault, location, before.board, candidate.board);
	const checked = acceptable(moved.location, command, before.board, candidate.board, at);
	if (!("board" in checked)) {
		return { ...checked, version: before.version };
	}
	const written = underNewName(
		command.vault,
		moved,
		{ id: heldAs, kind: command.writer.kind },
		() => persisted(moved, checked.board, before.version, candidate),
	);
	return "outcome" in written
		? written
		: rejected(location, before.version, written.code, written.problem);
}

/**
 * Whether the board a command produced may be written: it is coherent, and it
 * is the board this address names.
 * @param location Where it would be written.
 * @param command The stated command, for a refusal to say what it was doing.
 * @param before The family before this command.
 * @param produced The board the transition produced.
 * @param at The timestamp to stamp it with.
 * @returns The board, or why it may not be written.
 */
function acceptable(
	location: SemanticBoardLocation,
	command: SemanticWriteCommand,
	before: SemanticBoard | null,
	produced: SemanticBoard,
	at: string,
): { readonly board: SemanticBoard } | Omit<SemanticWriteRejection, "version"> {
	const configured = readSemanticBoardConfiguration(command.vault);
	const accepted = acceptedBoard(
		before,
		produced,
		at,
		configured.ok ? configured.configuration : null,
	);
	if ("problem" in accepted) {
		return {
			outcome: "rejected",
			code: "INVALID_CONTENT",
			problem: `refusing to ${command.transition.summary}: ${accepted.problem}`,
			location,
		};
	}
	return misaddressedRefusal(location, accepted.board) ?? { board: accepted.board };
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

/** Who is asking for a board's lease, and for which board. */
type BoardLeaseAsk = Pick<SemanticWriteCommand, "vault" | "board" | "writer" | "signal">;

/**
 * How the lease is asked for: the board's key, the identity the write runs
 * under, and the writer's own words about what it is doing.
 * @param key The board's canonical key.
 * @param ask Who is asking.
 * @param admission The identity admitted for this write.
 * @returns The lock request.
 */
function leaseRequest(key: string, ask: BoardLeaseAsk, admission: Admission): LockRequest {
	return {
		vault: ask.vault,
		board: key,
		holder: {
			id: admission.id,
			kind: ask.writer.kind,
			...(ask.writer.reason === undefined ? {} : { reason: ask.writer.reason }),
			...(admission.claimed ? { claimed: true } : {}),
		},
		...(ask.signal === undefined ? {} : { signal: ask.signal }),
	};
}

/**
 * Whether what a pass answered is a refusal.
 * @param result What the pass answered.
 * @param result.outcome What the pass did, or that it refused.
 * @returns True for a refusal.
 */
function isRejection(result: { readonly outcome: string }): result is SemanticWriteRejection {
	return result.outcome === "rejected";
}

/**
 * Run one synchronous pass over a board under its lease, and say which
 * identity held it.
 *
 * Every change to a board comes through here, a write or a discard alike, so
 * admission, the lease and the refusal a held board gets are made once.
 * @param ask Who is asking, and for which board.
 * @param pass What to do once the board is held.
 * @returns What the pass did and the identity it held the board under, or why it did nothing.
 * @throws {Error} When the board name is not usable or would escape the vault.
 */
async function underBoardLease<Done extends { readonly outcome: "applied" | "discarded" }>(
	ask: BoardLeaseAsk,
	pass: (location: SemanticBoardLocation, heldAs: string) => Done | SemanticWriteRejection,
): Promise<(Done & { readonly heldAs: string }) | SemanticWriteRejection> {
	// The lease is taken on the key of the board the name answers to: the board
	// that carries it, or the one that carried it before a rename (ADR 0036),
	// and otherwise the name's own key, computed from the name alone. The file is
	// located again only once the lease is held, so two processes creating
	// "Payments" and "payments" on a case-sensitive filesystem take one lease
	// in turn rather than resolving two absent paths of their own (ADR 0010).
	const address = resolveSemanticBoard(ask.board, ask.vault);
	const admission = admit(ask.vault, address.key, ask.writer);
	if (!admission.ok) {
		const refusal = rejected({ ...address, file: "" }, null, "CLAIM_REVOKED", admission.problem);
		return { ...refusal, cause: admission.cause };
	}
	try {
		const result = await withBoardLock(leaseRequest(address.key, ask, admission), () =>
			pass(locateSemanticBoard(address.name, ask.vault), admission.id),
		);
		// Said here rather than carried through the pass inside the lease: the pass
		// reads, checks, applies and writes, and an identity it takes but never uses
		// is one more thing a reader of it has to account for. This is a fact about
		// the lease, so it is reported where the lease was taken.
		return isRejection(result) ? result : { ...result, heldAs: admission.id };
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

/**
 * Change one board.
 * @param command The stated command.
 * @returns What the write did, or why it did nothing.
 * @throws {Error} When the board name is not usable or would escape the vault.
 */
async function writeSemanticBoard(command: SemanticWriteCommand): Promise<SemanticWriteResult> {
	const at = new Date().toISOString();
	return underBoardLease(command, (location, heldAs) =>
		applyUnderLease(location, command, at, heldAs),
	);
}

export {
	type Admission,
	type BoardLeaseAsk,
	type BoardReader,
	type SemanticWriter,
	type SemanticWriteCommand,
	type SemanticWriteRejection,
	type SemanticWriteResult,
	admit,
	boardBefore,
	leaseRequest,
	rejected,
	underBoardLease,
	writeSemanticBoard,
};
