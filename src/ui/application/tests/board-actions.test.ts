import { expect, test } from "bun:test";

import { createShellActions, type ShellActionDeps } from "@/ui/application/actions";
import { initialPaneRecord } from "@/ui/application/pane-records";
import type { ShellNotice } from "@/ui/shell";

/** Fail if a board action reaches an unrelated shell owner. */
function unrelated(): never {
	throw new Error("The board action reached an unrelated shell owner.");
}

/**
 * A picker with a real pane record and a controlled registration boundary.
 * @returns The action and its observed command and navigation outcomes.
 */
function picker() {
	let record = initialPaneRecord("A");
	const notices: ShellNotice[] = [];
	const shown: string[] = [];
	const moved: string[] = [];
	const marked: string[] = [];
	let failures = 0;
	let dismissed = 0;
	const deps: ShellActionDeps = {
		setTheme: unrelated,
		openSettings: unrelated,
		fullscreen: {
			attachStage: unrelated,
			stage: null,
			snapshot: { paneId: null, error: null },
			present: unrelated,
			exit: unrelated,
			clearError: unrelated,
			paneRemoved: unrelated,
			target: unrelated,
		},
		panes: {
			/**
			 * Read the fixture state.
			 * @returns The pane the person is using.
			 */
			get active() {
				return record;
			},
			/**
			 * Read the fixture state.
			 * @returns The current pane registration.
			 */
			get records() {
				return { A: record };
			},
			/**
			 * Read the fixture state.
			 * @returns Never; layout is outside this test.
			 */
			get list() {
				return unrelated();
			},
			/**
			 * Read the fixture state.
			 * @returns Never; media is outside this test.
			 */
			get handles() {
				return unrelated();
			},
			/**
			 * Read the fixture state.
			 * @returns Never; session callbacks are outside this test.
			 */
			get host() {
				return unrelated();
			},
			add: unrelated,
			close: unrelated,
			select: unrelated,
			patch: unrelated,
			bindEvents: unrelated,
		},
		addressing: {
			expect: unrelated,
			/**
			 * Read the fixture state.
			 * @returns The free navigation slot and outcome recorder.
			 */
			claim: async () => ({
				kind: "granted",
				move: {
					/**
					 * Record the lifecycle event.
					 * @param board The board navigation reached.
					 */
					done: (board): void => {
						moved.push(board);
					},
					/** Record one navigation refusal. */
					failed: (): void => {
						failures++;
					},
				},
			}),
		},
		catalog: {
			/**
			 * Read the fixture state.
			 * @returns Never; the catalog contents are outside this test.
			 */
			get listing() {
				return unrelated();
			},
			error: null,
			loading: false,
			/** A successful board open invalidates its listing. */
			refresh: (): void => {},
			reload: unrelated,
			boardsChanged: unrelated,
			reconnected: unrelated,
		},
		notices: {
			notices,
			/**
			 * Record the lifecycle event.
			 * @param notice The refusal offered to the person.
			 */
			raise: (notice): void => {
				notices.push(notice);
			},
			/** A successful retry clears its old refusal. */
			dismiss: (): void => {
				dismissed++;
			},
		},
		/**
		 * Keep what the picker says the user asked to change by hand (ADR 0034).
		 * @param paneId The pane.
		 * @returns A move nothing here fails.
		 */
		userMoves: (paneId) => {
			marked.push(paneId);
			return { failed: unrelated };
		},
		/**
		 * Emulate the server refusing an unknown pane.
		 * @param board The board to show.
		 * @param clientId The pane being addressed.
		 * @returns The board, once its pane exists.
		 */
		show: async (board, clientId) => {
			shown.push(clientId);
			if (!record.status.registered) {
				throw new Error("No pane is open; the browser command names nothing.");
			}
			return { board };
		},
	};
	return {
		actions: createShellActions(deps),
		shown,
		moved,
		marked,
		notices,
		/**
		 * Record the lifecycle event.
		 * @param registered Whether the reconnected socket has had its pane accepted.
		 */
		connected: (registered: boolean): void => {
			record = {
				...record,
				status: { ...record.status, clientId: "A-qz99fo", connected: true, registered },
			};
		},
		/**
		 * Read the fixture state.
		 * @returns The navigation and notice outcomes.
		 */
		outcomes: () => ({ failures, dismissed }),
	};
}

test("the board picker does not address a reconnecting pane before registration", async () => {
	const fixture = picker();
	fixture.connected(false);
	fixture.actions.selectBoard("Payments");
	await Promise.resolve();
	await Promise.resolve();

	expect(fixture.shown).toEqual([]);
	expect(fixture.moved).toEqual([]);
	expect(fixture.notices).toHaveLength(1);
	expect(fixture.notices[0]?.actions).toHaveLength(1);

	fixture.connected(true);
	fixture.actions.selectBoard("Payments");
	await Promise.resolve();
	await Promise.resolve();

	expect(fixture.shown).toEqual(["A-qz99fo"]);
	expect(fixture.moved).toEqual(["Payments"]);
	// The board arrives over the pane's socket looking like one an agent opened, so the picker
	// says beforehand that this one is the user's.
	expect(fixture.marked).toEqual(["A"]);
	expect(fixture.outcomes().dismissed).toBe(1);
});
