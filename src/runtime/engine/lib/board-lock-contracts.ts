import os from "node:os";

type HolderKind = "human" | "agent";

/**
 * Who has a board, and until when.
 *
 * `id` is a pane id for a user, a per-write id for an ordinary agent write,
 * and the claim id for every write under a claim. That identity makes the lock
 * reentrant: asking again renews rather than blocks. `since` never moves on
 * renewal because refusals answer when the hold began, not its latest beat.
 */
interface LockHolder {
	readonly id: string;
	readonly kind: HolderKind;
	readonly since: string;
	readonly until: string;
	readonly process: string;
	readonly reason?: string;
	readonly claimed?: boolean;
}

interface LockRecord extends LockHolder {
	/** Unique acquisition proof; pid alone cannot distinguish two attempts. */
	readonly token: string;
}

interface LockHold {
	readonly holder: Readonly<LockHolder>;
	/** False when this call merely joined a reentrant hold it must not release. */
	readonly created: boolean;
}

interface LockRequest {
	/** The vault root the board lives in; the lease is a file under it. */
	readonly vault: string;
	/** Normalized by the acquisition owner so aliases name one mutex. */
	readonly board: string;
	readonly holder: Readonly<{
		id: string;
		kind: HolderKind;
		reason?: string;
		claimed?: boolean;
	}>;
	/** Bounded wait; zero asks once. Human gesture holds use a shorter cap. */
	readonly waitMs?: number;
	/** Lease duration, distinct from a claim's campaign deadline. */
	readonly leaseMs?: number;
	/**
	 * Only the user's explicit take-back sets this (ADR 0022). It ends a
	 * standing claim and never a per-write hold; a content gesture never sets
	 * it, because a claimed board is read-only to users until they ask.
	 */
	readonly revokeClaim?: boolean;
	/** Cancels waiting, never a synchronous write already inside the boundary. */
	readonly signal?: Readonly<AbortSignal>;
}

/** Hears who holds a board of a vault: the vault comes first because a name alone is ambiguous. */
type LockSink = (vault: string, board: string, holder: Readonly<LockHolder> | null) => void;

interface Claim {
	readonly board: string;
	readonly holder: Readonly<LockHolder>;
	/** Claim campaign deadline, independent from the renewable short lease. */
	readonly expires: string;
}

/**
 * Why a claim ended before its holder released it or its deadline came.
 *
 * - `taken-back`: a person used the take-back control (ADR 0022): on this
 *   server, or on another one while renewal found their take-back holding the lease.
 * - `held-by-another`: renewal found another writer's lease on the board.
 * - `lease-gone`: renewal found no lease at all: another process gave it up or
 *   removed it, such as a take-back through another server, which releases at once.
 */
type ClaimEndCause = "taken-back" | "held-by-another" | "lease-gone";

/** A claim that ended, retained until the affected agent is told exactly once. */
interface ClaimRevocation {
	readonly claim: Readonly<Claim>;
	readonly by: Readonly<LockHolder> | null;
	readonly cause: ClaimEndCause;
}

interface ClaimEntry {
	/** The vault the claimed board lives in. */
	vault: string;
	/** The claimed board's normalised key. */
	board: string;
	holder: LockHolder;
	expires: number;
	timer: ReturnType<typeof setInterval> | null;
}

/**
 * This server, as a lease names it: a host and a pid, so a refusal can say
 * the board is held on another machine.
 * @returns The process name.
 */
function processName(): string {
	return `${os.hostname()}:${process.pid}`;
}

/**
 * A duration as a user reads one.
 * @param ms The duration in milliseconds.
 * @returns The duration in seconds, to one decimal.
 */
function seconds(ms: number): string {
	return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * A moment as a wall clock, which is how a refusal says when a hold began.
 * @param iso The timestamp.
 * @returns The time of day, or the timestamp itself when it is not one.
 */
function clock(iso: string): string {
	const at = new Date(iso);
	return Number.isNaN(at.getTime()) ? iso : at.toTimeString().slice(0, 8);
}

/**
 * Who is holding the board, in the words a refusal uses: a user, an agent,
 * or an agent that has claimed it, with the reason it gave.
 * @param holder The holder.
 * @returns The description.
 */
function describeWriter(holder: Readonly<LockHolder>): string {
	if (holder.kind === "human") {
		return "the user at the canvas";
	}
	const claimed = Boolean(holder.claimed);
	if (claimed) {
		const hasReason = Boolean(holder.reason);
		return `an agent that has claimed it${hasReason ? ` (${holder.reason})` : ""}`;
	}
	const hasReason = Boolean(holder.reason);
	if (hasReason) {
		return `an agent (${holder.reason})`;
	}
	return "an agent";
}

/**
 * The sentence a bounded wait ends with: who has the board, since when, for
 * how long, on which server, and how long this caller waited.
 * @param board The board key.
 * @param holder Who has it, when the wait could still see them.
 * @param waitedMs How long this caller waited.
 * @returns The message.
 */
function describeHold(
	board: string,
	holder: Readonly<LockHolder> | null,
	waitedMs: number,
): string {
	const waited = `Waited ${seconds(waitedMs)}.`;
	if (!holder) {
		return `Board "${board}" is being written by somebody else and did not come free. ${waited}`;
	}
	const held = seconds(Math.max(0, Date.now() - Date.parse(holder.since)));
	const who = describeWriter(holder);
	const where = holder.process === processName() ? "" : ` on another server (${holder.process})`;
	return `Board "${board}" is held by ${who}${where}, since ${clock(holder.since)} (${held}). ${waited}`;
}

/** A bounded lock wait ended while another holder still owned the board. */
class BoardHeldError extends Error {
	public readonly code = "BOARD_HELD";
	public readonly board: string;
	public readonly holder: Readonly<LockHolder> | null;
	public readonly waitedMs: number;

	/**
	 * A refusal naming who has the board and how long this caller waited.
	 * @param board The board key.
	 * @param holder Who has it, when the wait could still see them.
	 * @param waitedMs How long this caller waited.
	 */
	public constructor(board: string, holder: Readonly<LockHolder> | null, waitedMs: number) {
		super(describeHold(board, holder, waitedMs));
		this.name = "BoardHeldError";
		this.board = board;
		this.holder = holder;
		this.waitedMs = waitedMs;
	}
}

export {
	BoardHeldError,
	type Claim,
	type ClaimEndCause,
	type ClaimEntry,
	type ClaimRevocation,
	type HolderKind,
	type LockHold,
	type LockHolder,
	type LockRecord,
	type LockRequest,
	type LockSink,
	processName,
};
