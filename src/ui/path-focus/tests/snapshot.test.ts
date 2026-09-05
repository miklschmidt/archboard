import { describe, expect, test } from "bun:test";

import {
	describePathFocusReason,
	samePathFocusOverlay,
	samePathFocusSnapshot,
	type PathFocusOverlay,
	type PathFocusSnapshot,
} from "@/ui/path-focus";

const connected: PathFocusSnapshot = {
	kind: "connected",
	selectedId: "k3m9",
	elementIds: ["k3m9", "arrow1", "db7"],
};

describe("samePathFocusSnapshot", () => {
	test("kinds must match", () => {
		expect(samePathFocusSnapshot({ kind: "inactive" }, { kind: "inactive" })).toBe(true);
		expect(samePathFocusSnapshot({ kind: "inactive" }, connected)).toBe(false);
	});

	test("no-path compares by reason and selected id, null included", () => {
		const empty: PathFocusSnapshot = { kind: "no-path", reason: "empty", selectedId: null };
		expect(samePathFocusSnapshot(empty, { ...empty })).toBe(true);
		expect(samePathFocusSnapshot(empty, { ...empty, reason: "multiple" })).toBe(false);
		expect(samePathFocusSnapshot(empty, { ...empty, selectedId: "k3m9" })).toBe(false);
	});

	test("connected compares by selected id and the ordered element ids", () => {
		expect(
			samePathFocusSnapshot(connected, { ...connected, elementIds: [...connected.elementIds] }),
		).toBe(true);
		expect(
			samePathFocusSnapshot(connected, { ...connected, elementIds: ["db7", "arrow1", "k3m9"] }),
		).toBe(false);
		expect(samePathFocusSnapshot(connected, { ...connected, elementIds: ["k3m9"] })).toBe(false);
		expect(samePathFocusSnapshot(connected, { ...connected, selectedId: "db7" })).toBe(false);
	});
});

describe("samePathFocusOverlay", () => {
	const overlay: PathFocusOverlay = {
		paneId: "A",
		rectangles: [
			{ x: 10, y: 20, width: 100, height: 50 },
			{ x: 200, y: 20, width: 80, height: 50 },
		],
	};

	test("compares the pane and every rectangle side", () => {
		expect(samePathFocusOverlay(overlay, { ...overlay, rectangles: [...overlay.rectangles] })).toBe(
			true,
		);
		expect(samePathFocusOverlay(overlay, { ...overlay, paneId: "B" })).toBe(false);
		expect(
			samePathFocusOverlay(overlay, {
				...overlay,
				rectangles: [overlay.rectangles[0] ?? { x: 0, y: 0, width: 0, height: 0 }],
			}),
		).toBe(false);
		expect(
			samePathFocusOverlay(overlay, {
				...overlay,
				rectangles: [
					{ x: 10, y: 20, width: 100, height: 51 },
					{ x: 200, y: 20, width: 80, height: 50 },
				],
			}),
		).toBe(false);
	});
});

describe("describePathFocusReason", () => {
	test("every reason has one plain sentence", () => {
		for (const reason of ["empty", "multiple", "missing", "isolated", "broken"] as const) {
			expect(describePathFocusReason(reason).length).toBeGreaterThan(10);
		}
	});
});
