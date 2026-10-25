import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";

import {
	NOTHING_READ,
	createReadingPublisher,
	type PaneReading,
} from "#ui/state/pane-session/pane-reading.ts";
import type { SemanticPaneContext } from "@archboard/board/pane-context";
import { PANE_MS } from "@archboard/timing";

// Which parts of a report are said to be the user's own doing (ADR 0034). What these catch is
// the feedback loop of 2026-09-20 coming back: a change nobody's hand made being told to the
// voice model as the user's, and the quieter failure beside it, a real pick being told to nobody.

beforeEach(() => {
	jest.useFakeTimers();
});

afterEach(() => {
	jest.useRealTimers();
});

/** Advance the debounce and drain the send and rejection promises. */
async function settled(): Promise<void> {
	jest.advanceTimersByTime(PANE_MS.selectionDebounce);
	await Promise.resolve();
	await Promise.resolve();
}

/**
 * A drawn reading.
 * @param board The board on screen.
 * @param selected The selected subject, or null.
 * @param version The board version drawn.
 * @returns The reading.
 */
function reading(board: string, selected: string | null, version = 1): PaneReading {
	return {
		...NOTHING_READ,
		board: { name: board, key: board },
		variant: { id: "v1", name: "Current", lifecycle: "current" },
		version,
		selection: selected === null ? [] : [{ id: selected }],
	};
}

/**
 * A publisher with its sends captured.
 * @returns The publisher and what it sent.
 */
function watched() {
	const sent: SemanticPaneContext[] = [];
	const publisher = createReadingPublisher({
		paneId: "pane-A",
		clientId: "client-1",
		/**
		 * The vault the pane is in.
		 * @returns The vault.
		 */
		vault: () => "/work/archboard/.archboard/vault",
		/**
		 * Capture one report.
		 * @param body The report.
		 * @returns That it was kept.
		 */
		send: (body) => {
			sent.push(body);
			return Promise.resolve({ kept: true });
		},
	});
	return { publisher, sent };
}

describe("what a report says the user changed", () => {
	test("a pick by hand is said once, and the change after it that nobody's hand made is not", async () => {
		const { publisher, sent } = watched();
		publisher.publish(reading("payments", null));
		await settled();

		publisher.userChanged("selection");
		publisher.publish(reading("payments", "lease"));
		await settled();
		// The pane moving clears a pick; nobody picked anything.
		publisher.publish(reading("payments", null));
		await settled();
		publisher.dispose();

		expect(sent.map((body) => body.byUser)).toEqual([undefined, ["selection"], undefined]);
	});

	test("one report holding a pick and a version an agent wrote credits the user with the pick only", async () => {
		const { publisher, sent } = watched();
		publisher.publish(reading("payments", null, 1));
		await settled();

		publisher.userChanged("selection");
		publisher.publish(reading("payments", "lease", 2));
		await settled();
		publisher.dispose();

		expect(sent[1]?.byUser).toEqual(["selection"]);
	});

	test("a gesture that changed nothing does not wait for a change somebody else makes", async () => {
		const { publisher, sent } = watched();
		publisher.publish(reading("payments", "lease", 1));
		await settled();

		// Clicking what is already selected, then an agent's write redraws the board and the
		// pane's pick goes with it.
		publisher.userChanged("selection");
		publisher.publish(reading("payments", "lease", 2));
		await settled();
		publisher.publish(reading("payments", null, 3));
		await settled();
		publisher.dispose();

		expect(sent.map((body) => body.byUser)).toEqual([undefined, undefined, undefined]);
	});

	test("a board the user asked for is theirs when it arrives, across the moment the pane reads nothing", async () => {
		const { publisher, sent } = watched();
		publisher.publish(reading("payments", null));
		await settled();

		publisher.userChanged("board");
		publisher.userChanged("variant");
		publisher.reset();
		publisher.publish(NOTHING_READ);
		await settled();
		publisher.publish(reading("ledger", null));
		await settled();
		publisher.dispose();

		// The variant kept its id, so only the board is said.
		expect(sent.map((body) => body.byUser)).toEqual([undefined, undefined, ["board"]]);
	});

	test("a board the server could not open leaves nothing waiting for an agent's switch to use", async () => {
		const { publisher, sent } = watched();
		publisher.publish(reading("payments", null));
		await settled();

		publisher.userChanged("board");
		publisher.userChangeFailed("board");
		publisher.reset();
		publisher.publish(reading("ledger", null));
		await settled();
		publisher.dispose();

		expect(sent[1]?.byUser).toBeUndefined();
	});

	test("saying a reading again after a reconnect credits nobody", async () => {
		const { publisher, sent } = watched();
		publisher.userChanged("selection");
		publisher.publish(reading("payments", "lease"));
		await settled();
		publisher.republish();
		await settled();
		publisher.dispose();

		expect(sent.map((body) => body.byUser)).toEqual([["selection"], undefined]);
	});
});
