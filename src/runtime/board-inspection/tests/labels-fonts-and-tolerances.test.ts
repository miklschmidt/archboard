import { describe, expect, test } from "bun:test";
import { planLabelRepair } from "../../engine/labels.js";
import { inspectBoard } from "../index.js";
import {
	boundLabel,
	connector,
	duplicateLabelBoard,
	labelContainer,
	semanticNode,
} from "./fixtures/elements.js";

const staleAt = (delta: number) =>
	inspectBoard([
		connector({
			width: 10 + delta,
			points: [
				[0, 0],
				[10, 0],
			],
		}),
	]).findings.some((f) => f.code === "STALE_LINEAR_DIMENSIONS");
const crossingAt = (x: number) =>
	inspectBoard([
		connector({
			id: "horizontal",
			width: 10,
			points: [
				[0, 0],
				[10, 0],
			],
		}),
		connector({
			id: "vertical",
			x,
			y: -5,
			width: 0,
			height: 10,
			points: [
				[0, 0],
				[0, 10],
			],
		}),
	]).findings.some((f) => f.code === "CONNECTOR_INTERSECTION_UNMARKED");
const overlapAt = (width: number) =>
	inspectBoard([semanticNode("a"), semanticNode("b", { x: 10 - width })]).findings.some(
		(f) => f.code === "NODE_OVERLAP",
	);

describe("labels, fonts, and tolerances", () => {
	test("applies persisted font policy", () => {
		const text = { id: "font", type: "text", x: 0, y: 0, width: 10, height: 10, text: "x" };
		expect(inspectBoard([text]).findings.some((f) => f.reason === "missing-font-family")).toBe(
			true,
		);
		expect(
			inspectBoard([{ ...text, fontFamily: 1 }]).findings.some(
				(f) => f.reason === "disallowed-font-family",
			),
		).toBe(true);
		expect(
			inspectBoard([{ ...text, fontFamily: 5 }]).findings.some(
				(f) => f.code === "FONT_POLICY_VIOLATION",
			),
		).toBe(false);
		expect(
			inspectBoard([text], { allowedFontFamilies: "any" }).findings.some(
				(f) => f.code === "FONT_POLICY_VIOLATION",
			),
		).toBe(false);
	});

	test("matches production duplicate keeper selection under reversal", () => {
		for (const reverse of [false, true]) {
			const board = duplicateLabelBoard(reverse);
			const duplicate = inspectBoard(board).findings.find((f) => f.reason === "duplicate");
			const repair = planLabelRepair(board as unknown as Parameters<typeof planLabelRepair>[0]);
			expect(repair.duplicates[0]?.keep).toBe("oldlbl");
			expect(duplicate?.details).toMatchObject({ keeperId: "oldlbl", duplicateIds: ["newlbl"] });
		}
	});

	test("distinguishes orphan, duplicate, reciprocal, owner, and drift cases", () => {
		expect(
			inspectBoard([boundLabel({ containerId: "gone" })]).findings.some(
				(f) => f.reason === "orphan",
			),
		).toBe(true);
		expect(
			inspectBoard([labelContainer({ boundElements: [] }), boundLabel()]).findings.some(
				(f) => f.reason === "missing-reciprocal",
			),
		).toBe(true);
		expect(
			inspectBoard([labelContainer({ y: 900 }), boundLabel()]).findings.some(
				(f) => f.reason === "drift",
			),
		).toBe(true);
		expect(
			inspectBoard([labelContainer(), boundLabel()]).findings.some((f) => f.reason === "drift"),
		).toBe(false);
	});

	test("pins the three exact 0.5 tolerance boundaries", () => {
		expect([staleAt(0.5), staleAt(0.499), staleAt(0.501)]).toEqual([true, false, true]);
		expect([crossingAt(9.5), crossingAt(9.501), crossingAt(9.499)]).toEqual([false, false, true]);
		expect([overlapAt(0.5), overlapAt(0.499), overlapAt(0.501)]).toEqual([false, false, true]);
	});
});
