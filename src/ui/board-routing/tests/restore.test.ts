import { expect, test } from "bun:test";

import { settledAddress, type WorkspaceAddress } from "@/ui/board-routing/address";
import {
	advanceRestore,
	createRestore,
	type Restore,
	type RestoreStep,
} from "@/ui/board-routing/restore";
import type { GuardVerdict, OpenOutcome, WorkspacePort } from "@/ui/board-routing/contracts";

/** An open the shell has been asked for and has not answered. */
interface HeldOpen {
	readonly paneId: string;
	readonly boardKey: string;
	readonly answer: (outcome: OpenOutcome) => void;
}

/**
 * A shell that behaves the way React and the server do: a pane change is only
 * visible after a render, and an open is answered by the server before the
 * pane is told about its new board. Nothing here happens by itself.
 */
interface FakeShell {
	readonly port: WorkspacePort;
	/** Every command the restore issued, in order. */
	readonly applied: string[];
	readonly blocked: string[];
	readonly unreachable: string[];
	/** The opens asked for and not yet answered, oldest first. */
	readonly held: HeldOpen[];
	restore: Restore;
	/** What the panes will show at the next render. */
	readonly pending: { panes: { paneId: string; boardKey: string | null }[]; activePaneId: string };
	/** Reconcile against what the last render showed, the way the hook does. */
	readonly reconcile: () => void;
	/** Commit the queued pane changes and reconcile again, as a render does. */
	readonly render: () => void;
	/** Answer the oldest outstanding open. */
	readonly answer: (reached: boolean) => Promise<void>;
	/** Tell a pane's board over the socket, which is what adoption looks like. */
	readonly adopt: (paneId: string, boardKey: string) => void;
}

/** What a fake shell starts as. */
interface FakeOptions {
	readonly panes: readonly (readonly [string, string | null])[];
	readonly activePaneId?: string;
	readonly unready?: readonly string[];
	readonly guard?: GuardVerdict;
	readonly wanted: WorkspaceAddress;
}

/**
 * An address, written the way a test reads.
 * @param panes The panes, as pane id to board key.
 * @param activePaneId The active pane.
 * @returns The address.
 */
function address(
	panes: readonly (readonly [string, string | null])[],
	activePaneId: string | null = null,
): WorkspaceAddress {
	return settledAddress({
		panes: panes.map(([paneId, boardKey]) => ({ paneId, boardKey })),
		activePaneId,
	});
}

/**
 * A shell whose workspace only changes when the test renders it, and whose
 * opens only answer when the test answers them.
 * @param options What it starts as, what it refuses, and what to restore.
 * @returns The fake.
 */
function fakeShell(options: FakeOptions): FakeShell {
	const start = options.panes.map(([paneId, boardKey]) => ({ paneId, boardKey }));
	const pending = {
		panes: start.map((pane) => ({ ...pane })),
		activePaneId: options.activePaneId ?? start[0]?.paneId ?? "A",
	};
	// What the last render showed, which is all the restore is allowed to see.
	let shown: WorkspaceAddress = address(
		start.map((pane) => [pane.paneId, pane.boardKey] as const),
		pending.activePaneId,
	);
	const applied: string[] = [];
	const blocked: string[] = [];
	const unreachable: string[] = [];
	const held: HeldOpen[] = [];
	const free = ["A", "B"].find((paneId) => !pending.panes.some((pane) => pane.paneId === paneId));

	const port: WorkspacePort = {
		/**
		 * What the last render showed.
		 * @returns The displayed address.
		 */
		get displayed(): WorkspaceAddress {
			return shown;
		},
		paneIds: ["A", "B"],
		/**
		 * Whether a pane has reached the server.
		 * @param paneId The pane.
		 * @returns True unless the test said otherwise.
		 */
		ready: (paneId: string): boolean => !(options.unready ?? []).includes(paneId),
		/**
		 * What the panes say about losing their boards.
		 * @param paneIds The panes at risk.
		 * @returns The verdict.
		 */
		guard: (paneIds: readonly string[]): GuardVerdict =>
			paneIds.length === 0 ? { kind: "clear" } : (options.guard ?? { kind: "clear" }),
		/**
		 * Point a pane at a board. The answer waits for the test, and the pane is
		 * told separately, as the socket tells it.
		 * @param paneId The pane.
		 * @param boardKey The board.
		 * @returns The outcome, once the test gives one.
		 */
		open: (paneId: string, boardKey: string): Promise<OpenOutcome> => {
			applied.push(`open:${paneId}:${boardKey}`);
			return new Promise<OpenOutcome>((resolve) => {
				held.push({ paneId, boardKey, answer: resolve });
			});
		},
		/**
		 * Open the second pane, which arrives on scratch and focused.
		 * @returns Whether there was a pane to open.
		 */
		addPane: (): boolean => {
			applied.push("add");
			if (free === undefined || pending.panes.some((pane) => pane.paneId === free)) {
				return false;
			}
			pending.panes.push({ paneId: free, boardKey: "scratch" });
			pending.activePaneId = free;
			return true;
		},
		/**
		 * Close a pane. The last one cannot be closed, as in the shell.
		 * @param paneId The pane.
		 * @returns Whether it closed.
		 */
		closePane: (paneId: string): boolean => {
			applied.push(`close:${paneId}`);
			const at = pending.panes.findIndex((pane) => pane.paneId === paneId);
			if (at < 0 || pending.panes.length <= 1) {
				return false;
			}
			pending.panes.splice(at, 1);
			pending.activePaneId = pending.panes[0]?.paneId ?? paneId;
			return true;
		},
		/**
		 * Focus a pane.
		 * @param paneId The pane.
		 * @returns Whether the focus moved.
		 */
		selectPane: (paneId: string): boolean => {
			applied.push(`focus:${paneId}`);
			if (pending.activePaneId === paneId) {
				return false;
			}
			pending.activePaneId = paneId;
			return true;
		},
		/**
		 * A pane refused.
		 * @param block The refusal.
		 */
		reportBlocked: (block): void => {
			blocked.push(`${block.kind}:${block.paneId}`);
		},
		/**
		 * Boards nothing could reach.
		 * @param boardKeys The boards.
		 */
		reportUnreachable: (boardKeys): void => {
			unreachable.push(...boardKeys);
		},
	};

	const shell: FakeShell = {
		port,
		applied,
		blocked,
		unreachable,
		held,
		pending,
		restore: createRestore(options.wanted),
		/** Take the restore as far as this reading of the workspace allows. */
		reconcile: (): void => {
			const commands = {
				/**
				 * Close, add or focus a pane.
				 * @param step The step.
				 * @returns Whether the workspace changed.
				 */
				apply: (step: RestoreStep): boolean => {
					if (step.kind === "close") {
						return port.closePane(step.paneId);
					}
					if (step.kind === "add") {
						return port.addPane();
					}
					return step.kind === "focus" ? port.selectPane(step.paneId) : false;
				},
				/**
				 * Ask for an open. The hook owns the answer; this owner is about what
				 * a restore asks for, and in which order.
				 * @param paneId The pane.
				 * @param boardKey The board.
				 */
				open: (paneId: string, boardKey: string): void => {
					void port.open(paneId, boardKey);
				},
			};
			shell.restore = advanceRestore(shell.restore, port.displayed, port, commands).restore;
		},
		/** Commit what the commands queued, as a render does. */
		render: (): void => {
			shown = address(
				pending.panes.map((pane) => [pane.paneId, pane.boardKey] as const),
				pending.activePaneId,
			);
			shell.reconcile();
		},
		/**
		 * Answer the oldest outstanding open.
		 * @param reached Whether the board was there.
		 */
		answer: async (reached: boolean): Promise<void> => {
			const open = held.shift();
			expect(open).toBeDefined();
			open?.answer(reached ? { kind: "opened" } : { kind: "unreachable" });
			await Promise.resolve();
			await Promise.resolve();
		},
		/**
		 * The socket told a pane its board.
		 * @param paneId The pane.
		 * @param boardKey The board it now shows.
		 */
		adopt: (paneId: string, boardKey: string): void => {
			const pane = pending.panes.find((entry) => entry.paneId === paneId);
			if (pane) {
				pane.boardKey = boardKey;
			}
			shell.render();
		},
	};
	return shell;
}

