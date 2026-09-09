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

import { useCallback, useEffect, useMemo, useState } from "react";
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
	advanceRestore,
	restoreOf,
	type RestoreJob,
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

/** The router this hook writes through. */
type BoardRouter = ReturnType<typeof useRouter>;

/**
 * Write the workspace down when the address no longer says what is on screen.
 * A move the person asked for pushes a history entry; anything else replaces
 * the one they are on.
 * @param router The router.
 * @param deliberate The move the person asked for, if any.
 * @param displayed What is on screen.
 * @param wanted What the address says.
 */
function publishAddress(
	router: BoardRouter,
	deliberate: DeliberateNavigation,
	displayed: WorkspaceAddress,
	wanted: WorkspaceAddress,
): void {
	if (!isSettled(displayed) || sameAddress(displayed, wanted)) {
		return;
	}
	void router.navigate({
		to: "/",
		search: searchFromAddress(displayed),
		replace: !deliberate.settle(displayed),
	});
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
	const [deliberate] = useState(createDeliberateNavigation);
	const displayed = useMemo(() => settledAddress(port.displayed), [port.displayed]);
	const wanted = useMemo(() => addressFromSearch(validateWorkspaceSearch(search)), [search]);
	// The address the tab was opened on is what it restores, taken before
	// anything has been published over it.
	const [job, setJob] = useState<RestoreJob | null>(() => restoreOf(wanted));

	const openBoard = useCallback(
		/**
		 * Point one pane at one board, and look at the plan again once the server
		 * has answered: a board that could not be reached is named at the end.
		 * @param paneId The pane.
		 * @param boardKey The board.
		 */
		async (paneId: string, boardKey: string): Promise<void> => {
			const outcome = await port.open(paneId, boardKey);
			setJob((current) => {
				if (current === null) {
					return null;
				}
				if (outcome.kind === "unreachable") {
					current.unreachable.push(boardKey);
				}
				return { ...current };
			});
		},
		[port],
	);

	const apply = useCallback(
		/**
		 * Apply one step of a restore through the shell's own commands.
		 * @param step The step.
		 */
		(step: RestoreStep): void => {
			switch (step.kind) {
				case "close":
					port.closePane(step.paneId);
					return;
				case "add":
					port.addPane();
					return;
				case "focus":
					port.selectPane(step.paneId);
					return;
				default:
					void openBoard(step.paneId, step.boardKey);
			}
		},
		[openBoard, port],
	);

	// The one place the address and the panes are reconciled.
	//
	// A restore runs first, one step per settle: the plan is recomputed from
	// what is on screen each time, so a pane that arrives late, or a board an
	// agent moved underneath, is taken as it is rather than as it was when the
	// URL was read. Once nothing is being restored, what is on screen is
	// written down — whether or not it is what was asked for, so that the
	// address and the panes never disagree.
	useEffect(() => {
		if (job !== null && !job.done && advanceRestore(job, displayed, port, apply)) {
			return;
		}
		publishAddress(router, deliberate, displayed, wanted);
	}, [apply, deliberate, displayed, job, port, router, wanted]);

	// A history navigation is the other place the address leads. Our own writes
	// arrive as PUSH and REPLACE and are never restored over.
	useEffect(
		() =>
			router.history.subscribe(({ location, action }) => {
				if (action.type === "PUSH" || action.type === "REPLACE") {
					return;
				}
				const asked = router.options.parseSearch(location.search);
				setJob(restoreOf(addressFromSearch(validateWorkspaceSearch(asked))));
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
				setJob(null);
				deliberate.expect(intent);
			},
			clear: deliberate.clear,
		}),
		[deliberate],
	);
}

export { useWorkspaceAddress, type WorkspaceAddressing };
