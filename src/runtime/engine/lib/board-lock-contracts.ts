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
	id: string;
	kind: HolderKind;
	since: string;
	until: string;
	process: string;
	reason?: string;
	claimed?: boolean;
}

interface LockRecord extends LockHolder {
	/** Unique acquisition proof; pid alone cannot distinguish two attempts. */
	token: string;
	/** Exact note hash committed inside this lease; never exposed as holder state. */
	committedHash?: string;
}

/** One-use commit proof left by a released writer for its observed successor. */
interface LockHandoff {
	id: string;
	process: string;
	since: string;
	token: string;
	hash: string;
}

interface LockHold {
	holder: LockHolder;
	/** Disk lease identity used only to stamp a successful note commit. */
	leaseToken: string;
	/** Exact committed hash of the immediately preceding lease this waiter saw. */
	predecessorHash?: string;
	/** False when this call merely joined a reentrant hold it must not release. */
	created: boolean;
}

interface LockRequest {
	/** Normalized by the acquisition owner so aliases name one mutex. */
	board: string;
	holder: { id: string; kind: HolderKind; reason?: string; claimed?: boolean };
	/** Bounded wait; zero asks once. Human gesture holds use a shorter cap. */
	waitMs?: number;
	/** Lease duration, distinct from a claim's campaign deadline. */
	leaseMs?: number;
	/** Only a human content hold sets this, and it revokes claims, never writes. */
	revokeClaim?: boolean;
	/** Cancels waiting, never a synchronous write already inside the boundary. */
	signal?: AbortSignal;
}

type LockSink = (board: string, holder: LockHolder | null) => void;

interface Claim {
	board: string;
	holder: LockHolder;
	/** Claim campaign deadline, independent from the renewable short lease. */
	expires: string;
}

/** A claim taken back, retained until the affected agent is told exactly once. */
interface ClaimRevocation {
	claim: Claim;
	by: LockHolder | null;
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

function describeHold(board: string, holder: LockHolder | null, waitedMs: number): string {
	const waited = `Waited ${seconds(waitedMs)}.`;
	if (!holder) {
		return `Board "${board}" is being written by somebody else and did not come free. ${waited}`;
	}
	const held = seconds(Math.max(0, Date.now() - Date.parse(holder.since)));
	const who =
		holder.kind === "human"
			? "the person at the canvas"
			: holder.claimed
				? `an agent that has claimed it${holder.reason ? ` (${holder.reason})` : ""}`
				: holder.reason
					? `an agent (${holder.reason})`
					: "an agent";
	const where = holder.process === processName() ? "" : ` on another canvas (${holder.process})`;
	return `Board "${board}" is held by ${who}${where}, since ${clock(holder.since)} (${held}). ${waited}`;
}

class BoardHeldError extends Error {
	readonly code = "BOARD_HELD";
	readonly board: string;
	readonly holder: LockHolder | null;
	readonly waitedMs: number;

	constructor(board: string, holder: LockHolder | null, waitedMs: number) {
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
