import { describe, expect, test } from "bun:test";
import { inspectBoardDiagnostics } from "../diagnostics.js";
import {
	boundLabel,
	connector,
	labelContainer,
	libraryBody,
	semanticNode,
} from "./fixtures/elements.js";

const driftIdentities = (input: Record<string, unknown>[]) =>
	inspectBoardDiagnostics(input)
		.report.findings.filter((f) => f.reason === "drift")
		.map((f) => `${f.details.containerId}\0${f.details.textId}`)
		.toSorted();

const groupMeteringBody = (groupIds: unknown[]) => ({
	id: "group-metering",
	type: "rectangle",
	x: 0,
	y: 60_000,
	width: 10,
	height: 10,
	angle: 0,
	groupIds,
	customData: { library: { itemId: "group-metering", source: "catalogue" } },
});

describe("large inspection indexes", () => {
	test("preserves all duplicate refs in stable source order", () => {
		const report = inspectBoardDiagnostics(
			Array.from({ length: 32 }, (_, sourceIndex) => ({
				id: "duplicate-ref-order",
				type: "rectangle",
				x: sourceIndex * 20,
				y: 0,
				width: 10,
				height: 10,
				angle: 0,
			})),
		).report;
		const duplicate = report.findings.find((finding) => finding.reason === "duplicate-element-id");
		expect(duplicate?.elements.map((element) => element.sourceIndex)).toEqual(
			Array.from({ length: 32 }, (_, sourceIndex) => sourceIndex),
		);
	});

	test("meters every rejected group entry", () => {
		const emptyWork = inspectBoardDiagnostics([groupMeteringBody([])]).work.inputUnits;
		for (const count of [1, 7]) {
			const diagnosed = inspectBoardDiagnostics([groupMeteringBody(Array(count).fill(null))]);
			expect(diagnosed.work.inputUnits - emptyWork).toBe(count);
			expect(diagnosed.report).toMatchObject({ clean: true, coverage: "complete" });
		}
	});

	test("keeps label pair identity injective and reverse ownership deterministic", () => {
		const pairs = [
			["a b", "c"],
			["a", "b c"],
			["a\0", "b\u001f"],
			["a\u001f", "b\0"],
		] as const;
		const records = pairs.flatMap(([containerId, textId], index) => [
			labelContainer({
				id: containerId,
				x: index * 100,
				boundElements: [{ id: textId, type: "text" }],
			}),
			boundLabel({ id: textId, containerId, x: 500 + index * 100 }),
		]);
		expect(driftIdentities(records)).toEqual(driftIdentities(records.toReversed()));
		expect(new Set(driftIdentities(records)).size).toBe(pairs.length);
	});

	test("preserves hierarchy inventory, aggregate failure, and obstacle attribution", () => {
		const hierarchy = Array.from({ length: 64 }, (_, index) =>
			semanticNode(`node-${index}`, {
				x: index,
				y: index,
				width: (64 - index) * 20,
				height: (64 - index) * 20,
			}),
		);
		expect(
			inspectBoardDiagnostics(hierarchy).report.findings.some((f) => f.code === "NODE_OVERLAP"),
		).toBe(false);
		const aggregate = inspectBoardDiagnostics([
			semanticNode("overflow", { id: "positive", x: Number.MAX_VALUE, width: 0 }),
			semanticNode("overflow", { id: "negative", x: -Number.MAX_VALUE, width: 0 }),
			...Array.from({ length: 64 }, (_, index) =>
				semanticNode("overflow", { id: `local-${index}`, x: index }),
			),
		]).report;
		expect(aggregate.findings.some((f) => f.reason === "unrepresentable-coordinate-span")).toBe(
			true,
		);
		const obstacles = Array.from({ length: 64 }, (_, index) => ({
			...libraryBody(`body-${index}`, index * 20, ["shared"]),
			customData: undefined,
		}));
		expect(
			inspectBoardDiagnostics(obstacles).report.findings.some(
				(f) => f.reason === "invalid-library-attribution",
			),
		).toBe(false);
	});

	test("retains multi-point finding evidence", () => {
		const report = inspectBoardDiagnostics([
			connector({
				id: "curve",
				curveKind: "bezier",
				points: Array.from({ length: 5 }, (_, index) => [index, 0]),
			}),
		]).report;
		expect(report.findings.some((finding) => finding.points.length >= 5)).toBe(true);
	});
});
