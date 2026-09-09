import { expect, test } from "bun:test";

import { settledAddress, type WorkspaceAddress } from "@/ui/board-routing/address";
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
import type { GuardVerdict, OpenOutcome, WorkspacePort } from "@/ui/board-routing/contracts";

/** An open the fake workspace has been asked for and not yet answered. */
interface HeldOpen {
	readonly paneId: string;
	readonly boardKey: string;
	readonly answer: (outcome: OpenOutcome) => void;
}

/** A workspace that answers a restore the way the shell would. */
interface FakeWorkspace {
	readonly port: WorkspacePort;
	/** Every command the restore issued, in order. */
	readonly applied: string[];
	readonly blocked: string[];
	readonly unreachable: string[];
	/** The opens asked for and not yet answered, oldest first. */
	readonly held: HeldOpen[];
	/** The restore as it stands. */
	restore: Restore;
	/** Reconcile the way the hook's effect does, until it can do no more. */
	readonly reconcile: () => void;
	/** Answer the oldest outstanding open, and let the restore go on. */
	readonly answer: (reached: boolean) => Promise<void>;
}

/** What a fake workspace starts as. */
interface FakeOptions {
	readonly panes: readonly (readonly [string, string | null])[];
	readonly activePaneId?: string;
	/** Panes that have not reached the server yet. */
	readonly unready?: readonly string[];
	readonly guard?: GuardVerdict;
	/** The address to restore. */
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
 * A workspace whose opens are held until the test answers them, so both the
 * order a restore asks in and what it does between an ask and its answer are
 * observable.
 * @param options What it starts as, what it refuses, and what to restore.
 * @returns The fake.
 */
function fakeWorkspace(options: FakeOptions): FakeWorkspace {
	const panes = options.panes.map(([paneId, boardKey]) => ({ paneId, boardKey }));
	let activePaneId = options.activePaneId ?? panes[0]?.paneId ?? null;
	const applied: string[] = [];
	const blocked: string[] = [];
	const unreachable: string[] = [];
	const held: HeldOpen[] = [];
	const free = ["A", "B"].find((paneId) => !panes.some((pane) => pane.paneId === paneId));
	const port: WorkspacePort = {
		/**
		 * What the panes are showing now.
		 * @returns The displayed address.
		 */
		get displayed(): WorkspaceAddress {
			return settledAddress({ panes: panes.map((pane) => ({ ...pane })), activePaneId });
		},
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
		 * Point a pane at a board. The answer waits for the test.
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
		/** Open the second pane, which arrives on scratch and focused. */
		addPane: (): void => {
			applied.push("add");
			if (free !== undefined && !panes.some((pane) => pane.paneId === free)) {
				panes.push({ paneId: free, boardKey: "scratch" });
				activePaneId = free;
			}
		},
		/**
		 * Close a pane. The last one cannot be closed, as in the shell.
		 * @param paneId The pane.
		 */
		closePane: (paneId: string): void => {
			applied.push(`close:${paneId}`);
			const at = panes.findIndex((pane) => pane.paneId === paneId);
			if (at >= 0 && panes.length > 1) {
				panes.splice(at, 1);
				activePaneId = panes[0]?.paneId ?? null;
			}
		},
		/**
		 * Focus a pane.
		 * @param paneId The pane.
		 */
		selectPane: (paneId: string): void => {
			applied.push(`focus:${paneId}`);
			activePaneId = paneId;
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

	const workspace: FakeWorkspace = {
		port,
		applied,
		blocked,
		unreachable,
		held,
		restore: createRestore(options.wanted),
		/** Take the restore as far as it can go against the workspace as it is. */
		reconcile: (): void => {
			const commands = {
				/**
				 * Close, add or focus a pane.
				 * @param step The step.
				 */
				apply: (step: RestoreStep): void => {
					if (step.kind === "close") {
						port.closePane(step.paneId);
					} else if (step.kind === "add") {
						port.addPane();
					} else if (step.kind === "focus") {
						port.selectPane(step.paneId);
					}
				},
				/**
				 * Ask for an open and record its answer against the target that asked.
				 * @param pending The command.
				 * @param paneId The pane.
				 */
				open: (pending: PendingOpen, paneId: string): void => {
					void port.open(paneId, pending.boardKey).then((outcome) => {
						const reached = outcome.kind === "opened";
						const pane = panes.find((entry) => entry.paneId === paneId);
						if (reached && pane) {
							pane.boardKey = pending.boardKey;
						}
						workspace.restore = openAnswered(workspace.restore, pending, reached);
						workspace.reconcile();
						return outcome;
					});
				},
			};
			while (!workspace.restore.done) {
				const next = advanceRestore(workspace.restore, port.displayed, port, commands);
				if (next === workspace.restore) {
					return;
				}
				workspace.restore = next;
				if (next.pending !== null) {
					return;
				}
			}
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
	};
	return workspace;
}

test("a restore adds the second pane, points each pane at its board and settles", async () => {
	const workspace = fakeWorkspace({
		panes: [["A", "scratch"]],
		wanted: address(
			[
				["A", "payments"],
				["B", "billing"],
			],
			"B",
		),
	});
	workspace.reconcile();
	expect(workspace.applied).toEqual(["add", "open:A:payments"]);
	await workspace.answer(true);
	await workspace.answer(true);
	expect(workspace.applied).toEqual(["add", "open:A:payments", "open:B:billing"]);
	expect(workspace.restore.done).toBe(true);
	expect(workspace.unreachable).toEqual([]);
});

test("only one open is outstanding at a time, so the server sees them in the order asked", () => {
	const workspace = fakeWorkspace({
		panes: [
			["A", "scratch"],
			["B", "scratch"],
		],
		wanted: address([
			["A", "payments"],
			["B", "billing"],
		]),
	});
	workspace.reconcile();
	expect(workspace.held.map((open) => open.boardKey)).toEqual(["payments"]);
});

test("a re-render while an open is outstanding does not finish the restore or lose its answer", async () => {
	const workspace = fakeWorkspace({
		panes: [["A", "scratch"]],
		wanted: address([["A", "gone"]]),
	});
	workspace.reconcile();
	expect(workspace.applied).toEqual(["open:A:gone"]);
	// Anything else re-rendering the application reconciles again. The restore
	// has nothing left to try, but it is not finished: its own answer is still
	// coming, and it may be the one thing the person has to be told.
	workspace.reconcile();
	workspace.reconcile();
	expect(workspace.restore.done).toBe(false);
	expect(workspace.unreachable).toEqual([]);
	await workspace.answer(false);
	expect(workspace.restore.done).toBe(true);
	expect(workspace.unreachable).toEqual(["gone"]);
});

test("an answer to a target the person has moved on from is released, never recorded", async () => {
	const workspace = fakeWorkspace({
		panes: [["A", "scratch"]],
		wanted: address([["A", "gone"]]),
	});
	workspace.reconcile();
	// Back is pressed while the first open is still outstanding.
	workspace.restore = retargetRestore(workspace.restore, address([["A", "billing"]]));
	await workspace.answer(false);
	// The board the person has left is not named at them, and the newer target
	// was not asked for until the older command had answered.
	expect(workspace.unreachable).toEqual([]);
	expect(workspace.applied).toEqual(["open:A:gone", "open:A:billing"]);
	await workspace.answer(true);
	expect(workspace.restore.done).toBe(true);
	expect(workspace.unreachable).toEqual([]);
});

test("a restore going from one pane to the other opens the second before closing the first", async () => {
	const workspace = fakeWorkspace({
		panes: [["A", "payments"]],
		wanted: address([["B", "billing"]]),
	});
	workspace.reconcile();
	// The last pane cannot be closed, so the replacement comes first.
	expect(workspace.applied).toEqual(["add", "close:A", "open:B:billing"]);
	await workspace.answer(true);
	expect(workspace.port.displayed.panes).toEqual([{ paneId: "B", boardKey: "billing" }]);
	expect(workspace.restore.done).toBe(true);
});

test("a restore going back to one pane closes the other", () => {
	const workspace = fakeWorkspace({
		panes: [
			["A", "payments"],
			["B", "billing"],
		],
		activePaneId: "B",
		wanted: address([["B", "billing"]]),
	});
	workspace.reconcile();
	expect(workspace.applied).toEqual(["close:A"]);
	expect(workspace.port.displayed.panes).toEqual([{ paneId: "B", boardKey: "billing" }]);
	expect(workspace.restore.done).toBe(true);
});

test("a restore waits for a pane that has not reached the server rather than opening into it", () => {
	const workspace = fakeWorkspace({
		panes: [
			["A", "scratch"],
			["B", "scratch"],
		],
		unready: ["B"],
		wanted: address([["B", "billing"]]),
	});
	workspace.reconcile();
	expect(workspace.applied).toEqual(["close:A"]);
	expect(workspace.restore.done).toBe(false);
});

test("a pane that refuses stops the whole restore before anything is applied", () => {
	const workspace = fakeWorkspace({
		panes: [
			["A", "payments"],
			["B", "billing"],
		],
		guard: { kind: "hold", paneId: "B" },
		wanted: address([["A", "ledger"]]),
	});
	workspace.reconcile();
	expect(workspace.applied).toEqual([]);
	expect(workspace.blocked).toEqual(["hold:B"]);
	expect(workspace.restore.done).toBe(true);
});

test("an address naming no panes asks for nothing, so a bare page keeps its workspace", () => {
	const workspace = fakeWorkspace({ panes: [["A", "payments"]], wanted: address([]) });
	workspace.reconcile();
	expect(workspace.applied).toEqual([]);
	expect(workspace.blocked).toEqual([]);
	expect(workspace.restore.done).toBe(true);
});

test("a restore the person overrides stops, and its late answer changes nothing", async () => {
	const workspace = fakeWorkspace({
		panes: [["A", "scratch"]],
		wanted: address([["A", "gone"]]),
	});
	workspace.reconcile();
	workspace.restore = abandonRestore(workspace.restore);
	await workspace.answer(false);
	expect(workspace.unreachable).toEqual([]);
	expect(workspace.applied).toEqual(["open:A:gone"]);
});

test("an answer is taken once, however often the reconciliation runs again", async () => {
	const workspace = fakeWorkspace({
		panes: [["A", "scratch"]],
		wanted: address([["A", "gone"]]),
	});
	workspace.reconcile();
	const pending = workspace.restore.pending;
	expect(pending).not.toBeNull();
	await workspace.answer(false);
	const settled = workspace.restore;
	expect(pending === null ? settled : openAnswered(settled, pending, false)).toBe(settled);
	expect(workspace.unreachable).toEqual(["gone"]);
});
