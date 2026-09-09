// Restoring a workspace: the address asks for panes and boards, and each step
// is applied through the commands the shell already uses. What to do next is
// decided here, given what is on screen; the hook applies it.
//
// There is one restore for the tab's life, retargeted whenever the address
// asks for somewhere else, and it holds at most one outstanding command. That
// is what keeps a late answer honest: an open cannot be dispatched while
// another is unanswered, so the server sees them in the order they were asked
// for, and an answer is only recorded against the target that asked for it.
// A restore is never finished while its own command is still outstanding —
// the board may turn out to be unreachable, and that has to be said before the
// address settles on what is shown.
//
// A step is remembered once applied, so a step whose effect changed nothing is
// not applied twice and a restore always terminates.

import {
	panesAtRisk,
	planFor,
	planIsEmpty,
	type AddressPlan,
	type WorkspaceAddress,
} from "@/ui/board-routing/address";
import type { NavigationBlock, WorkspacePort } from "@/ui/board-routing/contracts";

/** One thing a restore does next. */
type RestoreStep =
	| { readonly kind: "close"; readonly paneId: string }
	| { readonly kind: "add" }
	| { readonly kind: "open"; readonly paneId: string; readonly boardKey: string }
	| { readonly kind: "focus"; readonly paneId: string };

/** The open a restore is waiting on, and which target asked for it. */
interface PendingOpen {
	readonly target: number;
	readonly boardKey: string;
}

/** The restore, as it stands. */
interface Restore {
	/** The address being restored. */
	readonly wanted: WorkspaceAddress;
	/** Which target this is. An answer from an older one is not this one's. */
	readonly target: number;
	/** The steps applied for this target. */
	readonly attempted: Set<string>;
	/** The boards this target asked for and could not reach. */
	readonly unreachable: readonly string[];
	/** The one command outstanding, or null. */
	readonly pending: PendingOpen | null;
	/** Whether this target has settled. */
	readonly done: boolean;
}

/** What a restore does now. */
type RestoreOutcome =
	| { readonly kind: "step"; readonly step: RestoreStep; readonly key: string }
	| { readonly kind: "wait" }
	| { readonly kind: "blocked"; readonly block: NavigationBlock }
	| { readonly kind: "done" };

/**
 * The restore a tab opens with.
 * @param wanted The address to restore.
 * @returns The restore.
 */
function createRestore(wanted: WorkspaceAddress): Restore {
	return { wanted, target: 1, attempted: new Set(), unreachable: [], pending: null, done: false };
}

/**
 * Point the restore somewhere else: a history navigation asked for another
 * workspace. What was tried for the last target says nothing about this one;
 * an outstanding command is carried over, because it is still outstanding.
 * @param restore The restore.
 * @param wanted The address to restore now.
 * @returns The retargeted restore.
 */
function retargetRestore(restore: Restore, wanted: WorkspaceAddress): Restore {
	return {
		wanted,
		target: restore.target + 1,
		attempted: new Set(),
		unreachable: [],
		pending: restore.pending,
		done: false,
	};
}

/**
 * Stop restoring: the person said where they want to be, so the address bar
 * follows them instead. An outstanding command is still outstanding.
 * @param restore The restore.
 * @returns The settled restore.
 */
function abandonRestore(restore: Restore): Restore {
	return { ...restore, done: true };
}

/**
 * Record the answer to an open. A board the target asked for and could not
 * reach is remembered so it can be named; an answer to a target that has been
 * replaced is only released, never recorded, because it says nothing about
 * where the person is now.
 * @param restore The restore.
 * @param pending The open that was answered.
 * @param reached Whether the board was opened.
 * @returns The restore with that command released.
 */
function openAnswered(restore: Restore, pending: PendingOpen, reached: boolean): Restore {
	// An answer is taken once. Anything else is an answer already taken, or one
	// to a command this restore is no longer waiting on.
	if (restore.pending !== pending) {
		return restore;
	}
	const stale = pending.target !== restore.target;
	return {
		...restore,
		pending: null,
		unreachable:
			reached || stale ? restore.unreachable : [...restore.unreachable, pending.boardKey],
	};
}

/**
 * The key a step is remembered by, so that a step whose effect did not change
 * the workspace is not applied again.
 * @param step The step.
 * @param displayed What is on screen now.
 * @returns The key.
 */
function stepKey(step: RestoreStep, displayed: WorkspaceAddress): string {
	switch (step.kind) {
		case "close":
			return `close:${step.paneId}`;
		// Which pane the shell opens is the shell's choice, so an add is
		// remembered by the number of panes it was made from.
		case "add":
			return `add:${displayed.panes.length}`;
		case "open":
			return `open:${step.paneId}:${step.boardKey}`;
		default:
			return `focus:${step.paneId}`;
	}
}

/**
 * Everything a plan asks for, in the order it is applied.
 *
 * Panes before boards before focus, and a pane is added before another is
 * closed: going from pane A alone to pane B alone has to have B before A can
 * go, since the last pane cannot be closed and closing A would be refused.
 * @param plan What the address asks for.
 * @returns The steps.
 */