test("a restore applies one step that changes something and waits for the render it causes", () => {
	const shell = fakeShell({
		panes: [["A", "payments"]],
		wanted: address([["B", "billing"]]),
	});
	// The last pane cannot be closed, so the replacement is opened first — and
	// the close does not happen against the workspace the add has not shown yet.
	shell.reconcile();
	expect(shell.applied).toEqual(["add"]);
	shell.render();
	expect(shell.applied).toEqual(["add", "close:A"]);
	shell.render();
	expect(shell.applied).toEqual(["add", "close:A", "open:B:billing"]);
	expect(shell.port.displayed.panes.map((pane) => pane.paneId)).toEqual(["B"]);
});

test("a restore going back to one pane closes the other", () => {
	const shell = fakeShell({
		panes: [
			["A", "payments"],
			["B", "billing"],
		],
		activePaneId: "B",
		wanted: address([["B", "billing"]]),
	});
	shell.reconcile();
	expect(shell.applied).toEqual(["close:A"]);
	shell.render();
	expect(shell.applied).toEqual(["close:A"]);
	expect(shell.restore.done).toBe(true);
	expect(shell.port.displayed.panes).toEqual([{ paneId: "B", boardKey: "billing" }]);
});

test("a command the shell refuses is taken off the plan without waiting for a render", () => {
	// Pane A alone, asked for an address it cannot have: the close is refused and
	// the restore settles rather than stalling on a render that never comes.
	const shell = fakeShell({ panes: [["A", "payments"]], wanted: address([["Z", "billing"]]) });
	shell.reconcile();
	expect(shell.applied).toEqual([]);
	expect(shell.restore.done).toBe(true);
});

test("a pane that refuses stops the whole restore before anything is applied", () => {
	const shell = fakeShell({
		panes: [
			["A", "payments"],
			["B", "billing"],
		],
		guard: { kind: "hold", paneId: "B" },
		wanted: address([["A", "ledger"]]),
	});
	shell.reconcile();
	expect(shell.applied).toEqual([]);
	expect(shell.blocked).toEqual(["hold:B"]);
	expect(shell.restore.done).toBe(true);
});

test("an address naming no panes asks for nothing, so a bare page keeps its workspace", () => {
	const shell = fakeShell({ panes: [["A", "payments"]], wanted: address([]) });
	shell.reconcile();
	expect(shell.applied).toEqual([]);
	expect(shell.blocked).toEqual([]);
	expect(shell.restore.done).toBe(true);
});

test("a restore waits for a pane that has not reached the server rather than opening into it", () => {
	const shell = fakeShell({
		panes: [
			["A", "scratch"],
			["B", "scratch"],
		],
		unready: ["B"],
		wanted: address([
			["A", "scratch"],
			["B", "billing"],
		]),
	});
	shell.reconcile();
	expect(shell.applied).toEqual([]);
	expect(shell.restore.done).toBe(false);
});
