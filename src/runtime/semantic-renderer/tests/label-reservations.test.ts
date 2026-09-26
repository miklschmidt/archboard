// A reserved label that the settled drawing places elsewhere gives its row
// back, but only when that makes the page smaller at no cost to its routes.
// The engine's page size for a real board is its own to change, so the rule
// is held against a solve whose answers are fixed here.

import { describe, expect, test } from "bun:test";
import {
	settleLabels,
	curveThrough,
	type ArchitectureDrawing,
	type DrawingEdge,
	type LabelAttempt,
	type Point,
} from "@/runtime/semantic-renderer/layout";

/**
 * One straight route between two points.
 * @param id The relationship.
 * @param from Where it starts.
 * @param to Where it ends.
 * @returns The routed edge.
 */
function route(id: string, from: Point, to: Point): DrawingEdge {
	return {
		edge: { id, order: 1000, from: `${id}-from`, to: `${id}-to`, kind: "call", emphasis: "normal" },
		curve: { from, segments: [{ kind: "line", to }] },
		path: "",
	};
}

/** Two routes that cross once. */
const CROSSING = [
	route("across", { x: 0, y: 50 }, { x: 100, y: 50 }),
	route("down", { x: 50, y: 0 }, { x: 50, y: 100 }),
];

/**
 * A drawing of a given size.
 * @param width Its width.
 * @param height Its height.
 * @param edges Its routes.
 * @returns The drawing.
 */
function page(
	width: number,
	height: number,
	edges: readonly DrawingEdge[] = [],
): ArchitectureDrawing {
	return {
		direction: "down",
		width,
		height,
		cards: [],
		containers: [],
		edges,
	};
}

/**
 * A solve that answers from a table keyed by the reservations it is given,
 * and a placement that answers the size of the same page.
 * @param answers The drawing and unused reservations for each set of reservations.
 * @returns The solve, its placement, and the reservation sets routed.
 */
function solveFrom(answers: Record<string, { drawing: ArchitectureDrawing; unused?: string[] }>) {
	const asked: string[] = [];
	const answer = (reserved: ReadonlySet<string>) => {
		const key = [...reserved].toSorted().join(",");
		const found = answers[key];
		if (found === undefined) throw new Error(`unexpected reservations: ${key}`);
		return { key, found };
	};
	const solve = async (reserved: ReadonlySet<string>): Promise<LabelAttempt> => {
		const { key, found } = answer(reserved);
		asked.push(key);
		return { drawing: found.drawing, missing: [], unused: found.unused ?? [] };
	};
	const place = async (reserved: ReadonlySet<string>) => answer(reserved).found.drawing;
	return { solve, place, asked };
}

describe("an unused label reservation", () => {
	test("is released when the page gets smaller", async () => {
		const smaller = page(400, 300);
		const { solve, place } = solveFrom({
			"a,b": { drawing: page(400, 500), unused: ["a"] },
			b: { drawing: smaller },
		});
		expect((await settleLabels({ place, solve }, new Set(["a", "b"]))).drawing).toBe(smaller);
	});

	test("is kept when a smaller release cannot fit the fixed bends", async () => {
		const kept = page(400, 500);
		const tight = {
			...route("tight", { x: 0, y: 0 }, { x: 200, y: 8 }),
			curve: curveThrough([
				{ x: 0, y: 0 },
				{ x: 100, y: 0 },
				{ x: 100, y: 8 },
				{ x: 200, y: 8 },
			]),
		};
		const { solve, place } = solveFrom({
			a: { drawing: kept, unused: ["a"] },
			"": { drawing: page(300, 400, [tight]) },
		});
		expect((await settleLabels({ place, solve }, new Set(["a"]))).drawing).toBe(kept);
	});

	test("is kept, and never routed, when its placement only spreads the page sideways", async () => {
		const kept = page(400, 500);
		const { solve, place, asked } = solveFrom({
			a: { drawing: kept, unused: ["a"] },
			"": { drawing: page(600, 480) },
		});
		expect((await settleLabels({ place, solve }, new Set(["a"]))).drawing).toBe(kept);
		expect(asked).toEqual(["a"]);
	});

	test("is kept when releasing it makes two routes cross", async () => {
		const kept = page(400, 500);
		const { solve, place } = solveFrom({
			a: { drawing: kept, unused: ["a"] },
			"": { drawing: page(300, 400, CROSSING) },
		});
		expect((await settleLabels({ place, solve }, new Set(["a"]))).drawing).toBe(kept);
	});

	test("is released alone when releasing every unused one together loses a label's box", async () => {
		const smaller = page(400, 400);
		const { solve, place } = solveFrom({
			"a,b": { drawing: page(400, 500), unused: ["a", "b"] },
			"": { drawing: page(400, 300) },
			b: { drawing: smaller },
			// Releasing b alone would also hold, and on a smaller page still, but
			// releases are tried in order and the first that holds is the one kept.
			a: { drawing: page(400, 350) },
		});
		const missingLabel = async (reserved: ReadonlySet<string>): Promise<LabelAttempt> => {
			const attempt = await solve(reserved);
			return reserved.size === 0 ? { ...attempt, missing: [CROSSING[0]!] } : attempt;
		};
		expect((await settleLabels({ place, solve: missingLabel }, new Set(["a", "b"]))).drawing).toBe(
			smaller,
		);
	});

	test("is released round after round, for at most three rounds", async () => {
		const third = page(400, 350);
		const { solve, place, asked } = solveFrom({
			"a,b,c,d": { drawing: page(400, 500), unused: ["a"] },
			"b,c,d": { drawing: page(400, 450), unused: ["b"] },
			"c,d": { drawing: page(400, 400), unused: ["c"] },
			d: { drawing: third, unused: ["d"] },
			// A fourth round would release d as well, onto a smaller page still.
			"": { drawing: page(400, 300) },
		});
		expect((await settleLabels({ place, solve }, new Set(["a", "b", "c", "d"]))).drawing).toBe(
			third,
		);
		expect(asked).toEqual(["a,b,c,d", "b,c,d", "c,d", "d"]);
	});

	test("settling ends when no reservation is unused", async () => {
		const settled = page(400, 500);
		const { solve, place, asked } = solveFrom({ a: { drawing: settled } });
		expect((await settleLabels({ place, solve }, new Set(["a"]))).drawing).toBe(settled);
		expect(asked).toEqual(["a"]);
	});
});
