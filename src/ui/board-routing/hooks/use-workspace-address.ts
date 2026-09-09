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
// A deliberate move pushes a history entry; everything else replaces one. Our
// own writes always describe a workspace that is already on screen, so their
// plan is empty and the guard below cannot block them.
//
// The reconciliation is external state, kept in one box and driven from two
// places: the effect, whenever what is on screen or what the address says has
// changed, and the answer to the one command a restore has outstanding. There
// is no React state here to fall behind either of them.

import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useRouter, useRouterState } from "@tanstack/react-router";

import {
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

/** What the shell tells the address bar about the person's own gestures. */
interface WorkspaceAddressing {
	/** A person asked for this move; the change it produces pushes a history entry. */
	readonly expect: (intent: NavigationIntent) => void;
	/** That gesture failed; it is not a move any more. */
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
 * Bring the address and the panes back into agreement.
 *
 * A restore runs first, one step per settle: the plan is recomputed from what
 * is on screen each time, so a pane that arrives late, or a board an agent
 * moved underneath, is taken as it is rather than as it was when the address
 * was read. Once nothing is being restored, what is on screen is written down
 * — whether or not it is what was asked for, so the two never disagree.
 * @param state The reconciliation.
 */
function reconcile(state: Reconciliation): void {
	const commands = {
		/**
		 * Close, add or focus a pane.
		 * @param step The step.
		 */
		apply: (step: RestoreStep): void => {
			if (step.kind === "close") {
				state.port.closePane(step.paneId);
			} else if (step.kind === "add") {
				state.port.addPane();
			} else if (step.kind === "focus") {
				state.port.selectPane(step.paneId);
			}
		},
		/**
		 * Point a pane at a board, and reconcile again once it has answered.
		 * @param pending The command, and the target that asked for it.
		 * @param paneId The pane.
		 */
		open: (pending: PendingOpen, paneId: string): void => {
			void state.port.open(paneId, pending.boardKey).then((outcome) => {
				state.restore = openAnswered(state.restore, pending, outcome.kind === "opened");
				reconcile(state);
				return outcome;
			});
		},
	};
	// Each step is taken from the workspace as this render found it, so at most
	// one step per step actually moves anything; the rest come back here on the
	// render it caused. A step the shell refused changes nothing and would
	// otherwise stall the restore, so the loop takes it off the plan and goes on.
	while (!state.restore.done) {
		const next = advanceRestore(state.restore, state.displayed, state.port, commands);
		if (next === state.restore) {
			return;
		}
		state.restore = next;
		if (next.pending !== null) {
			return;
		}
	}
	publishAddress(state);
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
			}),
		[router, state],
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
			const plan = planFor(displayed, addressFromSearch(validateWorkspaceSearch(next.search)));
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
			 * A person asked for a move. It ends any restore still running: the
			 * person is now saying where they want to be.
			 * @param intent What they asked for.
			 */
			expect: (intent: NavigationIntent): void => {
				state.current.restore = abandonRestore(state.current.restore);
				deliberate.expect(intent);
			},
			/** The gesture failed. */
			clear: (): void => {
				deliberate.clear();
			},
		}),
		[deliberate],
	);
}

export { useWorkspaceAddress, type WorkspaceAddressing };
