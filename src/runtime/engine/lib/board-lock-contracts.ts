import os from "node:os";

type HolderKind = "human" | "agent";

/**
 * Who has a board, and until when.
 *
 * `id` is a pane id for a person, a per-write id for an ordinary agent write,
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
	/** Exact note hash committed inside this lease; never exposed as holder state. */
	readonly committedHash?: string;
}

/** One-use commit proof left by a released writer for its observed successor. */
interface LockHandoff {
	readonly id: string;
	readonly process: string;
	readonly since: string;
	readonly token: string;
	readonly hash: string;
}

interface LockHold {
	readonly holder: Readonly<LockHolder>;
	/** Disk lease identity used only to stamp a successful note commit. */
	readonly leaseToken: string;
	/** Exact committed hash of the immediately preceding lease this waiter saw. */
	readonly predecessorHash?: string;
	/** False when this call merely joined a reentrant hold it must not release. */
	readonly created: boolean;
}

interface LockRequest {
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
	/** Only a human content hold sets this, and it revokes claims, never writes. */
	readonly revokeClaim?: boolean;
	/** Cancels waiting, never a synchronous write already inside the boundary. */
	readonly signal?: Readonly<AbortSignal>;
}

type LockSink = (board: string, holder: Readonly<LockHolder> | null) => void;

interface Claim {
	readonly board: string;
	readonly holder: Readonly<LockHolder>;
	/** Claim campaign deadline, independent from the renewable short lease. */
	readonly expires: string;
}

/** A claim taken back, retained until the affected agent is told exactly once. */
interface ClaimRevocation {
	readonly claim: Readonly<Claim>;
	readonly by: Readonly<LockHolder> | null;
}

interface ClaimEntry {
	holder: LockHolder;
	expires: number;
	timer: ReturnType<typeof setInterval> | null;
}

function processName(): string {
	return `${os.hostname()}:${process.pid}`;
}

function seconds(ms: number): string {
	return `${(ms / 1000).toFixed(1)} s`;
}

function clock(iso: string): string {
	const at = new Date(iso);
	return Number.isNaN(at.getTime()) ? iso : at.toTimeString().slice(0, 8);
}

function describeWriter(holder: Readonly<LockHolder>): string {
	if (holder.kind === "human") {
		return "the person at the canvas";
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
	const where = holder.process === processName() ? "" : ` on another canvas (${holder.process})`;
	return `Board "${board}" is held by ${who}${where}, since ${clock(holder.since)} (${held}). ${waited}`;
}

/** A bounded lock wait ended while another holder still owned the board. */
class BoardHeldError extends Error {
	public readonly code = "BOARD_HELD";
	public readonly board: string;
	public readonly holder: Readonly<LockHolder> | null;
	public readonly waitedMs: number;

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
	type ClaimEntry,
	type ClaimRevocation,
	type HolderKind,
	type LockHandoff,
	type LockHold,
	type LockHolder,
	type LockRecord,
	type LockRequest,
	type LockSink,
	processName,
};
