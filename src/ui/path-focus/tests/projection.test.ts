import { describe, expect, test } from "bun:test";

import { projectConnectedPath, samePathFocusSnapshot, type PathFocusElement } from "../index.ts";

function shape(id: string): PathFocusElement {
	return { id, type: "rectangle" };
}

function arrow(id: string, startId: string | null, endId: string | null): PathFocusElement {
	return {
		id,
		type: "arrow",
		startBinding: startId ? { elementId: startId, focus: 0, gap: 0 } : null,
		endBinding: endId ? { elementId: endId, focus: 0, gap: 0 } : null,
	};
}

function label(id: string, containerId: string): PathFocusElement {
	return { id, type: "text", containerId };
}

describe("connected path projection", () => {
	test("returns explicit no-path states for empty, multiple, missing, and isolated selections", () => {
		const scene = [shape("a")];
		expect(projectConnectedPath(scene, [])).toEqual({
			state: "no-path",
			reason: "empty",
			selectedId: null,
		});
		expect(projectConnectedPath(scene, ["a", "b"])).toEqual({
			state: "no-path",
			reason: "multiple",
			selectedId: null,
		});
		expect(projectConnectedPath(scene, ["gone"])).toEqual({
			state: "no-path",
			reason: "missing",
			selectedId: "gone",
		});
		expect(projectConnectedPath(scene, ["a"])).toEqual({
			state: "no-path",
			reason: "isolated",
			selectedId: "a",
		});
	});

	test("includes direct and transitive vertices, connecting arrows, and bound labels", () => {
		const scene = [
			shape("a"),
			shape("b"),
			shape("c"),
			shape("unrelated"),
			arrow("ab", "a", "b"),
			arrow("bc", "b", "c"),
			label("label-a", "a"),
			label("label-ab", "ab"),
			label("label-unrelated", "unrelated"),
		];
		expect(projectConnectedPath(scene, ["a"])).toEqual({
			state: "connected",
			selectedId: "a",
			elementIds: ["a", "ab", "b", "bc", "c", "label-a", "label-ab"],
		});
	});

	test("terminates on cycles and returns the same sorted component from every vertex", () => {
		const scene = [
			shape("a"),
			shape("b"),
			shape("c"),
			arrow("ca", "c", "a"),
			arrow("ab", "a", "b"),
			arrow("bc", "b", "c"),
		];
		const expected = ["a", "ab", "b", "bc", "c", "ca"];
		for (const id of ["a", "b", "c"]) {
			expect(projectConnectedPath(scene, [id])).toEqual({
				state: "connected",
				selectedId: id,
				elementIds: expected,
			});
		}
	});

	test("ignores broken arrows and refuses to seed traversal from one", () => {
		const scene = [
			shape("a"),
			shape("b"),
			arrow("valid", "a", "b"),
			arrow("missing-start", "gone", "a"),
			arrow("missing-end", "b", "gone"),
			arrow("unbound", null, null),
		];
		expect(projectConnectedPath(scene, ["a"])).toEqual({
			state: "connected",
			selectedId: "a",
			elementIds: ["a", "b", "valid"],
		});
		for (const id of ["missing-start", "missing-end", "unbound"]) {
			expect(projectConnectedPath(scene, [id])).toEqual({
				state: "no-path",
				reason: "broken",
				selectedId: id,
			});
		}
	});

	test("a selected arrow or label bound to an endpoint or arrow seeds the canonical component", () => {
		const scene = [
			shape("a"),
			shape("b"),
			arrow("ab", "a", "b"),
			label("label-a", "a"),
			label("label-ab", "ab"),
		];
		for (const id of ["ab", "label-a", "label-ab"]) {
			expect(projectConnectedPath(scene, [id])).toEqual({
				state: "connected",
				selectedId: id,
				elementIds: ["a", "ab", "b", "label-a", "label-ab"],
			});
		}
		expect(projectConnectedPath([label("orphan-label", "gone")], ["orphan-label"])).toEqual({
			state: "no-path",
			reason: "broken",
			selectedId: "orphan-label",
		});
		expect(
			projectConnectedPath(
				[shape("a"), arrow("broken", "a", "gone"), label("broken-label", "broken")],
				["broken-label"],
			),
		).toEqual({ state: "no-path", reason: "broken", selectedId: "broken-label" });
	});

	test("snapshot equality is deterministic across rebuilt projections", () => {
		const scene = [shape("a"), shape("b"), arrow("ab", "a", "b")];
		const first = projectConnectedPath(scene, ["a"]);
		const same = projectConnectedPath(scene.toReversed(), ["a"]);
		const changed = projectConnectedPath(scene, ["b"]);
		expect(samePathFocusSnapshot(first, same)).toBe(true);
		expect(samePathFocusSnapshot(first, changed)).toBe(false);
		expect(samePathFocusSnapshot({ state: "inactive" }, { state: "inactive" })).toBe(true);
	});
});
