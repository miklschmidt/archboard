// The address bar over the workspace: it writes down what the panes show, and
// it restores what a direct load or a Back/Forward asks for.
//
// The address follows the note. A user's board open runs the shell's own
// command, the server answers it, the pane reports its new board, and only
// then is the address written. So a refused open changes no address, because
// it changed no pane. The address leads in exactly two places — the first
// load, and a history navigation — and there it asks for the same command the
// shell does.
//
// There is one command slot. Every board open takes it, whoever asked: a
// restore's own step and a user's click are the same operation with a
// different owner. The slot is held through the server's answer AND through
// the pane being seen to move, and the next command is granted one at a time,
// so the last thing somebody asked for is the last thing the server is given.
// Pointing the restore elsewhere, or abandoning it for a user's gesture,
// changes what is wanted from here on; the slot goes on being watched either
// way, so nothing is ever left held by a restore nobody is running.
//
// Each operation owns what the user asked for, so an expectation exists only
// between its pane moving and the address being written. A deliberate move
// pushes a history entry; everything else replaces one.
//
// The reconciliation is external state, driven by the effect whenever the
// workspace or the address has changed, and by the answers to what it asked.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";

import {
	sameAddress,
	settledAddress,
	withModelAddresses,
	type WorkspaceAddress,
	type ModelAddress,
} from "#ui/rules/board-routing/address.ts";
import {
	createDeliberateNavigation,
	type DeliberateNavigation,
	type NavigationIntent,
} from "#ui/state/board-routing/intent.ts";
import {
	matchesModelArrival,
	canonicalDestination,
	operationAnswered,
	operationMovedPane,
	operationSettled,
	startOperation,
	type Operation,
	type OperationAnswer,
} from "#ui/state/board-routing/operation.ts";
import {
	abandonRestore,
	advanceRestore,
	boardOpened,
	boardUnreachable,
	createRestore,
	retargetRestore,
	type Restore,
	type RestoreStep,
} from "#ui/rules/board-routing/restore.ts";
import {
	addressFromSearch,
	searchFromAddress,
	validateWorkspaceSearch,
} from "#ui/rules/board-routing/search.ts";
import type { OpenedBoard, WorkspacePort } from "#ui/rules/board-routing/contracts.ts";

/** What a user's own board open reports back when it is over. */
interface NavigationClaim {
	/**
	 * The command finished. The board it opened and the repository it put the
	 * pane in are the server's own answer, and are what says whether the pane
	 * has anything to move to.
	 */
	readonly done: (openedKey: string | null, repository: string | null) => void;
	/** The command did not finish, so nothing moved. */
	readonly failed: () => void;
}

/** A user's move, once the slot is theirs. */
type NavigationPermission = { readonly kind: "granted"; readonly move: NavigationClaim };

/** What the shell tells the address bar about the user's own gestures. */
interface WorkspaceAddressing {
	/** Consume the matching user open when its canonical socket arrival reaches the router. */
	readonly modelArriving: (paneId: string, model: string, repository: string | null) => boolean;
	/**
	 * A user changed the workspace themselves, without asking the server: they
	 * opened or closed a pane. The change pushes a history entry.
	 */
	readonly expect: (intent: NavigationIntent) => void;
	/**
	 * A user is about to have the shell open a board. Ends any restore, waits
	 * for the command slot, and answers only when it is theirs, so that theirs
	 * is the last command the server is given.
	 * @returns Where to report the outcome, once the command may be sent.
	 */
	readonly claim: (intent: NavigationIntent) => Promise<NavigationPermission>;
}

/** The router this hook writes through. */
type BoardRouter = ReturnType<typeof useRouter>;

/** Somebody waiting for the command slot. */
interface Waiting {
	readonly intent: NavigationIntent;
	readonly answer: (permission: NavigationPermission) => void;
}

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
	/** The one command outstanding, or null when the slot is free. */
	operation: Operation | null;
	/** Who is waiting for the slot, in the order they asked. */
	readonly queue: Waiting[];
}

/**
 * Whether every open pane has said what board it holds. Half a workspace is
 * never written down: a pane that has not reached the server yet would be
 * published as a pane on no board.
 * @param address The displayed address.
 * @returns True when the whole workspace is known.
 */
