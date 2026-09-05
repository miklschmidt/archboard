import { describe, expect, test } from "bun:test";

import {
	hasSelectedElement,
	sameSelectionProjection,
	selectedElementTitle,
	type SelectedElement,
	type SelectionProjection,
} from "@/ui/selection-inspector";

const service: SelectedElement = {
	id: "k3m9",
	type: "rectangle",
	metadata: { node: "checkout", kind: "service", name: "Checkout Service", level: "L2" },
};

const binding = { repo: "checkout", path: "services/checkout", branch: "main" };

const bound: SelectionProjection = { kind: "bound", element: service, binding };

describe("sameSelectionProjection", () => {
	test("kinds must match", () => {
		expect(sameSelectionProjection({ kind: "empty" }, { kind: "empty" })).toBe(true);
		expect(sameSelectionProjection({ kind: "empty" }, { kind: "multiple", count: 2 })).toBe(false);
		expect(
			sameSelectionProjection(
				{ kind: "unbound", element: service },
				{ kind: "missing", id: "k3m9" },
			),
		).toBe(false);
	});

	test("counts and ids compare by value", () => {
		expect(
			sameSelectionProjection({ kind: "multiple", count: 3 }, { kind: "multiple", count: 3 }),
		).toBe(true);
		expect(
			sameSelectionProjection({ kind: "multiple", count: 3 }, { kind: "multiple", count: 4 }),
		).toBe(false);
		expect(
			sameSelectionProjection({ kind: "missing", id: "a" }, { kind: "missing", id: "b" }),
		).toBe(false);
	});

	test("an element compares by id, type and every metadata key", () => {
		const renamed: SelectedElement = {
			...service,
			metadata: { ...service.metadata, name: "Cart" },
		};
		expect(
			sameSelectionProjection(
				{ kind: "unbound", element: service },
				{ kind: "unbound", element: { ...service } },
			),
		).toBe(true);
		expect(
			sameSelectionProjection(
				{ kind: "unbound", element: service },
				{ kind: "unbound", element: renamed },
			),
		).toBe(false);
	});

	test("a binding compares by every field, including the optional ones", () => {
		const confirmed: SelectionProjection = {
			kind: "bound",
			element: service,
			binding: { ...binding, commit: "a1b2c3d" },
		};
		expect(sameSelectionProjection(bound, { ...bound })).toBe(true);
		expect(sameSelectionProjection(bound, confirmed)).toBe(false);
	});

	test("a malformed binding compares by its explanation", () => {
		const left: SelectionProjection = {
			kind: "malformed",
			element: service,
			explanation: "repo is empty",
		};
		expect(sameSelectionProjection(left, { ...left })).toBe(true);
		expect(sameSelectionProjection(left, { ...left, explanation: "path is missing" })).toBe(false);
	});
});

describe("element helpers", () => {
	test("only the element-carrying kinds have an element", () => {
		expect(hasSelectedElement(bound)).toBe(true);
		expect(hasSelectedElement({ kind: "empty" })).toBe(false);
		expect(hasSelectedElement({ kind: "missing", id: "x" })).toBe(false);
	});

	test("the title is the name when set, else the id", () => {
		expect(selectedElementTitle(service)).toBe("Checkout Service");
		expect(selectedElementTitle({ id: "q1", type: "ellipse", metadata: {} })).toBe("q1");
	});
});
