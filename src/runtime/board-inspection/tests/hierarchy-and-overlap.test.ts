import { describe, expect, test } from "bun:test";
import { inspectBoard } from "../index.js";
import { connector, semanticNode } from "./fixtures/elements.js";

const orderedFontIds = (input: Record<string, unknown>[]) =>
	inspectBoard(input)
		.findings.filter((f) => f.reason === "disallowed-font-family")
		.map((f) => f.elements[0]?.id);

describe("hierarchy and overlap", () => {
	test("excludes leaves and ancestors but reports unrelated overlap", () => {
		const report = inspectBoard([
			semanticNode("outer", { x: 0, y: 0, width: 200, height: 200 }),
			semanticNode("inner", { x: 20, y: 20, width: 80, height: 80 }),
			semanticNode("leaf", { x: 30, y: 30, width: 20, height: 20 }),
			semanticNode("unrelated", { x: 35, y: 35, width: 20, height: 20 }),
		]);
		expect(report.findings.some((finding) => finding.code === "NODE_OVERLAP")).toBe(true);
		expect(
			report.findings.some(
				(finding) =>
					finding.code === "NODE_OVERLAP" &&
					finding.details.firstNodeId === "outer" &&
					finding.details.secondNodeId === "inner",
			),
		).toBe(false);
	});

	test("uses stable parent tie breaking and exact UTF-16 identity order", () => {
		const ids = ["order-\ud800", "order-a", "order-\u0001", "order-\0"];
		const elements = ids.map((id, index) => ({
			id,
			type: "text",
			x: index * 100,
			y: 0,
			width: 20,
			height: 10,
			fontFamily: 1,
			text: id,
		}));
		expect(orderedFontIds(elements)).toEqual([
			"order-\0",
			"order-\u0001",
			"order-a",
			"order-\ud800",
		]);
		expect(orderedFontIds(elements.toReversed())).toEqual(orderedFontIds(elements));
		const parents = inspectBoard([
			semanticNode("stable-zone-a", {
				id: "a-boundary",
				width: 100,
				height: 100,
			}),
			semanticNode("stable-zone-b", {
				id: "b-boundary",
				width: 100,
				height: 100,
			}),
			semanticNode("stable-child", { id: "stable-child-body", x: 10, y: 10 }),
		]);
		const overlapsChild = (nodeId: string) =>
			parents.findings.some(
				(finding) =>
					finding.code === "NODE_OVERLAP" &&
					[finding.details.firstNodeId, finding.details.secondNodeId].includes(nodeId) &&
					[finding.details.firstNodeId, finding.details.secondNodeId].includes("stable-child"),
			);
		expect(overlapsChild("stable-zone-a")).toBe(false);
		expect(overlapsChild("stable-zone-b")).toBe(true);
	});

	test("gates aggregate overflow and preserves unrelated label overlap", () => {
		const report = inspectBoard([
			semanticNode("aggregate", {
				id: "negative",
				x: -Number.MAX_VALUE,
				width: 0,
			}),
			semanticNode("aggregate", {
				id: "positive",
				x: Number.MAX_VALUE,
				width: 0,
			}),
			semanticNode("zone", { x: 0, y: 0, width: 100, height: 100 }),
			{
				id: "owner-a",
				type: "rectangle",
				x: 0,
				y: 100,
				width: 20,
				height: 20,
				boundElements: [{ id: "label-a", type: "text" }],
			},
			{
				id: "label-a",
				type: "text",
				containerId: "owner-a",
				x: 20,
				y: 20,
				width: 20,
				height: 10,
				fontFamily: 5,
				text: "a",
			},
			{
				id: "owner-b",
				type: "rectangle",
				x: 100,
				y: 100,
				width: 20,
				height: 20,
				boundElements: [{ id: "label-b", type: "text" }],
			},
			{
				id: "label-b",
				type: "text",
				containerId: "owner-b",
				x: 20,
				y: 20,
				width: 20,
				height: 10,
				fontFamily: 5,
				text: "b",
			},
		]);
		expect(report.findings.some((f) => f.reason === "unrepresentable-coordinate-span")).toBe(true);
		expect(
			report.findings.some((f) => f.code === "LABEL_OVERLAP" && f.reason === "label-label-overlap"),
		).toBe(true);
	});

	test("does not let endpoint ancestry become a penetration", () => {
		const report = inspectBoard([
			semanticNode("outer", { width: 100, height: 100 }),
			semanticNode("endpoint", {
				x: 20,
				y: 20,
				boundElements: [{ id: "edge", type: "arrow" }],
			}),
			connector({
				id: "edge",
				x: -10,
				y: 25,
				width: 120,
				points: [
					[0, 0],
					[120, 0],
				],
				startBinding: { elementId: "endpoint", focus: 0, gap: 0 },
			}),
		]);
		expect(report.findings.some((f) => f.code === "CONNECTOR_PENETRATES_NODE")).toBe(false);
	});
});
