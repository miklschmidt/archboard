import { describe, expect, test } from "bun:test";

import { TEST_BOARD_INSPECTION_SWEEP_CASE_TIMEOUT_MS } from "../../../shared/timing/timing.js";
import { inspectBoardDiagnostics } from "../diagnostics.js";
import { connector, semanticNode } from "./fixtures/elements.js";

describe("sweep filtering capacity", () => {
	test(
		"meters thousands of zero and supported segments",
		() => {
			const points = Array.from({ length: 4_097 }, (_, index) => [Math.floor(index / 2), 0]);
			const diagnostics = inspectBoardDiagnostics([
				connector({ id: "repeated", width: 2_048, points }),
			]);
			const zeroSegments = diagnostics.report.findings
				.filter(
					(finding) => finding.code === "AMBIGUOUS_GEOMETRY" && finding.reason === "zero-length",
				)
				.map((finding) => finding.details.segmentIndex);
			expect(zeroSegments).toEqual(Array.from({ length: 2_048 }, (_, index) => index * 2));
			expect(diagnostics.work.pathSegmentChecks).toBe(4_096);
			expect(diagnostics.report.broadPhaseComparisons).toBe(0);
			expect(diagnostics.work.broadPhaseCompatibleVisits).toBe(0);
		},
		TEST_BOARD_INSPECTION_SWEEP_CASE_TIMEOUT_MS,
	);

	test("keeps same-connector segment work linear", () => {
		for (const segmentCount of [1_000, 2_000, 4_000, 8_000]) {
			const diagnostics = inspectBoardDiagnostics([
				connector({
					id: `one-connector-${segmentCount}`,
					width: 1,
					height: segmentCount,
					points: Array.from({ length: segmentCount + 1 }, (_, index) => [index % 2, index]),
				}),
			]);
			expect(diagnostics.report.broadPhaseComparisons).toBe(0);
			expect(diagnostics.work.broadPhaseCompatibleVisits).toBe(0);
			expect(diagnostics.work.broadPhaseBucketScans).toBe(0);
			expect(diagnostics.work.pathSegmentChecks).toBe(segmentCount);
			expect(
				diagnostics.report.findings.some(
					(finding) => finding.code === "CONNECTOR_INTERSECTION_UNMARKED",
				),
			).toBe(false);
		}
	});

	test("keeps endpoint filtering bounded for a long connector", () => {
		const diagnostics = inspectBoardDiagnostics([
			semanticNode("left", {
				id: "left-body",
				boundElements: [{ id: "bound-edge", type: "arrow" }],
			}),
			semanticNode("right", {
				id: "right-body",
				x: 90,
				boundElements: [{ id: "bound-edge", type: "arrow" }],
			}),
			connector({
				id: "bound-edge",
				y: 5,
				height: 2_000,
				points: Array.from({ length: 2_001 }, (_, index) => [index % 2 ? 100 : 0, index]),
				startBinding: { elementId: "left-body", focus: 0, gap: 0 },
				endBinding: { elementId: "right-body", focus: 0, gap: 0 },
			}),
		]);
		expect(diagnostics.report.broadPhaseComparisons).toBe(0);
		expect(diagnostics.work.broadPhaseCompatibleVisits).toBe(0);
		expect(
			diagnostics.report.findings.some((finding) => finding.code === "CONNECTOR_PENETRATES_NODE"),
		).toBe(false);
	});

	test("keeps same-owner label filtering bounded", () => {
		const labels = Array.from({ length: 256 }, (_, index) => ({
			id: `label-${index}`,
			type: "text",
			x: 10,
			y: 10,
			width: 20,
			height: 10,
			angle: 0,
			fontFamily: 5,
			text: `${index}`,
			containerId: "owner-body",
		}));
		const diagnostics = inspectBoardDiagnostics([
			semanticNode("zone", { width: 100, height: 100 }),
			semanticNode("owner", {
				id: "owner-body",
				x: 5,
				y: 5,
				width: 50,
				height: 50,
				boundElements: labels.map((label) => ({ id: label.id, type: "text" })),
			}),
			...labels,
		]);
		expect(diagnostics.report.broadPhaseComparisons).toBe(0);
		expect(diagnostics.work.broadPhaseCompatibleVisits).toBe(0);
		expect(diagnostics.report.findings.some((finding) => finding.code === "LABEL_OVERLAP")).toBe(
			false,
		);
	});

	test("keeps best-parent candidate work bounded", () => {
		for (const sparseCount of [1_000, 2_000, 4_000]) {
			const sparse = inspectBoardDiagnostics([
				...Array.from({ length: sparseCount }, (_, index) =>
					semanticNode(`sparse-node-${index}`, {
						x: index * 4,
						y: 20_000,
						width: 1,
						height: 1,
					}),
				),
				...Array.from({ length: sparseCount }, (_, index) => ({
					id: `sparse-boundary-${index}`,
					type: "rectangle",
					x: 1_000_000 + index * 4,
					y: 20_000,
					width: 1,
					height: 1,
					angle: 0,
				})),
			]);
			expect(sparse.work.containerBoundaryCandidateVisits).toBe(0);
		}

		const denseCount = 256;
		const dense = inspectBoardDiagnostics(
			Array.from({ length: denseCount }, (_, index) =>
				semanticNode(`dense-${index}`, {
					x: index,
					y: index,
					width: (denseCount - index) * 4,
					height: (denseCount - index) * 4,
				}),
			),
		);
		expect(dense.work.hierarchyCandidateVisits).toBe(denseCount * (denseCount - 1));
	});

	test("keeps dense same-set pair work exact", () => {
		const count = 1_000;
		const diagnostics = inspectBoardDiagnostics(
			Array.from({ length: count }, (_, index) =>
				connector({ id: `dense-${index}`, y: index * 2 }),
			),
		);
		expect(diagnostics.report.broadPhaseComparisons).toBe((count * (count - 1)) / 2);
		expect(diagnostics.work.broadPhaseCompatibleVisits).toBe((count * (count - 1)) / 2);
		expect(diagnostics.work.broadPhasePeakActiveBuckets).toBeLessThanOrEqual(count);
		expect(diagnostics.work.broadPhasePeakIndexNodes).toBeLessThanOrEqual(count);
		expect(diagnostics.report.clean).toBe(true);
	});

	test("keeps coarse sparse prefilter peaks constant", () => {
		for (const count of [1_000, 2_000, 4_000, 8_000]) {
			const diagnostics = inspectBoardDiagnostics([
				...Array.from({ length: count }, (_, index) =>
					semanticNode(`node-${index}`, { x: index * 4, width: 1, height: 1 }),
				),
				...Array.from({ length: count }, (_, index) =>
					connector({
						id: `edge-${index}`,
						x: 1_000_000 + index * 4,
						y: 10,
						width: 1,
						points: [
							[0, 0],
							[1, 0],
						],
					}),
				),
			]);
			expect(diagnostics.work).toMatchObject({
				broadPhaseCompatibleVisits: 0,
				broadPhaseBucketScans: 0,
				broadPhaseExactQuerySteps: 0,
				broadPhaseEvents: count * 6,
				hierarchyCandidateVisits: 0,
				containerBoundaryCandidateVisits: 0,
			});
			expect(diagnostics.work.broadPhasePeakActiveBuckets).toBeLessThanOrEqual(1);
			expect(diagnostics.work.broadPhasePeakIndexNodes).toBeLessThanOrEqual(1);
		}
	});
});
