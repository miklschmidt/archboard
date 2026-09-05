import { describe, expect, test } from "bun:test";

import {
	projectSelection,
	sameSelectionProjection,
	type SelectionElement,
} from "@/ui/selection-inspector";

/**
 * A rectangle carrying archboard metadata, or none.
 * @param id Its id.
 * @param archboard What sits under `customData.archboard`, if anything.
 * @returns The element.
 */
function element(id: string, archboard?: unknown): SelectionElement {
	return archboard === undefined
		? { id, type: "rectangle" }
		: { id, type: "rectangle", customData: { archboard } };
}

describe("selected-element projection", () => {
	test("distinguishes empty, multiple, and disappeared selections", () => {
		const scene = [element("box-1")];
		expect(projectSelection(scene, [])).toEqual({ kind: "empty" });
		expect(projectSelection(scene, ["box-1", "box-2"])).toEqual({ kind: "multiple", count: 2 });
		expect(projectSelection(scene, ["gone"])).toEqual({ kind: "missing", id: "gone" });
	});

	test("whitelists string metadata and classifies an absent binding as unbound", () => {
		const projection = projectSelection(
			[
				element("box-1", {
					node: "checkout",
					kind: "service",
					name: "Checkout",
					variant: "current",
					level: "component",
					secret: "/home/person/checkout",
					objectValue: { mustNotLeak: true },
				}),
			],
			["box-1"],
		);
		expect(projection).toEqual({
			kind: "unbound",
			element: {
				id: "box-1",
				type: "rectangle",
				metadata: {
					node: "checkout",
					kind: "service",
					name: "Checkout",
					variant: "current",
					level: "component",
				},
			},
		});
	});

	test("returns the strict portable binding and omits unknown data", () => {
		const projection = projectSelection(
			[
				element("box-1", {
					node: "checkout",
					binding: {
						repo: "github.com/acme/checkout",
						path: "src/checkout/service.ts",
						branch: "main",
						commit: "62f0cef",
						confirmedAt: "2026-08-24T10:30:00Z",
					},
					privatePath: "/home/person/checkout",
				}),
			],
			["box-1"],
		);
		expect(projection).toEqual({
			kind: "bound",
			element: { id: "box-1", type: "rectangle", metadata: { node: "checkout" } },
			binding: {
				repo: "github.com/acme/checkout",
				path: "src/checkout/service.ts",
				branch: "main",
				commit: "62f0cef",
				confirmedAt: "2026-08-24T10:30:00Z",
			},
		});
	});

	test.each([
		{ repo: "github.com/acme/checkout", path: "/home/person/checkout.ts" },
		{ repo: "github.com/acme/checkout", path: "C:\\Users\\person\\checkout.ts" },
		{ repo: "github.com/acme/checkout", path: "../../outside.ts" },
		{ repo: "github.com/acme/checkout", path: "src/index.ts", extra: true },
		{ repo: " ", path: "src/index.ts" },
		{ path: "src/index.ts" },
		"not-an-object",
	])("classifies a malformed or non-portable binding without exposing it: %#", (binding) => {
		const projection = projectSelection([element("box-1", { binding })], ["box-1"]);
		expect(projection).toMatchObject({
			kind: "malformed",
			element: { id: "box-1", type: "rectangle", metadata: {} },
		});
		if (projection.kind !== "malformed") {
			throw new Error("A malformed binding must project as malformed");
		}
		expect(projection.explanation.length).toBeGreaterThan(10);
		expect(projection.explanation).not.toContain("/home/person");
		expect(projection.explanation).not.toContain("C:\\Users");
	});

	test("explains why a portable-looking path is refused", () => {
		const absolute = projectSelection(
			[element("box-1", { binding: { repo: "github.com/acme/checkout", path: "/etc/passwd" } })],
			["box-1"],
		);
		const climbing = projectSelection(
			[element("box-1", { binding: { repo: "github.com/acme/checkout", path: "../outside.ts" } })],
			["box-1"],
		);
		expect(absolute).toMatchObject({
			kind: "malformed",
			explanation: expect.stringContaining("absolute"),
		});
		expect(climbing).toMatchObject({
			kind: "malformed",
			explanation: expect.stringContaining("climbs"),
		});
	});

	test("compares only projected fields for publication deduplication", () => {
		const first = projectSelection(
			[element("box-1", { node: "checkout", ignored: "first" })],
			["box-1"],
		);
		const same = projectSelection(
			[element("box-1", { node: "checkout", ignored: "second" })],
			["box-1"],
		);
		const changed = projectSelection([element("box-1", { node: "payments" })], ["box-1"]);
		expect(sameSelectionProjection(first, same)).toBe(true);
		expect(sameSelectionProjection(first, changed)).toBe(false);
	});
});
