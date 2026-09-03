import { describe, expect, test } from "bun:test";
import { diagnoseSweepCompatibility, inspectBoardDiagnostics } from "../diagnostics.js";
import { connector } from "./fixtures/elements.js";
import { interval } from "./fixtures/sweep-cases.js";

describe("sweep filtering", () => {
	test("zero-segment filtering keeps only supported segments", () => {
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
	});
});
