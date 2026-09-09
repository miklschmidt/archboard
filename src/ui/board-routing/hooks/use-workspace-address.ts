// The address bar over the workspace: it writes down what the panes show, and
// it restores what a direct load or a Back/Forward asks for.
//
// The address follows the note. A person's board open runs the shell's own
// command, the server answers it, the pane reports its new board, and only
// then is the address written. So a refused open changes no address, because
// it changed no pane. The address leads in exactly two places — the first
// load, and a history navigation — and there it issues the same open command
// the shell does.
//
// One open at a time, whoever asked. A restore holds the channel for its own
// steps; a person's gesture takes it before the shell sends theirs. That is
// what makes the last thing somebody asked for the last thing the server does,
// rather than a race between a restore already running and the click that
// interrupted it.
//
// A deliberate move pushes a history entry; everything else replaces one. Our
// own writes always describe a workspace that is on screen and settled, so
// their plan is empty and the guard below cannot block them.
//
// The reconciliation is external state, driven by the effect whenever the
// workspace or the address has changed, and by the answers to what it asked.

import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useRouter, useRouterState } from "@tanstack/react-router";

import {
	boardIn,
	panesAtRisk,
	planFor,
	planIsEmpty,
	sameAddress,
	settledAddress,
	type WorkspaceAddress,
} from "@/ui/board-routing/address";
import {
	createDeliberateNavigation,
	type DeliberateNavigation,
	type NavigationIntent,
} from "@/ui/board-routing/intent";
import {
	abandonRestore,
	advanceRestore,
	createRestore,
	openAnswered,
	restoreOutstanding,
	retargetRestore,
	type PendingOpen,
	type Restore,
	type RestoreStep,
} from "@/ui/board-routing/restore";
import {
	addressFromSearch,
	searchFromAddress,
	validateWorkspaceSearch,
} from "@/ui/board-routing/search";
import type { WorkspacePort } from "@/ui/board-routing/contracts";

/** What a person's own board open reports back when it is over. */
interface NavigationClaim {
	/** The command finished; what it did to the workspace is the person's move. */
	readonly done: () => void;
	/** The command did not finish, so nothing moved. */
	readonly failed: () => void;
}

/** What the shell tells the address bar about the person's own gestures. */
interface WorkspaceAddressing {
	/**
	 * A person changed the workspace themselves, without asking the server: they
	 * opened or closed a pane. The change pushes a history entry.
	 */
	readonly expect: (intent: NavigationIntent) => void;
	/**
	 * A person is about to have the shell open a board. Ends any restore and
	 * waits until the address bar has nothing outstanding, so theirs is the last
	 * command the server is given.
	 * @returns Where to report that command's outcome.
	 */
	readonly claim: (intent: NavigationIntent) => Promise<NavigationClaim>;
	/** A gesture that never became a command. */
	readonly clear: () => void;
}

/** The router this hook writes through. */
type BoardRouter = ReturnType<typeof useRouter>;

/**
 * Everything the reconciliation reads, kept current by the effect so that an
 * answer arriving between renders works from what the last render knew.
 */
interface Reconciliation {
	restore: Restore;
	displayed: WorkspaceAddress;
	wanted: WorkspaceAddress;
	port: WorkspacePort;
	router: BoardRouter;
	readonly deliberate: DeliberateNavigation;
	/** A person's open the shell is sending; nothing else is sent under it. */
	person: NavigationIntent | null;
	/** Who is waiting for the channel to be free. */
	readonly waiting: (() => void)[];
}

/**
 * Whether anything is on its way that will change the workspace again.
 * @param state The reconciliation.
 * @returns True while a command is outstanding.
 */
function outstanding(state: Reconciliation): boolean {
	return state.person !== null || restoreOutstanding(state.restore);
}

/**
 * Whether every open pane has said what board it holds. Half a workspace is
 * never written down: a pane that has not reached the server yet would be
 * published as a pane on no board.
 * @param address The displayed address.
 * @returns True when the whole workspace is known.
 */
function isSettled(address: WorkspaceAddress): boolean {
	return address.panes.length > 0 && address.panes.every((pane) => pane.boardKey !== null);
}

/**
 * Write the workspace down when the address no longer says what is on screen.
 * A move the person asked for pushes a history entry; anything else replaces
 * the one they are on.
 * @param state The reconciliation.
 */
function publishAddress(state: Reconciliation): void {
	const { displayed, wanted } = state;
	if (!isSettled(displayed) || sameAddress(displayed, wanted)) {
		return;
	}
	void state.router.navigate({
		to: "/",
		search: searchFromAddress(displayed),
		replace: !state.deliberate.settle(displayed),
	});
}

/**
 * How a restore reaches the workspace.
 * @param state The reconciliation.
 * @returns The commands, over whatever the last render knew.
 */
function commandsOver(state: Reconciliation) {
	return {
		/**
		 * Close, add or focus a pane.
		 * @param step The step.
		 * @returns Whether the workspace changed.
		 */
		apply: (step: RestoreStep): boolean => {
			if (step.kind === "close") {
				return state.port.closePane(step.paneId);
			}
			if (step.kind === "add") {
				return state.port.addPane();
			}
			return step.kind === "focus" ? state.port.selectPane(step.paneId) : false;
		},
		/**
		 * Point a pane at a board, and reconcile again once it has answered.
		 * @param pending The command, and the target that asked for it.
		 */
		open: (pending: PendingOpen): void => {
			void state.port.open(pending.paneId, pending.boardKey).then((outcome) => {
				state.restore = openAnswered(state.restore, pending, outcome.kind === "opened");
				reconcile(state);
				return outcome;
			});
		},
	};
}