function isSettled(address: WorkspaceAddress): boolean {
	return (
		address.panes.length > 0 &&
		address.panes.every((pane) => pane.boardKey !== null || pane.model !== undefined)
	);
}

/**
 * Write the workspace down when the address no longer says what is on screen.
 * A move the user asked for pushes a history entry; anything else replaces
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
 * Take the answer to whatever is in the slot and look again.
 * @param state The reconciliation.
 * @param operation The operation being answered.
 * @param answer What the server said.
 * @param opened The board it opened and the pane's repository, as the server says, when it opened one.
 */
function answerOperation(
	state: Reconciliation,
	operation: Operation,
	answer: OperationAnswer,
	opened: OpenedBoard | null = null,
): void {
	// An answer is taken once, and only by the operation it belongs to.
	if (state.operation === operation) {
		state.operation = operationAnswered(operation, answer, opened);
	}
	reconcile(state);
}

/**
 * An operation is over. A restore's names a board it could not reach; a
 * user's becomes the move the address pushes, but only if its pane moved:
 * opening the board a pane already showed is not a move to record.
 * @param state The reconciliation.
 * @param operation The operation that finished.
 */
function finishOperation(state: Reconciliation, operation: Operation): void {
	const { operator } = operation;
	if (operator.kind === "restore") {
		state.restore = restoreAnswered(state.restore, operator.target, operation);
		return;
	}
	finishUserOperation(state, operation);
}

/**
 * Record only legacy user moves that did not already navigate through the canonical router.
 * @param state The workspace navigation owner.
 * @param operation The completed operation.
 */
function finishUserOperation(state: Reconciliation, operation: Operation): void {
	const { intent, answer } = operation;
	if (canonicalDestination(operation) !== undefined) return;
	if (intent !== null && answer === "opened" && operationMovedPane(operation, state.displayed)) {
		// The visible origin can be canonical while the server remembers a legacy board.
		state.deliberate.expect(
			intent.kind === "board"
				? { ...intent, from: operation.from, repository: operation.fromRepository }
				: intent,
		);
	}
}

/**
 * The restore, told how its open ended: a board it could not reach is named,
 * and a board it reached is wanted as the server spells it.
 * @param restore The restore.
 * @param target The target that asked.
 * @param operation The operation that ended.
 * @returns The restore.
 */
function restoreAnswered(restore: Restore, target: number, operation: Operation): Restore {
	if (operation.answer === "unreachable" && operation.asked !== null) {
		return boardUnreachable(restore, target, operation.asked);
	}
	return operation.openedKey === null
		? restore
		: boardOpened(restore, target, operation.paneId, operation.openedKey);
}

/**
 * Give the slot to whoever has been waiting longest.
 * @param state The reconciliation.
 */
function grantSlot(state: Reconciliation): void {
	const next = state.queue.shift();
	if (next === undefined) {
		return;
	}
	const { intent } = next;
	const operation =
		intent.kind === "board"
			? startOperation({ kind: "user" }, intent.paneId, null, state.displayed, intent)
			: null;
	state.operation = operation;
	next.answer({
		kind: "granted",
		move: {
			/**
			 * The command finished.
			 * @param openedKey The board the server says it opened.
			 * @param repository The repository the server says the pane is in now.
			 */
			done: (openedKey: string | null, repository: string | null): void => {
				if (operation === null) {
					reconcile(state);
					return;
				}
				answerOperation(state, operation, "opened", { boardKey: openedKey, repository });
			},
			/** The command did not finish. */
			failed: (): void => {
				if (operation === null) {
					reconcile(state);
					return;
				}
				answerOperation(state, operation, "unreachable");
			},
		},
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
			if (step.kind === "read") {
				return state.port.read(step.paneId, step.view);
			}
			return step.kind === "focus" ? state.port.selectPane(step.paneId) : false;
		},
		/**
		 * Take the slot and point a pane at its requested architecture.
		 * @param paneId The pane.
		 * @param boardKey The board.
		 * @param repository The repository the board is in, or null for the pane's own.
		 * @param model The complete canonical reading, when this address names one.
		 */
		open: (
			paneId: string,
			boardKey: string | null,
			repository: string | null,
			model?: ModelAddress,
		): void => {
			const operation = startOperation(
				{ kind: "restore", target: state.restore.target },
				paneId,
				{ boardKey, repository, ...(model === undefined ? {} : { model }) },
				state.displayed,
			);
			state.operation = operation;
			void state.port.open(paneId, boardKey, repository, model).then((outcome) => {
				if (outcome.kind === "opened") {
					answerOperation(state, operation, "opened", outcome);
				} else {
					answerOperation(state, operation, "unreachable");
				}
				return outcome;
			});
		},
	};
}

