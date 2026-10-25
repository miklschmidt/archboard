import { expect, test } from "bun:test";
import { measureArchitecture } from "#runtime/operations/measure.ts";
import { emptyContent, type VariantContent } from "@archboard/board/content";

function letters(text: string): string {
	return text.replace(/\s+/g, "");
}

test("measurement preserves complete words at fixed readable sizes inside their card and plate", () => {
	const name = "AuthenticationAndAuthorizationWithUninterruptedLongIdentifiers";
	const responsibility =
		"Owns the complete request lifecycle while preserving every responsibility word across all wrapped lines.";
	const label = "authentication and authorization requests delivered with the complete payload";
	const content: VariantContent = {
		...emptyContent(),
		nodes: [{ id: "api", order: 1000, name, responsibility, kind: "service" }],
		edges: [
			{ id: "call", order: 1000, from: "api", to: "api", kind: "call", label, emphasis: "normal" },
		],
	};
	const measured = measureArchitecture(content);
	const card = measured.nodes.get("api")!;
	const titleRuns = card.runs.filter((run) => run.role === "title");
	const noteRuns = card.runs.filter((run) => run.role === "note");
	expect(titleRuns.length).toBeGreaterThan(1);
	expect(noteRuns.length).toBeGreaterThan(1);
	expect(letters(titleRuns.map((run) => run.text).join(""))).toBe(name);
	expect(letters(noteRuns.map((run) => run.text).join(""))).toBe(letters(responsibility));
	expect(titleRuns.every((run) => run.fontSize === 14)).toBeTrue();
	expect(noteRuns.every((run) => run.fontSize === 11)).toBeTrue();
	expect(card.headerHeight).toBe(0);
	for (const run of card.runs) {
		expect(run.x).toBe(52);
		expect(run.x + run.width).toBeLessThanOrEqual(card.width - 16);
		expect(run.y).toBeLessThan(card.height - 16);
	}
	const plate = measured.labels.get("call")!;
	expect(letters(plate.runs.map((run) => run.text).join(""))).toBe(letters(label));
	expect(plate.runs.length).toBeGreaterThan(1);
	for (const run of plate.runs) {
		expect(run.fontSize).toBe(10);
		expect(run.x + run.width).toBeLessThanOrEqual(plate.width - 10);
		expect(run.y).toBeLessThan(plate.height - 8);
	}
});

// From the dogfood boards: a wrapped line kept the space it broke at, and the
// card grew past its 340 px maximum by that space's width.
test("a card's wrapped lines do not widen it by the space they broke at", () => {
	const content: VariantContent = {
		...emptyContent(),
		nodes: [
			{
				id: "socket",
				order: 1000,
				name: "Pane socket",
				kind: "module",
				responsibility:
					"One socket per page: registers it with the panes, and passes its agent messages to the Codex workbench",
			},
		],
	};
	const card = measureArchitecture(content).nodes.get("socket")!;
	for (const run of card.runs) expect(run.text).toBe(run.text.trimEnd());
	expect(card.width).toBeLessThan(341);
});

test("a relationship's plate hugs its balanced lines and centres them on the line it labels", () => {
	// One line of this is just wider than a plate's text room, and one glyph is far narrower.
	// The long word is wider than half the words, so a wrap balanced below it would break it.
	const labels = {
		wrapped: "thread/start with the coordinator body",
		glyph: "/",
		long: "layoutWithLines(handle, width, lineHeight)",
	};
	const measured = measureArchitecture({
		...emptyContent(),
		nodes: [{ id: "api", order: 1000, name: "API", kind: "service" }],
		edges: Object.entries(labels).map(([id, label]) => ({
			id,
			order: 1000,
			from: "api",
			to: "api",
			kind: "call" as const,
			label,
			emphasis: "normal" as const,
		})),
	});
	const wrapped = measured.labels.get("wrapped")!;
	const widths = wrapped.runs.map((run) => run.width);
	expect(wrapped.runs).toHaveLength(2);
	expect(wrapped.width).toBeCloseTo(Math.max(...widths) + 20, 6);
	// Balanced: no word is left alone on the last line.
	expect(Math.min(...widths)).toBeGreaterThan(Math.max(...widths) / 2);
	// Balanced, but never inside a word that the plate's room holds whole.
	const long = measured.labels.get("long")!.runs.flatMap((run) => run.text.split(" "));
	expect(long).toEqual(labels.long.split(" "));
	for (const plate of [wrapped, measured.labels.get("glyph")!]) {
		expect(plate.width).toBeGreaterThanOrEqual(40);
		for (const run of plate.runs) {
			expect(run.x + run.width / 2).toBeCloseTo(plate.width / 2, 6);
		}
	}
});

test("structural parents reserve the whole wrapped header and keep descriptions in inspection", () => {
	const description = "This extended inspector prose must not become another canvas paragraph.";
	const content: VariantContent = {
		...emptyContent(),
		nodes: [
			{
				id: "parent",
				order: 1000,
				name: "Service ownership and request orchestration",
				responsibility: "Coordinates authentication, authorization, and service request dispatch.",
				description,
				kind: "service",
			},
			{ id: "child", order: 1000, name: "Token store", parent: "parent", kind: "module" },
		],
	};
	const measured = measureArchitecture(content);
	const parent = measured.nodes.get("parent")!;
	expect(parent.headerHeight).toBe(parent.height);
	expect(parent.headerHeight).toBeGreaterThan(72);
	// Its words stand on its header slab as a card's stand on its own.
	expect(parent.runs.every((run) => run.x === 60 && run.y < parent.headerHeight - 16)).toBeTrue();
	expect(parent.runs.some((run) => description.includes(run.text))).toBeFalse();
	expect(measured.nodes.get("child")!.headerHeight).toBe(0);
	expect(
		parent.runs
			.filter((run) => run.role === "title")
			.map((run) => run.text)
			.join(" "),
	).toBe(content.nodes[0]!.name);
});

test("cached preparation keeps faces and sizes distinct across repeated renders", () => {
	const content: VariantContent = {
		...emptyContent(),
		nodes: [
			{
				id: "api",
				order: 1000,
				name: "AVAST Waterfall Office",
				responsibility: "AVAST Waterfall Office",
				kind: "service",
			},
		],
		edges: [
			{
				id: "call",
				order: 1000,
				from: "api",
				to: "api",
				kind: "call",
				label: "AVAST Waterfall Office",
				emphasis: "normal",
			},
		],
	};
	const first = measureArchitecture(content);
	measureArchitecture({
		...emptyContent(),
		nodes: [{ id: "other", order: 1000, name: "WWWW iii ffi To Vary AWAY", kind: "service" }],
	});
	expect(measureArchitecture(content)).toEqual(first);
	const runs = [...first.nodes.get("api")!.runs, ...first.labels.get("call")!.runs];
	expect(new Set(runs.map((run) => run.width)).size).toBeGreaterThan(2);
	expect(measureArchitecture(emptyContent())).toEqual({
		nodes: new Map(),
		labels: new Map(),
		lines: new Map(),
	});
});
