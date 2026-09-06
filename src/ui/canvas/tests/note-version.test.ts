import { describe, expect, test } from "bun:test";

import { reduce, reportsSettled } from "@/ui/canvas/change-reporting";
import {
	ReportingHarness,
	box,
	copy,
	find,
} from "@/ui/canvas/tests/support/change-reporting-harness";

describe("the note version a pane states on its writes (ADR 0022)", () => {
	test("a pane that has seen no note states 0, and states what the server last said", () => {
		const harness = new ReportingHarness();
		harness.edit("a", { x: 30 });
		harness.due();
		expect(harness.server.requests[0]?.expectVersion).toBeNull();
		harness.accept(undefined, 4);
		expect(harness.state.noteVersion).toBe(4);

		harness.dispatch({ type: "note_version_learned", version: 7 });
		harness.edit("a", { x: 40 });
		harness.due();
		expect(harness.server.requests[0]?.expectVersion).toBe(7);
		harness.accept(undefined, 8);
		expect(harness.state.noteVersion).toBe(8);
	});

	test("learning the same version keeps the state's identity, and a new board forgets it", () => {
		const harness = new ReportingHarness();
		harness.dispatch({ type: "note_version_learned", version: 3 });
		const learned = harness.state;
		expect(reduce(learned, { type: "note_version_learned", version: 3 }).state).toBe(learned);
		harness.dispatch({ type: "board_adopted" });
		expect(harness.state.noteVersion).toBeNull();
	});

	test("the beacon on the way out states the version too", () => {
		const harness = new ReportingHarness();
		harness.dispatch({ type: "note_version_learned", version: 5 });
		harness.edit("a", { x: 30 });
		const result = reduce(harness.state, { type: "flush_requested", scene: copy(harness.scene) });
		expect(result.effects).toContainEqual(
			expect.objectContaining({ type: "send_beacon", expectVersion: 5 }),
		);
	});

	test("a version refusal withdraws the edit, shows the note and states its version next", () => {
		const harness = new ReportingHarness();
		harness.dispatch({ type: "note_version_learned", version: 2 });
		harness.edit("a", { x: 30 });
		harness.edit("b", { y: 30 });
		harness.due();
		expect(harness.server.requests).toHaveLength(1);
		// The note moved: an agent moved `a` and added `c` while the person dragged.
		const note = [{ ...find(harness.server.document, "a"), x: 99 }, box("b", 200), box("c", 400)];
		harness.refuseVersion(note, 3);

		expect(harness.state.noteVersion).toBe(3);
		expect(harness.state.inFlightReport).toBeNull();
		expect(reportsSettled(harness.state)).toBe(true);
		expect(find(harness.scene, "a").x).toBe(99);
		expect(find(harness.scene, "b").y).toBe(0);
		expect(harness.scene.some((element) => element.id === "c")).toBe(true);
		// Nothing of the person's edit is pending: the scene is the note.
		expect(harness.pendingIsReachable()).toBe(true);
		harness.due();
		expect(harness.server.requests).toHaveLength(0);
		expect(harness.settledReleaseChecks).toBeGreaterThan(0);
	});

	test("a version refusal carries the element under an open editor over", () => {
		const harness = new ReportingHarness();
		harness.withheldIds = ["t"];
		harness.scene = [...harness.scene, { id: "t", type: "text", text: "typing", x: 0, y: 0 }];
		harness.edit("a", { x: 30 });
		harness.dispatch({
			type: "immediate_report_requested",
			scene: copy(harness.scene),
			withheldIds: ["t"],
		});
		harness.refuseVersion([{ ...find(harness.server.document, "a"), x: 5 }, box("b", 200)], 9);
		expect(find(harness.scene, "a").x).toBe(5);
		expect(find(harness.scene, "t").text).toBe("typing");
		// The withheld element stays out of the baseline, so it is reported once the editor closes.
		expect(harness.state.baseline.has("t")).toBe(false);
		expect(harness.state.noteVersion).toBe(9);
	});

	test("withdrawing for a claim settles everything scheduled and ignores a stale answer", () => {
		const harness = new ReportingHarness();
		harness.edit("a", { x: 30 });
		harness.due();
		const sent = harness.server.refuse();
		harness.dispatch({ type: "edits_withdrawn" });
		expect(reportsSettled(harness.state)).toBe(true);
		const before = harness.state;
		harness.dispatch({
			type: "report_succeeded",
			generation: sent.generation,
			corrections: { upserts: [], deletes: [] },
			currentScene: copy(harness.scene),
			version: 11,
		});
		expect(harness.state).toBe(before);
	});
});