/**
 * Bring the address and the panes back into agreement.
 *
 * The slot first: whatever is in it is watched until the server has answered
 * and its pane has been seen to move, whoever asked for it and whether or not
 * the restore that asked is still wanted. Then whoever is waiting gets it, one
 * at a time. Only when nothing is outstanding does a restore take another step
 * or the address get written.
 * @param state The reconciliation.
 */
function reconcile(state: Reconciliation): void {
	const running = state.operation;
	if (running !== null) {
		if (!operationSettled(running, state.port.displayed, state.port.ready)) {
			return;
		}
		state.operation = null;
		if (running.answer === "opened") revealOpenedPane(state, running.paneId);
		finishOperation(state, running);
	}
	if (state.queue.length > 0) {
		grantSlot(state);
		return;
	}
	if (stillRestoring(state)) {
		return;
	}
	publishAddress(state);
}

/**
 * A completed legacy open replaces only that pane's canonical reading intent.
 * @param state The existing routing operation owner.
 * @param paneId The pane whose open succeeded.
 */
function revealOpenedPane(state: Reconciliation, paneId: string): void {
	const actual = state.port.displayed.panes.find((pane) => pane.paneId === paneId);
	if (actual === undefined) return;
	state.displayed = {
		...state.displayed,
		panes: state.displayed.panes.map((pane) => {
			if (pane.paneId !== paneId) return pane;
			return actual.boardKey === null && pane.model !== undefined
				? { ...actual, model: pane.model }
				: actual;
		}),
	};
}

/**
 * Take the restore one step further, when there is one to take.
 * @param state The reconciliation.
 * @returns True while it has more to do before the address may be written.
 */
function stillRestoring(state: Reconciliation): boolean {
	if (state.restore.done) {
		return false;
	}
	const progress = advanceRestore(state.restore, state.displayed, state.port, commandsOver(state));
	state.restore = progress.restore;
	return progress.waiting || state.operation !== null;
}

/**
 * The address bar. The port must be stable across renders that change nothing
 * about the workspace; the application memoises it over its own owners.
 * @param port The workspace it addresses.
 * @returns The seam a user's gestures announce themselves through.
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
	const wanted = useMemo(() => addressFromSearch(validateWorkspaceSearch(search)), [search]);
	const displayed = useMemo(
		() => withModelAddresses(settledAddress(port.displayed), wanted),
		[port.displayed, wanted],
	);
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
		operation: null,
		queue: [],
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

	return useMemo(
		() => ({
			/**
			 * Match the socket arrival against the existing user operation once.
			 * @param paneId The addressed pane.
			 * @param model The resolved model identity.
			 * @param repository The resolved repository.
			 * @returns Whether this arrival creates a user history entry.
			 */
			modelArriving: (paneId: string, model: string, repository: string | null): boolean => {
				const operation = state.current.operation;
				if (!matchesModelArrival(operation, paneId, model, repository)) return false;
				// Keep the command object that its pending HTTP completion captured.
				operation.modelArrived = true;
				return true;
			},
			/**
			 * A user changed the workspace themselves.
			 * @param intent What they asked for.
			 */
			expect: (intent: NavigationIntent): void => {
				const current = state.current;
				current.restore = abandonRestore(current.restore);
				deliberate.expect(intent);
			},
			/**
			 * A user is about to have the shell open a board.
			 * @param intent What they asked for.
			 * @returns Permission and where to report the outcome, or the refusal.
			 */
			claim: (intent: NavigationIntent): Promise<NavigationPermission> => {
				const current = state.current;
				current.restore = abandonRestore(current.restore);
				return new Promise<NavigationPermission>((resolve) => {
					current.queue.push({ intent, answer: resolve });
					reconcile(current);
				});
			},
		}),
		[deliberate],
	);
}

export {
	useWorkspaceAddress,
	type NavigationClaim,
	type NavigationPermission,
	type WorkspaceAddressing,
};