function stepsOf(plan: AddressPlan): readonly RestoreStep[] {
	const adds = plan.adds > 0 ? [{ kind: "add" } as const] : [];
	const closes = plan.closes.map((paneId) => ({ kind: "close", paneId }) as const);
	const opens = plan.opens.map((open) => ({ kind: "open", ...open }) as const);
	const focus = plan.focus === null ? [] : [{ kind: "focus", paneId: plan.focus } as const];
	return [...adds, ...closes, ...opens, ...focus];
}

/**
 * The first step of a plan that has not been tried yet.
 * @param plan What the address asks for.
 * @param displayed What is on screen now.
 * @param attempted The keys of the steps already applied.
 * @param ready Whether a pane has reached the server and can be addressed.
 * @returns The step to apply, or whether to wait or stop.
 */
function nextRestoreStep(
	plan: AddressPlan,
	displayed: WorkspaceAddress,
	attempted: ReadonlySet<string>,
	ready: (paneId: string) => boolean,
): RestoreOutcome {
	let waiting = false;
	for (const step of stepsOf(plan)) {
		const key = stepKey(step, displayed);
		if (attempted.has(key)) {
			continue;
		}
		// A pane with no client id has nothing the server can address; the
		// restore waits for its socket rather than opening into the wrong pane.
		if (step.kind === "open" && !ready(step.paneId)) {
			waiting = true;
			continue;
		}
		return { kind: "step", step, key };
	}
	return waiting ? { kind: "wait" } : { kind: "done" };
}

/**
 * What the restore does now.
 *
 * Every pane the remaining plan would close or move is preflighted before each
 * step, so a restore never half-applies over a canvas holding work the note
 * has not got. Nothing happens while a command is outstanding.
 * @param restore The restore.
 * @param displayed What is on screen now.
 * @param port The workspace.
 * @returns The outcome.
 */
function restoreOutcome(
	restore: Restore,
	displayed: WorkspaceAddress,
	port: WorkspacePort,
): RestoreOutcome {
	if (restore.pending !== null) {
		return { kind: "wait" };
	}
	const plan = planFor(displayed, restore.wanted);
	if (planIsEmpty(plan)) {
		return { kind: "done" };
	}
	const verdict = port.guard(panesAtRisk(plan));
	if (verdict.kind !== "clear") {
		return { kind: "blocked", block: verdict };
	}
	return nextRestoreStep(plan, displayed, restore.attempted, port.ready);
}

/**
 * Say how a restore ended, when there is anything to say. A blocked one names
 * the pane that refused; a finished one names the boards it could not reach,
 * which the address is about to be corrected to leave out.
 * @param port The workspace.
 * @param restore The restore that ended.
 * @param outcome How it ended.
 */
function reportRestoreEnd(port: WorkspacePort, restore: Restore, outcome: RestoreOutcome): void {
	if (outcome.kind === "blocked") {
		port.reportBlocked(outcome.block);
		return;
	}
	if (restore.unreachable.length > 0) {
		port.reportUnreachable(restore.unreachable);
	}
}

/** How a restore applies the one step it decided on. */
interface RestoreCommands {
	/** Close, add or focus a pane: the shell answers at once. */
	readonly apply: (step: RestoreStep) => void;
	/** Point a pane at a board; the answer comes back to `openAnswered`. */
	readonly open: (pending: PendingOpen, paneId: string) => void;
}

/**
 * Take the restore one step further.
 *
 * The restore is returned rather than changed in place, so the outstanding
 * command and the steps tried are part of what the caller renders from.
 * @param restore The restore.
 * @param displayed What is on screen now.
 * @param port The workspace.
 * @param commands How a step is applied.
 * @returns The restore as it now stands.
 */
function advanceRestore(
	restore: Restore,
	displayed: WorkspaceAddress,
	port: WorkspacePort,
	commands: RestoreCommands,
): Restore {
	const outcome = restoreOutcome(restore, displayed, port);
	if (outcome.kind === "wait") {
		return restore;
	}
	if (outcome.kind !== "step") {
		reportRestoreEnd(port, restore, outcome);
		return { ...restore, done: true };
	}
	const attempted = new Set(restore.attempted).add(outcome.key);
	if (outcome.step.kind !== "open") {
		commands.apply(outcome.step);
		return { ...restore, attempted };
	}
	// Outstanding before it is asked, so a render between the request and its
	// answer cannot find this restore finished.
	const pending: PendingOpen = { target: restore.target, boardKey: outcome.step.boardKey };
	commands.open(pending, outcome.step.paneId);
	return { ...restore, attempted, pending };
}

export {
	abandonRestore,
	advanceRestore,
	createRestore,
	nextRestoreStep,
	openAnswered,
	reportRestoreEnd,
	restoreOutcome,
	retargetRestore,
	stepKey,
	type PendingOpen,
	type Restore,
	type RestoreCommands,
	type RestoreOutcome,
	type RestoreStep,
};
