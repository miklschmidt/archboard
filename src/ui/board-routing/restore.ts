// Restoring a workspace: the address asks for panes and boards, and each step
// is applied through the commands the shell already uses.
//
// Three rules keep a restore honest about a workspace it cannot change itself.
//
// It reads what is on screen once per render, so it applies one step that
// changes something and then waits for the render that change causes. A
// command the shell refuses changes nothing, which leaves that reading good,
// so the next step may follow at once; that is why each command says whether
// it changed anything.
//
// It holds at most one open at a time, and an open is not over when the server
// answers it: it is over when the pane is seen to have moved. The answer says
// the note was read; the pane showing it is a separate message. Until then the
// address is not written, or it would be written from a workspace that is
// about to change again.
//
// An answer is recorded only against the target that asked for it. A person
// moving on does not make an older answer theirs.
//
// A step is remembered once applied, so a step whose effect changed nothing is
// not applied twice and a restore always terminates.

import {
	boardIn,
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

/** An open a restore has asked for and not yet seen through. */
interface PendingOpen {
	/** Which target asked. An answer to an older one is not this one's. */
	readonly target: number;
	readonly paneId: string;
	readonly boardKey: string;
	/** What that pane was showing when it was asked, so its move is observable. */
	readonly from: string | null;
}

/** The restore, as it stands. */
interface Restore {
	/** The address being restored. */
	readonly wanted: WorkspaceAddress;
	/** Which target this is. */
	readonly target: number;
	/** The steps applied for this target. */
	readonly attempted: Set<string>;
	/** The boards this target asked for and could not reach. */
	readonly unreachable: readonly string[];
	/** The open the server has not answered, or null. */
	readonly pending: PendingOpen | null;
	/** The open the server answered, whose pane has not been seen to move. */
	readonly adopting: PendingOpen | null;
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
	return {
		wanted,
		target: 1,
		attempted: new Set(),
		unreachable: [],
		pending: null,
		adopting: null,
		done: false,
	};
}

/**
 * Point the restore somewhere else: a history navigation asked for another
 * workspace. What was tried for the last target says nothing about this one;
 * an open still in the air is carried over, because it is still in the air.
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
		adopting: restore.adopting,
		done: false,
	};
}

/**
 * Stop restoring: the person said where they want to be, so the address bar
 * follows them instead. An open still in the air is still in the air.
 * @param restore The restore.
 * @returns The settled restore.
 */
function abandonRestore(restore: Restore): Restore {
	return { ...restore, done: true };
}

/**
 * Whether anything this restore asked for is still in the air. The address is
 * not written while it is: the workspace is about to change again.
 * @param restore The restore.
 * @returns True while an open is unanswered or its pane has not moved.
 */
function restoreOutstanding(restore: Restore): boolean {
	return restore.pending !== null || restore.adopting !== null;
}

/**
 * Record the answer to an open. A board the target asked for and could not
 * reach is remembered so it can be named; one that was opened is waited on
 * until its pane is seen to show it. An answer to a target that has been
 * replaced is only released, never recorded.
 * @param restore The restore.
 * @param pending The open that was answered.
 * @param reached Whether the board was opened.
 * @returns The restore with that answer taken.
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
		adopting: reached ? pending : null,
		unreachable:
			reached || stale ? restore.unreachable : [...restore.unreachable, pending.boardKey],
	};
}

/**
 * Let go of an open whose pane has been seen to move, or whose pane is out of
 * contact and so cannot be waited on any longer.
 * @param restore The restore.
 * @param displayed What is on screen now.
 * @param port The workspace.
 * @returns The restore, with that open let go when it is over.
 */
function adoptionObserved(
	restore: Restore,
	displayed: WorkspaceAddress,
	port: WorkspacePort,
): Restore {
	const { adopting } = restore;
	if (adopting === null) {
		return restore;
	}
	// The board the pane lands on is the server's answer, not the request's: an
	// address is normalised on the way through. That the pane moved at all is
	// what says the open arrived.
	const moved = boardIn(displayed, adopting.paneId) !== adopting.from;
	return moved || !port.ready(adopting.paneId) ? { ...restore, adopting: null } : restore;
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
 * has not got.
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
	if (restoreOutstanding(restore)) {
		return { kind: "wait" };
	}
	const plan = planFor(displayed, restore.wanted, port.paneIds);
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
	/**
	 * Close, add or focus a pane.
	 * @returns Whether the workspace changed.
	 */
	readonly apply: (step: RestoreStep) => boolean;
	/** Point a pane at a board; the answer comes back to `openAnswered`. */
	readonly open: (pending: PendingOpen) => void;
}

/**
 * Take the restore as far as this reading of the workspace allows.
 *
 * One step that changes something, and then it waits: the workspace it was
 * read from is now out of date, and the render that change causes brings it
 * back. Steps the shell refuses change nothing, so they are taken off the plan
 * and the next one is tried against the same, still accurate, reading.
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
	let current = adoptionObserved(restore, displayed, port);
	while (!current.done) {
		const outcome = restoreOutcome(current, displayed, port);
		if (outcome.kind === "wait") {
			return current;
		}
		if (outcome.kind !== "step") {
			reportRestoreEnd(port, current, outcome);
			return { ...current, done: true };
		}
		const attempted = new Set(current.attempted).add(outcome.key);
		if (outcome.step.kind === "open") {
			// Outstanding before it is asked, so a render between the request and
			// its answer cannot find this restore finished.
			const pending: PendingOpen = {
				target: current.target,
				paneId: outcome.step.paneId,
				boardKey: outcome.step.boardKey,
				from: boardIn(displayed, outcome.step.paneId),
			};
			commands.open(pending);
			return { ...current, attempted, pending };
		}
		current = { ...current, attempted };
		if (commands.apply(outcome.step)) {
			return current;
		}
	}
	return current;
}

export {
	abandonRestore,
	adoptionObserved,
	advanceRestore,
	createRestore,
	nextRestoreStep,
	openAnswered,
	reportRestoreEnd,
	restoreOutcome,
	restoreOutstanding,
	retargetRestore,
	stepKey,
	type PendingOpen,
	type Restore,
	type RestoreCommands,
	type RestoreOutcome,
	type RestoreStep,
};
