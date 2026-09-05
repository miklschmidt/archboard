import { describe, expect, test } from "bun:test";

import { hasPendingEdits, reportsSettled, type SceneElement } from "@/ui/canvas/change-reporting";
import {
	ReportingHarness,
	find,
	initialScene,
} from "@/ui/canvas/tests/support/change-reporting-harness";

describe("report acknowledgement ordering", () => {
	test("an earlier reply never replaces a later user edit", () => {
		const harness = new ReportingHarness();
		harness.edit("a", { x: 10 });
		expect(harness.pendingIsReachable()).toBe(true);
		harness.due();
		expect(harness.pendingIsReachable()).toBe(true);
		harness.edit("a", { x: 20 });
		expect(harness.pendingIsReachable()).toBe(true);
		harness.accept();
		expect(find(harness.scene, "a").x).toBe(20);
		expect(harness.pendingIsReachable()).toBe(true);

		harness.due();
		expect(harness.pendingIsReachable()).toBe(true);
		harness.accept();
		expect(harness.pendingIsReachable()).toBe(true);
		expect(find(harness.server.document, "a").x).toBe(20);
		expect(reportsSettled(harness.state)).toBe(true);
	});

	test("an empty acknowledgement advances the baseline without replacing the scene", () => {
		const harness = new ReportingHarness();
		const updatesBefore = harness.sceneUpdates;
		harness.edit("a", { x: 10 });
		harness.due();
		harness.accept();
		expect(harness.sceneUpdates).toBe(updatesBefore);
		expect(hasPendingEdits(harness.state, harness.scene)).toBe(false);
		expect(find(harness.scene, "a").x).toBe(10);
	});

	test("canonical settlement corrects the full request-local document in one scene update", () => {
		const harness = new ReportingHarness();
		harness.edit("a", { x: 10 });
		harness.due();
		const correctedA = { ...find(harness.scene, "a"), x: 11, rawText: "canonical" };
		const correctedB = { ...find(harness.scene, "b"), y: 9 };
		const updatesBefore = harness.sceneUpdates;
		harness.accept({ upserts: [correctedA, correctedB], deletes: [] });

		expect(harness.sceneUpdates).toBe(updatesBefore + 1);
		expect(find(harness.scene, "b").y).toBe(9);
		expect(harness.scene).toEqual(harness.server.document);
		expect(hasPendingEdits(harness.state, harness.scene)).toBe(false);
	});

	test("a stale canonical correction caused by post-send normalization remains scheduled", () => {
		const harness = new ReportingHarness();
		harness.edit("a", { x: 10 });
		harness.due();
		harness.scene = harness.scene.map((element) =>
			element.id === "b" ? { ...element, boundElements: [] } : element,
		);
		harness.accept({
			upserts: [
				{ ...find(harness.server.document, "b"), boundElements: [{ id: "edge", type: "arrow" }] },
			],
			deletes: [],
		});
		expect(hasPendingEdits(harness.state, harness.scene)).toBe(true);
		expect(reportsSettled(harness.state)).toBe(false);
	});
});

/**
 * Whether the newer move survived.
 * @param element The element after the correction.
 * @returns True at x 20.
 */
function movedTo20(element: SceneElement): boolean {
	return element.x === 20;
}

/**
 * Whether the newer resize survived.
 * @param element The element after the correction.
 * @returns True at width 150.
 */
function resizedTo150(element: SceneElement): boolean {
	return element.width === 150;
}

/**
 * Whether the newer typing survived.
 * @param element The element after the correction.
 * @returns True with text C.
 */
function typedC(element: SceneElement): boolean {
	return element.text === "C";
}

describe("per-id freshness", () => {
	/** One correction scenario: what was sent, what changed after, what came back. */
	interface Scenario {
		name: string;
		scene: SceneElement[];
		id: string;
		sent: Record<string, unknown>;
		newer: Record<string, unknown>;
		correction: Record<string, unknown>;
		kept: (element: SceneElement) => boolean;
	}

	const cases: Scenario[] = [
		{
			name: "move",
			scene: initialScene(),
			id: "a",
			sent: { x: 10 },
			newer: { x: 20 },
			correction: { x: 11 },
			kept: movedTo20,
		},
		{
			name: "resize",
			scene: initialScene(),
			id: "a",
			sent: { width: 130 },
			newer: { width: 150 },
			correction: { width: 140 },
			kept: resizedTo150,
		},
		{
			name: "typing",
			scene: [...initialScene(), { id: "txt", type: "text", text: "A", x: 0, y: 120, version: 1 }],
			id: "txt",
			sent: { text: "B" },
			newer: { text: "C" },
			correction: { text: "B", rawText: "B" },
			kept: typedC,
		},
	];

	test.each(cases)(
		"a correction preserves a newer local $name and the next delta converges",
		(item) => {
			const harness = new ReportingHarness(item.scene);
			harness.edit(item.id, item.sent);
			harness.due();
			harness.edit(item.id, item.newer);
			harness.accept({
				upserts: [{ ...find(harness.server.document, item.id), ...item.correction }],
				deletes: [],
			});
			expect(item.kept(find(harness.scene, item.id))).toBe(true);
			harness.due();
			expect(harness.server.requests[0]?.report.upserts).toContainEqual(
				expect.objectContaining({ id: item.id }),
			);
			harness.accept();
		},
	);

	test("a correction never restores an element deleted after send", () => {
		const harness = new ReportingHarness();
		harness.edit("a", { x: 10 });
		harness.due();
		harness.remove("a");
		harness.accept({
			upserts: [{ ...find(harness.server.document, "a"), x: 11 }],
			deletes: [],
		});
		expect(harness.scene.some((element) => element.id === "a")).toBe(false);
		harness.due();
		expect(harness.server.requests[0]?.report.deletes).toContain("a");
		harness.accept();
	});
});

describe("acknowledgements across server updates", () => {
	test("an in-flight user report and an overlapping server update both survive", () => {
		const harness = new ReportingHarness();
		harness.edit("a", { x: 10 });
		harness.due();
		expect(harness.pendingIsReachable()).toBe(true);
		harness.server.document = harness.server.document.map((element) =>
			element.id === "b" ? { ...element, y: 40 } : element,
		);
		harness.applyServerElements([{ ...find(harness.scene, "b"), y: 40 }]);
		harness.clock.advance(0);
		expect(harness.pendingIsReachable()).toBe(true);
		harness.accept();
		expect(harness.pendingIsReachable()).toBe(true);
		expect(find(harness.scene, "a").x).toBe(10);
		expect(find(harness.scene, "b").y).toBe(40);
	});

	test("a pre-callback local edit captured in a server-update stamp remains reachable", () => {
		const harness = new ReportingHarness();
		harness.scene = harness.scene.map((element) =>
			element.id === "a" ? { ...element, x: 19, version: 2 } : element,
		);
		harness.applyServerElements([{ ...find(harness.server.document, "b"), y: 31 }]);
		harness.dispatch({ type: "scene_changed", scene: structuredClone(harness.scene) });
		harness.clock.advance(0);
		expect(hasPendingEdits(harness.state, harness.scene)).toBe(true);
		expect(reportsSettled(harness.state)).toBe(false);
		harness.due();
		expect(harness.server.requests[0]?.report.upserts).toContainEqual(
			expect.objectContaining({ id: "a", x: 19 }),
		);
	});
});
