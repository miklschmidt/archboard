import { expect, test } from "bun:test";

import { settledAddress, type WorkspaceAddress } from "@/ui/board-routing/address";
import { advanceRestore, restoreOf, type RestoreStep } from "@/ui/board-routing/restore";
import type { GuardVerdict, OpenOutcome, WorkspacePort } from "@/ui/board-routing/contracts";

/** A workspace that answers a restore the way the shell would. */
interface FakeWorkspace {
	readonly port: WorkspacePort;
	/** Every step the restore applied, in order. */
	readonly applied: string[];
	readonly blocked: string[];
	readonly unreachable: string[];
	/** Run the restore to a standstill, as the reconciling effect does. */
	readonly restore: (wanted: WorkspaceAddress) => Promise<void>;
}

/** What a fake workspace starts as. */
interface FakeOptions {
	readonly panes: readonly (readonly [string, string | null])[];
	readonly activePaneId?: string;
	/** Panes that have not reached the server yet. */
	readonly unready?: readonly string[];
	/** Boards no pane can reach. */
	readonly missing?: readonly string[];
	readonly guard?: GuardVerdict;
}

/**
 * A workspace whose panes answer immediately, so a whole restore runs in one
 * synchronous loop.
 * @param options What it starts as and what it refuses.
 * @returns The fake.
 */
function fakeWorkspace(options: FakeOptions): FakeWorkspace {
	const panes = options.panes.map(([paneId, boardKey]) => ({ paneId, boardKey }));
	let activePaneId = options.activePaneId ?? panes[0]?.paneId ?? null;
	const applied: string[] = [];
	const blocked: string[] = [];
	const unreachable: string[] = [];
	const free = ["A", "B"].find((paneId) => !panes.some((pane) => pane.paneId === paneId));
	const port: WorkspacePort = {
		/**
		 * What the panes are showing now.
		 * @returns The displayed address.
		 */
		get displayed(): WorkspaceAddress {
			return settledAddress({ panes: [...panes], activePaneId });
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
		 * Point a pane at a board, unless the board is one the test hid.
		 * @param paneId The pane.
		 * @param boardKey The board.
		 * @returns Whether it was reached.
		 */
		open: (paneId: string, boardKey: string): Promise<OpenOutcome> => {
			applied.push(`open:${paneId}:${boardKey}`);
			if ((options.missing ?? []).includes(boardKey)) {
				return Promise.resolve({ kind: "unreachable" });
			}
			const pane = panes.find((entry) => entry.paneId === paneId);
			if (pane) {
				pane.boardKey = boardKey;
			}
			return Promise.resolve({ kind: "opened" });
		},
		/** Open the second pane. */
		addPane: (): void => {
			applied.push("add");
			if (free !== undefined && !panes.some((pane) => pane.paneId === free)) {
				panes.push({ paneId: free, boardKey: "scratch" });
				activePaneId = free;
			}
		},
		/**
		 * Close a pane.
		 * @param paneId The pane.
		 */
		closePane: (paneId: string): void => {
			applied.push(`close:${paneId}`);
			const at = panes.findIndex((pane) => pane.paneId === paneId);
			if (at >= 0 && panes.length > 1) {
				panes.splice(at, 1);
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
	return {
		port,
		applied,
		blocked,
		unreachable,
		/**
		 * Run a restore to a standstill.
		 * @param wanted The address to restore.
		 */
		restore: async (wanted: WorkspaceAddress): Promise<void> => {
			const job = restoreOf(wanted);
			/**
			 * Apply one step; opens answer synchronously in this fake.
			 * @param step The step.
			 */
			const apply = (step: RestoreStep): void => {
				if (step.kind !== "open") {
					return;
				}
				void port.open(step.paneId, step.boardKey).then((outcome) => {
					if (outcome.kind === "unreachable") {
						job.unreachable.push(step.boardKey);
					}
					return outcome;
				});
			};
			/**
			 * Apply a step through the port the way the hook does.
			 * @param step The step.
			 */
			const applyStep = (step: RestoreStep): void => {
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
						apply(step);
				}
			};
			// A hundred passes is far more than any two-pane workspace needs; a
			// restore that has not settled by then is not terminating. Each pass
			// yields, so an open that has answered is heard before the next step,
			// as it is when the effect runs again.
			for (let pass = 0; pass < 100 && !job.done; pass += 1) {
				const running = advanceRestore(job, port.displayed, port, applyStep);
				// oxlint-disable-next-line no-await-in-loop -- one pass answers before the next is decided
				await Promise.resolve();
				if (!running) {
					break;
				}
			}
			expect(job.done).toBe(true);
		},
	};
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

test("a restore adds the second pane, points each pane at its board and focuses the one asked for", async () => {
	const workspace = fakeWorkspace({ panes: [["A", "scratch"]] });
	await workspace.restore(
		address(
			[
				["A", "payments"],
				["B", "billing"],
			],
			"B",
		),
	);
	expect(workspace.applied).toEqual(["add", "open:A:payments", "open:B:billing"]);
	// The second pane arrives focused, so there is no focus step left to take.
	expect(workspace.port.displayed.activePaneId).toBe("B");
	expect(workspace.unreachable).toEqual([]);
});

test("a restore that asks for one pane closes the other before opening anything", async () => {
	const workspace = fakeWorkspace({
		panes: [
			["A", "payments"],
			["B", "billing"],
		],
		activePaneId: "B",
	});
	await workspace.restore(address([["A", "ledger"]]));
	expect(workspace.applied).toEqual(["close:B", "open:A:ledger"]);
});

test("a restore waits for a pane that has not reached the server rather than opening into it", async () => {
	const workspace = fakeWorkspace({
		panes: [
			["A", "scratch"],
			["B", "scratch"],
		],
		unready: ["B"],
	});
	const job = restoreOf(
		address([
			["A", "payments"],
			["B", "billing"],
		]),
	);
	expect(
		advanceRestore(job, workspace.port.displayed, workspace.port, (step) => {
			workspace.applied.push(step.kind === "open" ? `open:${step.paneId}` : step.kind);
		}),
	).toBe(true);
	expect(workspace.applied).toEqual(["open:A"]);
	// Nothing else can be applied while pane B is unreachable, and the restore
	// stays open rather than finishing without it.
	expect(job.done).toBe(false);
});

test("a board that cannot be opened is named once and does not stop the other pane", async () => {
	const workspace = fakeWorkspace({
		panes: [
			["A", "scratch"],
			["B", "scratch"],
		],
		missing: ["gone"],
	});
	await workspace.restore(
		address([
			["A", "gone"],
			["B", "billing"],
		]),
	);
	expect(workspace.applied).toEqual(["open:A:gone", "open:B:billing"]);
	expect(workspace.unreachable).toEqual(["gone"]);
	expect(workspace.port.displayed.panes).toEqual([
		{ paneId: "A", boardKey: "scratch" },
		{ paneId: "B", boardKey: "billing" },
	]);
});

test("a pane that refuses stops the whole restore before anything is applied", async () => {
	const workspace = fakeWorkspace({
		panes: [
			["A", "payments"],
			["B", "billing"],
		],
		guard: { kind: "hold", paneId: "B" },
	});
	await workspace.restore(address([["A", "ledger"]]));
	expect(workspace.applied).toEqual([]);
	expect(workspace.blocked).toEqual(["hold:B"]);
});

test("a restore of the workspace already on screen applies nothing", async () => {
	const workspace = fakeWorkspace({ panes: [["A", "payments"]] });
	await workspace.restore(address([["A", "payments"]]));
	expect(workspace.applied).toEqual([]);
});
