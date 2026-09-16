import { expect, test } from "bun:test";
import { diagramTextWidth } from "@/runtime/semantic-renderer/index";
import { measureArchitecture, type TextRun } from "@/runtime/semantic-renderer/measurement";
import { emptyContent, type VariantContent } from "@/shared/semantic-board/index";

/**
 * A run's width as the host canvas measures the whole line, in the face it is set in.
 * @param run The run.
 * @returns Its width.
 */
function exactWidth(run: TextRun): number {
	const family = run.font.family === "mono" ? "Archboard Diagram Mono" : "Archboard Diagram Sans";
	return diagramTextWidth(run.text, { family, weight: run.font.weight }, run.fontSize);
}

function letters(text: string): string {
	return text.replace(/\s+/g, "");
}

test("measurement preserves complete words at fixed readable sizes and bounds their exact painted widths", () => {
	const name = "AuthenticationAndAuthorizationWithUninterruptedLongIdentifiers";
	const responsibility =
		"Owns the complete request lifecycle while preserving every responsibility word across all wrapped lines.";
	const label = "authentication and authorization requests delivered with the complete payload";
	const content: VariantContent = {
		...emptyContent(),
		nodes: [{ id: "api", name, responsibility, kind: "service" }],
		edges: [{ id: "call", from: "api", to: "api", kind: "call", label, emphasis: "normal" }],
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
		expect(run.width).toBe(exactWidth(run));
		expect(run.x).toBe(52);
		expect(run.x + run.width).toBeLessThanOrEqual(card.width - 16);
		expect(run.y).toBeLessThan(card.height - 16);
	}
	const plate = measured.labels.get("call")!;
	expect(letters(plate.runs.map((run) => run.text).join(""))).toBe(letters(label));
	expect(plate.runs.length).toBeGreaterThan(1);
	for (const run of plate.runs) {
		expect(run.fontSize).toBe(10);
		expect(run.width).toBe(exactWidth(run));
		expect(run.x + run.width).toBeLessThanOrEqual(plate.width - 10);
		expect(run.y).toBeLessThan(plate.height - 8);
	}
});

test("structural parents reserve the whole wrapped header and keep descriptions in inspection", () => {
	const description = "This extended inspector prose must not become another canvas paragraph.";
	const content: VariantContent = {
		...emptyContent(),
		nodes: [
			{
				id: "parent",
				name: "Service ownership and request orchestration",
				responsibility: "Coordinates authentication, authorization, and service request dispatch.",
				description,
				kind: "service",
			},
			{ id: "child", name: "Token store", parent: "parent", kind: "module" },
		],
	};
	const measured = measureArchitecture(content);
	const parent = measured.nodes.get("parent")!;
	expect(parent.headerHeight).toBe(parent.height);
	expect(parent.headerHeight).toBeGreaterThan(72);
	expect(parent.runs.every((run) => run.x === 56 && run.y < parent.headerHeight - 20)).toBeTrue();
	expect(parent.runs.some((run) => description.includes(run.text))).toBeFalse();
	expect(measured.nodes.get("child")!.headerHeight).toBe(0);
	expect(
		parent.runs
			.filter((run) => run.role === "title")
			.map((run) => run.text)
			.join(""),
	).toBe(content.nodes[0]!.name);
});

test("cached preparation keeps faces and sizes distinct across repeated renders", () => {
	const content: VariantContent = {
		...emptyContent(),
		nodes: [
			{
				id: "api",
				name: "AVAST Waterfall Office",
				responsibility: "AVAST Waterfall Office",
				kind: "service",
			},
		],
		edges: [
			{
				id: "call",
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
		nodes: [{ id: "other", name: "WWWW iii ffi To Vary AWAY", kind: "service" }],
	});
	expect(measureArchitecture(content)).toEqual(first);
	const runs = [...first.nodes.get("api")!.runs, ...first.labels.get("call")!.runs];
	for (const run of runs) {
		expect(run.width).toBe(exactWidth(run));
	}
	expect(new Set(runs.map((run) => run.width)).size).toBeGreaterThan(2);
	expect(measureArchitecture(emptyContent())).toEqual({ nodes: new Map(), labels: new Map() });
});
