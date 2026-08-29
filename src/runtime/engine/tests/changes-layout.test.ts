import { describe, expect, test } from "bun:test";
import { diffBoardStates } from "../changes.js";
import { boundTextDrift } from "../labels.js";
import type { BoardIdentity } from "../board.js";
import type { ServerElement } from "../types.js";
import { completeElement } from "./support/elements.ts";

const identity: BoardIdentity = { board: "payments", variant: "current", level: "service" };
const box = (id: string, x: number, y: number, node: string) =>
	completeElement({
		id,
		type: "rectangle",
		x,
		y,
		width: 200,
		height: 100,
		customData: { archboard: { node, kind: "service", name: node } },
	});
const label = (id: string, containerId: string, text: string, x: number, y: number) =>
	completeElement({
		id,
		type: "text",
		x: x + 20,
		y: y + 40,
		width: 100,
		height: 20,
		text,
		containerId,
	});
const arrow = (id: string, from: string, to: string) =>
	completeElement({
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
	});
const scene = (): ServerElement[] => [
	box("a", 0, 0, "gateway"),
	label("al", "a", "Gateway", 0, 0),
	box("b", 300, 0, "auth"),
	label("bl", "b", "AuthService", 300, 0),
	box("c", 600, 0, "pg"),
	label("cl", "c", "Postgres", 600, 0),
	arrow("e1", "a", "b"),
	arrow("e2", "b", "c"),
];
const diff = (before: ServerElement[], after: ServerElement[]) =>
	diffBoardStates(before, after, identity, "payments");
const regionMoves = (change: ReturnType<typeof diff>) =>
	change.nodes.moved.filter((move) => "region" in move.changes);

describe("layout board changes", () => {
	test("bound-label drift exposes the wrong layout account", () => {
		const base = scene();
		const stranded = base.map((element) => (element.id === "b" ? { ...element, y: 900 } : element));
		const carried = stranded.map((element) =>
			element.id === "bl" ? { ...element, y: 940 } : element,
		);

		expect(boundTextDrift(stranded).map((drift) => drift.textId)).toEqual(["bl"]);
		expect(boundTextDrift(carried)).toHaveLength(0);

		const wrong = diff(base, stranded);
		const right = diff(base, carried);
		expect(right.nodes.moved).toHaveLength(3);
		expect(right.nodes.moved.every((node) => "cluster" in node.changes)).toBeTrue();
		expect(wrong.nodes.moved).toHaveLength(1);
		expect(wrong.nodes.moved[0]?.changes).not.toHaveProperty("cluster");
		expect(wrong.nodes.moved[0]?.changes.prominence?.to).toBe("larger");
	});

	test("all fixtures keep bound labels on their containers", () => {
		const fixtures: Record<string, ServerElement[]> = {
			scene: scene(),
			"unpromoted box": [
				...scene(),
				completeElement({ id: "z", type: "rectangle", x: 620, y: 300, width: 200, height: 100 }),
				label("zl", "z", "Redis", 620, 300),
			],
			"first bound label": [box("a", 0, 0, "gateway"), label("al", "a", "Gateway", 0, 0)],
		};
		for (const elements of Object.values(fixtures))
			expect(boundTextDrift(elements)).toHaveLength(0);
	});

	test("frame changes do not move untouched nodes", () => {
		const spread = [
			box("a", 0, 0, "alpha"),
			box("b", 700, 0, "bravo"),
			box("c", 1400, 0, "charlie"),
			box("d", 0, 600, "delta"),
			box("e", 1400, 600, "echo"),
		];

		const added = diff(spread, [...spread, box("z", 2600, 0, "zulu")]);
		expect(regionMoves(added)).toHaveLength(0);
		expect(added.detail.nodes.added[0]?.layout.region).toBe("top-right");
		expect(added.detail.to.regionFrame?.maxX).toBe(1600);
		expect(added.detail.to.nodeBox?.maxX).toBe(2800);

		const removed = diff(
			spread,
			spread.filter((element) => element.id !== "c"),
		);
		expect(regionMoves(removed)).toHaveLength(0);
	});

	test("a dragged node reports its destination without moving bystanders", () => {
		const spread = [
			box("a", 0, 0, "alpha"),
			box("b", 700, 0, "bravo"),
			box("c", 1400, 0, "charlie"),
			box("d", 0, 600, "delta"),
			box("e", 1400, 600, "echo"),
		];
		const dragged = spread.map((element) =>
			element.id === "b" ? { ...element, x: 1400, y: 300 } : element,
		);
		const change = diff(spread, dragged);
		expect(regionMoves(change).map((move) => move.node)).toEqual(["bravo"]);
		expect(change.nodes.moved[0]?.changes.region?.to).toBe("middle-right");
		expect(regionMoves(change).every((move) => move.node === "bravo")).toBeTrue();
	});

	test("whole-board panning is silent while wholesale rearrangement is layout", () => {
		const spread = [
			box("a", 0, 0, "alpha"),
			box("b", 700, 0, "bravo"),
			box("c", 1400, 0, "charlie"),
			box("d", 0, 600, "delta"),
			box("e", 1400, 600, "echo"),
		];
		expect(
			diff(
				spread,
				spread.map((element) => ({ ...element, x: element.x + 5000, y: element.y + 5000 })),
			).significance,
		).toBe("none");

		const rearranged = diff(
			spread,
			spread.map((element, index) => {
				const moved = structuredClone(element);
				moved.x = 0;
				moved.y = index * 700;
				return moved;
			}),
		);
		expect(rearranged.significance).toBe("layout");
		expect(regionMoves(rearranged).length).toBeGreaterThanOrEqual(3);
	});
});
