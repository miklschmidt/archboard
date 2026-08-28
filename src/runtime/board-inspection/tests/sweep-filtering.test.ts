import { describe, expect, test } from "bun:test";
import { diagnoseSweepCompatibility, inspectBoardDiagnostics } from "../diagnostics.js";
import { connector, semanticNode } from "./fixtures/elements.js";
import { interval } from "./fixtures/sweep-cases.js";

describe("sweep filtering", () => {
	test("zero-segment filtering keeps only supported segments", () => {
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

		const pairDiagnostics = inspectBoardDiagnostics(
			[
				connector({
					id: "zero-and-supported",
					width: 2,
					points: [
						[0, 0],
						[0, 0],
						[2, 0],
					],
				}),
				connector({
					id: "zero-control",
					x: 1,
					y: -1,
					width: 0,
					height: 2,
					points: [
						[0, 0],
						[0, 2],
					],
				}),
			],
			{ intersectionTolerance: 0 },
		);
		expect(
			pairDiagnostics.report.findings
				.filter((finding) => finding.code === "CONNECTOR_INTERSECTION_UNMARKED")
				.map((finding) => finding.details),
		).toEqual([
			{
				firstConnectorId: "zero-control",
				firstSegmentIndex: 0,
				secondConnectorId: "zero-and-supported",
				secondSegmentIndex: 1,
				point: { x: 1, y: 0 },
			},
		]);
		expect(pairDiagnostics.report.broadPhaseComparisons).toBe(1);
		expect(pairDiagnostics.work.broadPhaseCompatibleVisits).toBe(1);
	});

	test("same-connector filtering preserves only cross-connector pairs", () => {
		const exact = diagnoseSweepCompatibility({
			left: [
				interval("segment-a", 0, 10, "edge", { excludedPartitions: ["edge"] }),
				interval("segment-b", 1, 9, "edge", { excludedPartitions: ["edge"] }),
				interval("other", 2, 8, "other", { excludedPartitions: ["other"] }),
			],
			right: [],
			sameSet: true,
		});
		expect(exact.pairs).toEqual([
			["other", "segment-a"],
			["other", "segment-b"],
		]);
		expect(exact.work).toMatchObject({
			activeVisits: 2,
			bucketScans: 2,
			exactQuerySteps: 6,
			peakActiveBuckets: 3,
			peakActiveProfiles: 3,
		});

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

	test("endpoint-only filtering visits only the unrelated node", () => {
		const exact = diagnoseSweepCompatibility({
			left: [
				interval("edge", 0, 10, "edge", {
					excludedPartitions: ["start", "end"],
				}),
			],
			right: [
				interval("start-node", 0, 2, "start"),
				interval("middle-node", 3, 7, "middle"),
				interval("end-node", 8, 10, "end"),
			],
			sameSet: false,
		});
		expect(exact.pairs).toEqual([["edge", "middle-node"]]);
		expect(exact.work).toMatchObject({
			activeVisits: 1,
			bucketScans: 1,
			exactQuerySteps: 6,
		});

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

	test("same-owner label filtering visits only the unrelated node", () => {
		const exact = diagnoseSweepCompatibility({
			left: [interval("label", 0, 10, "label", { excludedPartitions: ["owner"] })],
			right: [
				interval("owner-node", 0, 10, "owner"),
				interval("unrelated-node", 0, 10, "unrelated"),
			],
			sameSet: false,
		});
		expect(exact.pairs).toEqual([["label", "unrelated-node"]]);
		expect(exact.work).toMatchObject({ activeVisits: 1, bucketScans: 1 });

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

	test("ancestor filtering visits only nodes outside the owner chain", () => {
		const exact = diagnoseSweepCompatibility({
			left: [interval("label", 0, 10, "label", { ancestorTargets: ["owner"] })],
			right: [
				interval("ancestor-node", 0, 10, "ancestor"),
				interval("owner-node", 0, 10, "owner"),
				interval("unrelated-node", 0, 10, "unrelated"),
			],
			sameSet: false,
			hierarchyParents: new Map([
				["ancestor", null],
				["owner", "ancestor"],
				["unrelated", null],
			]),
		});
		expect(exact.pairs).toEqual([["label", "unrelated-node"]]);
		expect(exact.work).toMatchObject({
			activeVisits: 1,
			bucketScans: 1,
			hierarchyNodeVisits: 3,
		});
	});

	test("partial-complement filtering preserves the exact unrelated pairs in either direction", () => {
		for (const reverse of [false, true]) {
			const count = 32;
			const parents = new Map<string, string | null>();
			for (let index = 0; index < count; index += 1)
				parents.set(`chain-${index}`, index === 0 ? null : `chain-${index - 1}`);
			parents.set("unrelated", null);
			const exact = diagnoseSweepCompatibility({
				left: Array.from({ length: count }, (_, index) =>
					interval(`label-${index}`, reverse ? 0 : 1, 3, `label-${index}`, {
						ancestorTargets: [`chain-${count - 1}`],
					}),
				),
				right: [
					...Array.from({ length: count }, (_, index) =>
						interval(`node-${index}`, reverse ? 1 : 0, 3, `chain-${index}`),
					),
					interval("node-unrelated", reverse ? 1 : 0, 3, "unrelated"),
				],
				sameSet: false,
				hierarchyParents: parents,
			});
			expect(exact.pairs).toEqual(
				[
					"label-0",
					"label-1",
					"label-10",
					"label-11",
					"label-12",
					"label-13",
					"label-14",
					"label-15",
					"label-16",
					"label-17",
					"label-18",
					"label-19",
					"label-2",
					"label-20",
					"label-21",
					"label-22",
					"label-23",
					"label-24",
					"label-25",
					"label-26",
					"label-27",
					"label-28",
					"label-29",
					"label-3",
					"label-30",
					"label-31",
					"label-4",
					"label-5",
					"label-6",
					"label-7",
					"label-8",
					"label-9",
				].map((label) => [label, "node-unrelated"]),
			);
			expect(exact.work).toMatchObject({
				activeVisits: count,
				bucketScans: count,
				exactQuerySteps: count * (count + 1) * 2,
				hierarchyNodeVisits: count * (count + 1),
				peakActiveBuckets: count * 2 + 1,
				peakActiveProfiles: count * 2 + 1,
			});
		}
	});

	test("closed-boundary filtering includes both touching endpoints in stable order", () => {
		const exact = diagnoseSweepCompatibility({
			left: [interval("left", 0, 10)],
			right: [
				interval("at-start", -5, 0),
				interval("inside", 2, 8),
				interval("at-end", 10, 15),
				interval("outside", 10.001, 20),
			],
			sameSet: false,
		});
		expect(exact.pairs).toEqual([
			["left", "at-start"],
			["left", "inside"],
			["left", "at-end"],
		]);
		expect(exact.work).toMatchObject({
			activeVisits: 3,
			bucketScans: 3,
			expiryPops: 3,
			peakActiveBuckets: 2,
		});
	});

	test("best-parent prefilters exclude self and nonoverlap before exact containment", () => {
		const exact = diagnoseSweepCompatibility({
			left: [
				interval("child-a", 0, 10, "child-a", {
					excludedPartitions: ["child-a"],
				}),
				interval("child-b", 20, 30, "child-b", {
					excludedPartitions: ["child-b"],
				}),
			],
			right: [
				interval("own-a", 0, 10, "child-a", {
					excludedPartitions: ["child-a"],
				}),
				interval("parent", -5, 35, "parent", {
					excludedPartitions: ["parent"],
				}),
				interval("far", 40, 50, "far", { excludedPartitions: ["far"] }),
			],
			sameSet: false,
		});
		expect(exact.pairs).toEqual([
			["child-a", "parent"],
			["child-b", "parent"],
		]);
		expect(exact.work).toMatchObject({
			activeVisits: 2,
			bucketScans: 2,
			exactQuerySteps: 6,
			peakActiveBuckets: 3,
		});

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

	test("same-set filtering visits every eligible unordered pair once", () => {
		const exact = diagnoseSweepCompatibility({
			left: [
				interval("a", 0, 10),
				interval("b", 1, 9),
				interval("c", 10, 20),
				interval("d", 21, 30),
			],
			right: [],
			sameSet: true,
		});
		expect(exact.pairs).toEqual([
			["b", "a"],
			["c", "a"],
		]);
		expect(exact.work).toMatchObject({
			activeVisits: 2,
			bucketScans: 2,
			exactQuerySteps: 4,
			expiryPops: 3,
			peakActiveBuckets: 2,
		});

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

	test("coarse sparse prefilters retain constant active peaks", () => {
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
