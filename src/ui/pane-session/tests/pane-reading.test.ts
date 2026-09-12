import { describe, expect, test } from "bun:test";

import { NOTHING_READ, createReadingPublisher, type PaneReading } from "@/ui/pane-session";
import type { SemanticPaneContext } from "@/shared/semantic-pane-context";
import { SELECTION_DEBOUNCE_MS } from "@/shared/timing/timing";

/**
 * Wait long enough for one debounce to have fired.
 * @returns Settles after the debounce.
 */
const settled = (): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, SELECTION_DEBOUNCE_MS * 2));

/**
 * A reading of one board with one subject picked out.
 * @param id The selected subject.
 * @returns The reading.
 */
function reading(id: string): PaneReading {
	return {
		...NOTHING_READ,
		board: { name: "payments", key: "payments" },
		selection: [{ id }],
	};
}

/**
 * A publisher with its sends and warnings captured.
 * @param replies What the reader answers each report with, in order.
 * @returns The publisher and what it sent.
 */
function watched(replies: Array<{ kept?: boolean }> = []) {
	const sent: SemanticPaneContext[] = [];
	const warnings: string[] = [];
	const publisher = createReadingPublisher({
		paneId: "pane-A",
		clientId: "client-1",
		/**
		 * Capture one report and answer it.
		 * @param body The report.
		 * @returns The answer this report was given.
		 */
		send: (body) => {
			sent.push(body);
			return Promise.resolve(replies[sent.length - 1] ?? { kept: true });
		},
		/**
		 * Capture one warning.
		 * @param message What it said.
		 */
		warn: (message): void => {
			warnings.push(message);
		},
	});
	return { publisher, sent, warnings };
}

describe("a pane's reading publisher", () => {
	test("counts its own reports from zero so the reader can order them", async () => {
		const { publisher, sent } = watched();
		publisher.publish(reading("a"));
		await settled();
		publisher.publish(reading("b"));
		await settled();
		publisher.publish(reading("c"));
		await settled();
		publisher.dispose();

		// Never a timestamp: two reports made in one millisecond tie, and the tie
		// is the case the ordering exists to decide.
		expect(sent.map((body) => body.sequence)).toEqual([0, 1, 2]);
		expect(sent.map((body) => body.selection[0]?.id)).toEqual(["a", "b", "c"]);
	});

	test("a reading that says what the last one said is not a report at all", async () => {
		const { publisher, sent } = watched();
		publisher.publish(reading("a"));
		await settled();
		publisher.publish(reading("a"));
		await settled();
		publisher.publish(reading("b"));
		await settled();
		publisher.dispose();

		// The count follows the reports that went out, so the reader never sees a
		// gap it would have to decide what to make of.
		expect(sent.map((body) => body.sequence)).toEqual([0, 1]);
		expect(sent.map((body) => body.selection[0]?.id)).toEqual(["a", "b"]);
	});

	test("a report the reader dropped as overtaken is said out loud", async () => {
		const { publisher, sent, warnings } = watched([{ kept: true }, { kept: false }]);
		publisher.publish(reading("a"));
		await settled();
		publisher.publish(reading("b"));
		await settled();
		publisher.dispose();

		expect(sent).toHaveLength(2);
		// A dropped report is answered exactly like a kept one, so without this it
		// is invisible — and it means the pane is racing itself.
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("pane-A");
		expect(warnings[0]).toContain("1");
	});

	test("a report that never arrived is sent again by the next change", async () => {
		const sent: SemanticPaneContext[] = [];
		const publisher = createReadingPublisher({
			paneId: "pane-A",
			clientId: "client-1",
			/**
			 * Fail to send one report.
			 * @param body The report.
			 * @returns A rejection.
			 */
			send: (body) => {
				sent.push(body);
				return Promise.reject(new Error("the canvas was not there"));
			},
			/** Warnings are not what this one is about. */
			warn: (): void => {},
		});
		publisher.publish(reading("a"));
		await settled();
		publisher.publish(reading("a"));
		await settled();
		publisher.dispose();

		// Otherwise the server would be left describing a pane as it was before
		// the failed report, with nothing to correct it.
		expect(sent.map((body) => body.selection[0]?.id)).toEqual(["a", "a"]);
		expect(sent.map((body) => body.sequence)).toEqual([0, 1]);
	});
});

describe("a pane whose socket came back", () => {
	test("says what it is reading again, because the server dropped its report", async () => {
		const { publisher, sent } = watched();
		publisher.publish(reading("a"));
		await settled();
		expect(sent).toHaveLength(1);

		// Nothing about the pane changed while it was away, so nothing would ever
		// mention it again: the shell's inputs are what they were.
		publisher.republish();
		await settled();
		publisher.dispose();
		expect(sent.map((body) => body.selection[0]?.id)).toEqual(["a", "a"]);
		// The count keeps going up across it, so the reader can still order them.
		expect(sent.map((body) => body.sequence)).toEqual([0, 1]);
	});

	test("a pane that moved boards says nothing about the board it left", async () => {
		const { publisher, sent } = watched();
		publisher.publish(reading("a"));
		await settled();

		// The subjects it had picked out are subjects of a board it is no longer
		// showing, so repeating them would be saying something untrue.
		publisher.reset();
		publisher.republish();
		await settled();
		publisher.dispose();
		expect(sent).toHaveLength(1);
	});
});
