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
	return { wanted, target: 1, attempted: new Set(), unreachable: [], done: false };
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
	return { wanted, target: restore.target + 1, attempted: new Set(), unreachable: [], done: false };
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
 * Remember a board this target asked for and could not reach, so it can be
 * named. An answer to a target that has been replaced says nothing about where
 * the person is now, so it is not recorded.
 * @param restore The restore.
 * @param target The target that asked.
 * @param boardKey The board that could not be reached.
 * @returns The restore, with that board named when it is still this target's.
 */
function boardUnreachable(restore: Restore, target: number, boardKey: string): Restore {
	return target === restore.target
		? { ...restore, unreachable: [...restore.unreachable, boardKey] }
		: restore;
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
	/** Take the command slot and point a pane at a board. */
	readonly open: (paneId: string, boardKey: string) => void;
}

/** Where a restore got to, and whether anything more can be done right now. */
interface RestoreProgress {
	readonly restore: Restore;
	/** True when the restore is not finished and cannot go further yet. */
	readonly waiting: boolean;
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
 * @returns Where it got to, and whether it can go further right now.
 */
function advanceRestore(
	restore: Restore,
	displayed: WorkspaceAddress,
	port: WorkspacePort,
	commands: RestoreCommands,
): RestoreProgress {
	let current = restore;
	while (!current.done) {
		const outcome = restoreOutcome(current, displayed, port);
		if (outcome.kind === "wait") {
			return { restore: current, waiting: true };
		}
		if (outcome.kind !== "step") {
			reportRestoreEnd(port, current, outcome);
			return { restore: { ...current, done: true }, waiting: false };
		}
		current = { ...current, attempted: new Set(current.attempted).add(outcome.key) };
		if (outcome.step.kind === "open") {
			commands.open(outcome.step.paneId, outcome.step.boardKey);
			return { restore: current, waiting: true };
		}
		if (commands.apply(outcome.step)) {
			return { restore: current, waiting: true };
		}
	}
	return { restore: current, waiting: false };
}

export {
	abandonRestore,
	advanceRestore,
	boardUnreachable,
	createRestore,
	nextRestoreStep,
	reportRestoreEnd,
	restoreOutcome,
	retargetRestore,
	stepKey,
	type Restore,
	type RestoreProgress,
	type RestoreCommands,
	type RestoreOutcome,
	type RestoreStep,
};
