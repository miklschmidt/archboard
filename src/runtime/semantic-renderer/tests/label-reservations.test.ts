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
 * A solve that answers from a table keyed by the reservations it is given.
 * @param answers The drawing and unused reservations for each set of reservations.
 * @returns The solve, and the reservation sets it was asked for.
 */
function solveFrom(answers: Record<string, { drawing: ArchitectureDrawing; unused?: string[] }>) {
	const asked: string[] = [];
	const solve = async (reserved: ReadonlySet<string>): Promise<LabelAttempt> => {
		const key = [...reserved].toSorted().join(",");
		asked.push(key);
		const answer = answers[key];
		if (answer === undefined) throw new Error(`unexpected reservations: ${key}`);
		return { drawing: answer.drawing, missing: [], unused: answer.unused ?? [] };
	};
	return { solve, asked };
}

describe("an unused label reservation", () => {
	test("is released when the page gets smaller", async () => {
		const smaller = page(400, 300);
		const { solve } = solveFrom({
			"a,b": { drawing: page(400, 500), unused: ["a"] },
			b: { drawing: smaller },
		});
		expect(await settleLabels(solve, new Set(["a", "b"]))).toBe(smaller);
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
		const { solve } = solveFrom({
			a: { drawing: kept, unused: ["a"] },
			"": { drawing: page(300, 400, [tight]) },
		});
		expect(await settleLabels(solve, new Set(["a"]))).toBe(kept);
	});

	test("is kept when releasing it only spreads the page sideways", async () => {
		const kept = page(400, 500);
		const { solve } = solveFrom({
			a: { drawing: kept, unused: ["a"] },
			"": { drawing: page(600, 480) },
		});
		expect(await settleLabels(solve, new Set(["a"]))).toBe(kept);
	});

	test("is kept when releasing it makes two routes cross", async () => {
		const kept = page(400, 500);
		const { solve } = solveFrom({
			a: { drawing: kept, unused: ["a"] },
			"": { drawing: page(300, 400, CROSSING) },
		});
		expect(await settleLabels(solve, new Set(["a"]))).toBe(kept);
	});

	test("is released alone when releasing every unused one together loses a label's box", async () => {
		const smaller = page(400, 400);
		const { solve } = solveFrom({
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
		expect(await settleLabels(missingLabel, new Set(["a", "b"]))).toBe(smaller);
	});

	test("settling ends when no reservation is unused", async () => {
		const settled = page(400, 500);
		const { solve, asked } = solveFrom({ a: { drawing: settled } });
		expect(await settleLabels(solve, new Set(["a"]))).toBe(settled);
		expect(asked).toEqual(["a"]);
	});
});