/**
 * Bring the address and the panes back into agreement, and let anybody waiting
 * for the channel have it once nothing is on its way.
 * @param state The reconciliation.
 */
function reconcile(state: Reconciliation): void {
	if (state.person === null && !state.restore.done) {
		state.restore = advanceRestore(state.restore, state.displayed, state.port, commandsOver(state));
	}
	if (outstanding(state)) {
		return;
	}
	for (const waiter of state.waiting.splice(0)) {
		waiter();
	}
	if (state.restore.done) {
		publishAddress(state);
	}
}

/**
 * A person's own board open, once the channel is theirs.
 * @param state The reconciliation.
 * @param intent What they asked for.
 * @returns Where to report the command's outcome.
 */
function claimFor(state: Reconciliation, intent: NavigationIntent): NavigationClaim {
	state.person = intent;
	return {
		/** The command finished. */
		done: (): void => {
			state.person = null;
			// A command that succeeded and moved nothing is over: the pane was
			// already showing what they asked for, so there is no history entry to
			// make and nothing left to wait for.
			if (intent.kind === "board" && boardIn(state.displayed, intent.paneId) === intent.from) {
				state.deliberate.clear();
			}
			reconcile(state);
		},
		/** The command did not finish. */
		failed: (): void => {
			state.person = null;
			state.deliberate.clear();
			reconcile(state);
		},
	};
}

/**
 * The address bar. The port must be stable across renders that change nothing
 * about the workspace; the application memoises it over its own owners.
 * @param port The workspace it addresses.
 * @returns The seam a person's gestures announce themselves through.
 */
function useWorkspaceAddress(port: WorkspacePort): WorkspaceAddressing {
	const router = useRouter();
	const search = useRouterState({
		/**
		 * The search parameters of the location the router is on.
		 * @param state The router state.
		 * @returns The parsed search.
		 */
		select: (state) => state.location.search,
	});
	const displayed = useMemo(() => settledAddress(port.displayed), [port.displayed]);
	const wanted = useMemo(() => addressFromSearch(validateWorkspaceSearch(search)), [search]);
	const [deliberate] = useState(createDeliberateNavigation);
	// The reconciliation is made from the first render, which is before anything
	// has been published, so the address it restores is the one the tab opened on.
	const state = useRef<Reconciliation>({
		restore: createRestore(wanted),
		displayed,
		wanted,
		port,
		router,
		deliberate,
		person: null,
		waiting: [],
	});

	useEffect(() => {
		const current = state.current;
		current.displayed = displayed;
		current.wanted = wanted;
		current.port = port;
		current.router = router;
		reconcile(current);
	}, [displayed, port, router, wanted]);

	// A history navigation is the other place the address leads. Our own writes
	// arrive as PUSH and REPLACE and are never restored over.
	useEffect(
		() =>
			router.history.subscribe(({ location, action }) => {
				if (action.type === "PUSH" || action.type === "REPLACE") {
					return;
				}
				const current = state.current;
				const asked = router.options.parseSearch(location.search);
				current.restore = retargetRestore(
					current.restore,
					addressFromSearch(validateWorkspaceSearch(asked)),
				);
				reconcile(current);
			}),
		[router],
	);

	// The guard, before anything moves. A navigation that would take a pane's
	// board away while that canvas holds work the note has not got is refused:
	// the workspace and the address both stay as they are, and the pane's own
	// recovery is what the person answers next.
	useBlocker({
		enableBeforeUnload: false,
		/**
		 * Whether this navigation must be refused.
		 * @param args The navigation.
		 * @param args.next The location asked for.
		 * @returns True to refuse it.
		 */
		shouldBlockFn: ({ next }) => {
			const asked = addressFromSearch(validateWorkspaceSearch(next.search));
			const plan = planFor(displayed, asked, port.paneIds);
			if (planIsEmpty(plan)) {
				return false;
			}
			const verdict = port.guard(panesAtRisk(plan));
			if (verdict.kind === "clear") {
				return false;
			}
			port.reportBlocked(verdict);
			return true;
		},
	});

	return useMemo(
		() => ({
			/**
			 * A person changed the workspace themselves.
			 * @param intent What they asked for.
			 */
			expect: (intent: NavigationIntent): void => {
				const current = state.current;
				current.restore = abandonRestore(current.restore);
				deliberate.expect(intent);
			},
			/**
			 * A person is about to have the shell open a board.
			 * @param intent What they asked for.
			 * @returns Where to report the outcome, once the command may be sent.
			 */
			claim: (intent: NavigationIntent): Promise<NavigationClaim> => {
				const current = state.current;
				current.restore = abandonRestore(current.restore);
				deliberate.expect(intent);
				if (!outstanding(current)) {
					return Promise.resolve(claimFor(current, intent));
				}
				return new Promise<NavigationClaim>((resolve) => {
					current.waiting.push(() => resolve(claimFor(current, intent)));
				});
			},
			/** The gesture never became a command. */
			clear: (): void => {
				deliberate.clear();
			},
		}),
		[deliberate],
	);
}

export { useWorkspaceAddress, type NavigationClaim, type WorkspaceAddressing };
