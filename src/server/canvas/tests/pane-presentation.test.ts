// Asking a pane for a walkthrough step, and believing only the pane about it.
//
// The failures this guards are the ones that make a narrator talk about a
// picture nobody can see: answering before the step has arrived, mistaking the
// pane's previous position for an answer, going on as if nothing happened when
// a user stepped by hand, and waiting for ever on a pane that has gone.

import { describe, expect, test } from "bun:test";
import { createPanePresentations, type UserPresentationChange } from "@/server/canvas/index";
import type {
	PanePresentRequest,
	SemanticPaneContext,
	SemanticPanePresentation,
} from "@/shared/semantic-pane-context/index";

/** One port over one live pane, keeping what the pane was sent and what a user did. */
function harness(live = true) {
	const sent: PanePresentRequest[] = [];
	const changes: UserPresentationChange[] = [];
	const port = createPanePresentations({
		paneFor: (paneId) =>
			live && paneId === "pane-a" ? { clientId: "client-a", board: "pipeline" } : null,
		send(_pane, message) {
			sent.push(message);
			return true;
		},
	});
	port.onUserChange((change) => changes.push(change));
	let sequence = 0;
	/**
	 * The pane says where its presentation is.
	 * @param presentation The position, or null when nothing is presented.
	 */
	function says(presentation: SemanticPanePresentation | null): void {
		const report: SemanticPaneContext = {
			paneId: "pane-a",
			clientId: "client-a",
			board: { name: "pipeline", key: "pipeline" },
			variant: null,
			view: null,
			selection: [],
			version: 1,
			presentation,
			at: new Date(1_700_000_000_000 + sequence).toISOString(),
			sequence: sequence++,
		};
		port.note(report);
	}
	return { port, sent, changes, says };
}

/**
 * A position in the one walkthrough these tests present.
 * @param beat Which beat.
 * @param arrived Whether it has finished arriving.
 * @param answering The request it answers, or null for a user's choice.
 * @returns The position.
 */
function at(beat: number, arrived: boolean, answering: string | null): SemanticPanePresentation {
	return { walkthrough: "w1", beat, of: 4, arrived, answering };
}

describe("a walkthrough step asked of a pane", () => {
	test("is answered only once the pane says that request's step has arrived", async () => {
		const { port, sent, says, changes } = harness();
		const asked = port.present({ paneId: "pane-a", walkthrough: "w1", beat: 2 });
		const request = sent[0]!.request;
		expect(sent[0]).toMatchObject({ type: "pane_present", walkthrough: "w1", beat: 2 });
		// Still where a user left it, then on its way: neither is an answer.
		says(at(1, true, null));
		says(at(2, false, request));
		says(at(2, true, request));
		expect(await asked).toEqual({ kind: "arrived", presentation: at(2, true, request) });
		// The step the narrator asked for is not a user's change.
		expect(changes.filter((change) => change.presentation?.beat === 2)).toEqual([]);
	});

	test("is refused when a user steps by hand while it is on its way, and the change is told", async () => {
		const { port, sent, says, changes } = harness();
		says(at(0, true, null));
		const asked = port.present({ paneId: "pane-a", walkthrough: "w1", beat: 1 });
		says(at(1, false, sent[0]!.request));
		says(at(3, true, null));
		expect(await asked).toEqual({ kind: "refused", reason: "person_took_over" });
		expect(changes.at(-1)).toMatchObject({ paneId: "pane-a", presentation: { beat: 3 } });
	});

	test("tells a user's step and a user's leaving, once each", () => {
		const { says, changes } = harness();
		says(at(0, true, null));
		says(at(0, true, null));
		says(at(1, false, null));
		says(at(1, true, null));
		says(null);
		says(null);
		expect(changes.map((change) => change.presentation?.beat ?? null)).toEqual([0, 1, null]);
	});

	test("asked to leave is answered when the pane presents nothing, and that is not a user leaving", async () => {
		const { port, sent, says, changes } = harness();
		says(at(2, true, null));
		const asked = port.present({ paneId: "pane-a", walkthrough: null, beat: 0 });
		expect(sent[0]).toMatchObject({ walkthrough: null });
		says(null);
		expect(await asked).toEqual({ kind: "left" });
		expect(changes).toHaveLength(1);
	});

	test("is refused for a pane that has gone, when replaced by a later request, and when the caller stops waiting", async () => {
		expect(
			await harness(false).port.present({ paneId: "pane-a", walkthrough: "w1", beat: 0 }),
		).toEqual({ kind: "refused", reason: "no_pane" });
		const { port } = harness();
		const first = port.present({ paneId: "pane-a", walkthrough: "w1", beat: 0 });
		const stop = new AbortController();
		const second = port.present({
			paneId: "pane-a",
			walkthrough: "w1",
			beat: 1,
			signal: stop.signal,
		});
		expect(await first).toEqual({ kind: "refused", reason: "superseded" });
		stop.abort();
		expect(await second).toEqual({ kind: "refused", reason: "cancelled" });
		const stopping = port.present({ paneId: "pane-a", walkthrough: "w1", beat: 2 });
		port.forget();
		expect(await stopping).toEqual({ kind: "refused", reason: "stopping" });
	});
});
