import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { formatInspectionText, inspectBoard } from "../index.js";
import { boundLabel, connector, semanticNode } from "./fixtures/elements.js";

const text = (id: string, x: number, y: number, width: number, height: number) => ({
	id,
	type: "text",
	x,
	y,
	width,
	height,
	angle: 0,
	fontFamily: 5,
	text: id,
});

const penetrations = (elements: readonly Record<string, unknown>[], overlapTolerance = 0.5) =>
	inspectBoard(elements, { overlapTolerance }).findings.filter(
		(finding) => finding.code === "CONNECTOR_PENETRATES_TEXT",
	);

describe("connector penetration of unrelated text", () => {
	test("reports horizontal and vertical interior spans with stable evidence", () => {
		const report = inspectBoard([
			connector({ id: "horizontal", y: 50 }),
			connector({
				id: "vertical",
				x: 150,
				y: 0,
				width: 0,
				height: 100,
				points: [
					[0, 0],
					[0, 100],
				],
			}),
			text("horizontal-copy", 40, 40, 20, 20),
			text("vertical-copy", 140, 40, 20, 20),
		]);
		const findings = report.findings.filter(
			(finding) => finding.code === "CONNECTOR_PENETRATES_TEXT",
		);
		expect(findings).toHaveLength(2);
		expect(findings.map(({ details }) => details)).toEqual([
			{
				connectorId: "horizontal",
				segmentIndex: 0,
				textId: "horizontal-copy",
				entry: { x: 40.5, y: 50 },
				exit: { x: 59.5, y: 50 },
			},
			{
				connectorId: "vertical",
				segmentIndex: 0,
				textId: "vertical-copy",
				entry: { x: 150, y: 40.5 },
				exit: { x: 150, y: 59.5 },
			},
		]);
		expect(findings[0]).toMatchObject({
			severity: "error",
			affectsCoverage: false,
			elements: [
				{ id: "horizontal", type: "arrow", sourceIndex: 0 },
				{ id: "horizontal-copy", type: "text", sourceIndex: 2 },
			],
			points: [
				{ x: 40.5, y: 50 },
				{ x: 59.5, y: 50 },
			],
			affectedBBox: { x: 40.5, y: 50, width: 19, height: 0 },
			focusBBox: { x: 24.5, y: 34, width: 51, height: 32 },
		});
		expect(report).toMatchObject({
			broadPhaseComparisons: 2,
			coverage: "complete",
			clean: false,
			maxSeverity: "error",
			counts: { byCode: { CONNECTOR_PENETRATES_TEXT: 2 } },
		});
		expect(formatInspectionText({ board: "geometry", ...report })).toContain(
			"CONNECTOR_PENETRATES_TEXT/text-interior",
		);
	});

	test("uses absolute points from negative connector offsets and ignores nearby text", () => {
		const fixture = JSON.parse(
			readFileSync(
				fileURLToPath(new URL("./fixtures/device-trust-text-penetration.json", import.meta.url)),
				"utf8",
			),
		) as Record<string, unknown>[];
		const findings = penetrations(fixture);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.details).toEqual({
			connectorId: "cert-manager-to-gateway",
			segmentIndex: 0,
			textId: "cert-manager-replica-label",
			entry: { x: 64.5, y: 50 },
			exit: { x: 35.5, y: 50 },
		});
	});

	test("requires penetration beyond tolerance and excludes boundary contact", () => {
		const edge = connector({ y: 50 });
		expect(penetrations([edge, text("boundary", 40, 50, 20, 20)])).toHaveLength(0);
		expect(penetrations([edge, text("half-pixel", 40, 49.5, 20, 20)])).toHaveLength(0);
		expect(penetrations([edge, text("inside", 40, 49.49, 20, 20)])).toHaveLength(1);
		expect(penetrations([edge, text("configured", 40, 49, 20, 20)], 1)).toHaveLength(0);
	});

	test("exempts only the connector label and text belonging to bound endpoints", () => {
		const edge = connector({
			id: "bound-edge",
			x: 10,
			y: 50,
			width: 100,
			points: [
				[0, 0],
				[100, 0],
			],
			startBinding: { elementId: "start-body", focus: 0, gap: 0 },
			endBinding: { elementId: "end-text", focus: 0, gap: 0 },
			boundElements: [{ id: "edge-label", type: "text" }],
		});
		const start = semanticNode("start-body", {
			x: 0,
			y: 40,
			width: 20,
			height: 20,
			boundElements: [
				{ id: "start-label", type: "text" },
				{ id: "bound-edge", type: "arrow" },
			],
		});
		const endText = {
			...text("end-text", 100, 40, 20, 20),
			boundElements: [{ id: "bound-edge", type: "arrow" }],
		};
		const elements = [
			edge,
			start,
			boundLabel({
				id: "start-label",
				containerId: "start-body",
				x: 5,
				y: 45,
				width: 10,
				height: 10,
			}),
			boundLabel({
				id: "edge-label",
				containerId: "bound-edge",
				x: 45,
				y: 45,
				width: 30,
				height: 10,
			}),
			endText,
			text("unrelated", 75, 45, 10, 10),
		];
		expect(penetrations(elements).map((finding) => finding.details.textId)).toEqual(["unrelated"]);
	});
});
