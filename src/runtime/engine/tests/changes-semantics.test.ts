import { describe, expect, test } from "bun:test";
import { diffBoardStates, narrateChange } from "../changes.js";
import { compareBoards } from "../compare.js";
import { describeScene } from "../describe.js";
import type { BoardIdentity } from "../board.js";
import type { ServerElement } from "../types.js";

const identity: BoardIdentity = { board: "payments", variant: "current", level: "service" };

const box = (id: string, x: number, y: number, node?: string, kind = "service") =>
	({
		id,
		type: "rectangle",
		x,
		y,
		width: 200,
		height: 100,
		...(node ? { customData: { archboard: { node, kind, name: node } } } : {}),
	}) as ServerElement;

const label = (id: string, containerId: string, text: string, x: number, y: number) =>
	({
		id,
		type: "text",
		x: x + 20,
		y: y + 40,
		width: 100,
		height: 20,
		text,
		containerId,
	}) as ServerElement;

const arrow = (id: string, from: string, to: string) =>
	({
		id,
		type: "arrow",
		x: 0,
		y: 0,
		width: 10,
		height: 10,
		points: [
			[0, 0],
			[10, 10],
		],
		startBinding: { elementId: from, focus: 0, gap: 0 },
		endBinding: { elementId: to, focus: 0, gap: 0 },
	}) as ServerElement;

const scene = (): ServerElement[] => [
	box("a", 0, 0, "gateway", "gateway"),
	label("al", "a", "Gateway", 0, 0),
	box("b", 300, 0, "auth"),
	label("bl", "b", "AuthService", 300, 0),
	box("c", 600, 0, "pg", "datastore"),
	label("cl", "c", "Postgres", 600, 0),
	arrow("e1", "a", "b"),
	arrow("e2", "b", "c"),
];

const flatMetadataBox = () =>
	({
		id: "flat",
		type: "rectangle",
		x: 0,
		y: 0,
		width: 200,
		height: 100,
		label: { text: "Flat metadata" },
		customData: {
			kind: "service",
			binding: { path: "src/flat.ts" },
			path: "src/flat.ts",
			variant: "current",
			level: "service",
		},
	}) as ServerElement;

const diff = (before: ServerElement[], after: ServerElement[]) =>
	diffBoardStates(before, after, identity, "payments");

describe("semantic board changes", () => {
	test("flat foreign metadata remains anonymous", () => {
		const flat = flatMetadataBox();
		const description = describeScene([flat]);
		expect(description).toMatch(/0 nodes/);
		expect(description).toMatch(/1 plain/);
		expect(description).toMatch(/customData: kind=service/);

		const comparison = compareBoards(
			{ key: "payments", identity, elements: [], source: "memory" },
			{ key: "payments", identity, elements: [flat], source: "memory" },
		);
		expect(comparison.to.nodeCount).toBe(0);
		expect(comparison.to.plainCount).toBe(1);
		expect(comparison.plain.to.unidentified).toHaveLength(0);
		expect(comparison.plain.to.labelled[0]?.foreignCustomData?.kind).toBe("service");

		const change = diff([], [flat]);
		expect(change.nodes.added[0]).toMatchObject({ anonymous: true });
		expect(change.nodes.added[0]?.kind).toBeUndefined();
	});

	test("a 12-pixel nudge is insignificant", () => {
		const base = scene();
		const nudged = base.map((element) =>
			element.id === "b"
				? { ...element, x: 312 }
				: element.id === "bl"
					? { ...element, x: 332 }
					: element,
		);
		expect(diff(base, nudged).significance).toBe("none");
	});

	test("cut and rerouted edges are structural and named by their ends", () => {
		const base = scene();
		const cut = diff(
			base,
			base.filter((element) => element.id !== "e1"),
		);
		expect(cut.significance).toBe("structural");
		expect(cut.counts.edgesRemoved).toBe(1);
		expect(cut.edges.removed[0]).toMatchObject({
			fromName: "Gateway",
			toName: "AuthService",
		});

		const rerouted = base.map((element) =>
			element.id === "e2"
				? ({ ...element, startBinding: { elementId: "a", focus: 0, gap: 0 } } as ServerElement)
				: element,
		);
		expect(diff(base, rerouted).counts.edgesRerouted).toBe(1);
	});

	test("an anonymous box is reported and promotion preserves its identity", () => {
		const base = [...scene(), box("z", 620, 300), label("zl", "z", "Redis", 620, 300)];
		const added = diff(scene(), base);
		expect(added.significance).toBe("structural");
		expect(added.counts.nodesAdded).toBe(1);
		expect(added.nodes.added[0]).toMatchObject({ anonymous: true, name: "Redis" });

		const promoted = base.map((element) =>
			element.id === "z"
				? ({
						...element,
						customData: { archboard: { node: "redis", kind: "datastore", name: "Redis" } },
					} as ServerElement)
				: element,
		);
		const change = diff(base, promoted);
		expect(change.counts).toMatchObject({
			identityChanges: 1,
			nodesAdded: 0,
			nodesRemoved: 0,
		});
		expect(change.layout.clusters).toHaveLength(0);
		expect(change.nodes.identity[0]).toMatchObject({
			what: "promoted",
			to: { kind: "datastore" },
		});
	});

	test("first bound-label sync and recolouring stay silent", () => {
		const labelled = {
			...box("a", 0, 0, "gateway", "gateway"),
			label: { text: "Gateway" },
		} as ServerElement;
		expect(
			diff([labelled], [labelled, label("al", "a", "Gateway", 0, 0)]).counts.nodesChanged,
		).toBe(0);

		const base = scene();
		const recoloured = base.map((element) =>
			element.id === "a" ? { ...element, backgroundColor: "#ffc9c9" } : element,
		);
		expect(diff(base, recoloured).significance).toBe("cosmetic");
	});

	test("structural narration uses names instead of element ids", () => {
		const base = scene();
		const pulled = base.map((element) =>
			element.id === "b"
				? { ...element, y: 1400 }
				: element.id === "bl"
					? { ...element, y: 1440 }
					: element,
		);
		const change = diff(base, pulled);
		expect(change.significance).toBe("layout");
		expect(change.nodes.moved.find((move) => move.node === "auth")?.changes).toHaveProperty(
			"cluster",
		);
		expect(narrateChange(change)).toContain("AuthService");
		expect(narrateChange(change)).not.toContain("el:");
	});
});
