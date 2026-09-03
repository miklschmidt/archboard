import { describe, expect, test } from "bun:test";

import { diagnoseSweepCompatibility, inspectBoardDiagnostics } from "../diagnostics.js";
import { semanticNode } from "./fixtures/elements.js";
import { partialComplementLabelBoard } from "./fixtures/partial-complement-cases.js";
import { interval } from "./fixtures/sweep-cases.js";

function nestedOwnerLabelBoard(height: number, labelCount: number) {
	const labels = Array.from({ length: labelCount }, (_, index) => ({
		id: `deep-label-${height}-${index}`,
		type: "text",
		x: height * 2 + 1,
		y: height * 2 + 1,
		width: 2,
		height: 1,
		angle: 0,
		fontFamily: 5,
		text: `${index}`,
		containerId: `deep-owner-${height - 1}`,
	}));
	return [
		...Array.from({ length: height }, (_, index) =>
			semanticNode(`deep-owner-${index}`, {
				x: index * 2,
				y: index * 2,
				width: (height - index) * 10,
				height: (height - index) * 10,
				...(index === height - 1
					? { boundElements: labels.map((label) => ({ id: label.id, type: "text" })) }
					: {}),
			}),
		),
		...labels,
	];
}

function partialComplementSweep(count: number, reverse: boolean) {
	const parents = new Map<string, string | null>();
	for (let index = 0; index < count; index += 1)
		parents.set(`chain-${index}`, index === 0 ? null : `chain-${index - 1}`);
	parents.set("unrelated", null);
	return diagnoseSweepCompatibility({
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
}

function distinctConflictingLabelBoard(height: number, labelCount: number) {
	const labels = Array.from({ length: labelCount }, (_, index) => ({
		id: `profile-label-${height}-${index}`,
		type: "text",
		x: height * 2 + 1,
		y: height * 2 + 1,
		width: 2,
		height: 1,
		angle: 0,
		fontFamily: 5,
		text: `${index}`,
		containerId: `a-common-owner-${height - 1}`,
	}));
	return [
		...Array.from({ length: height }, (_, index) =>
			semanticNode(`a-common-node-${index}`, {
				id: `a-common-owner-${index}`,
				x: index * 2,
				y: index * 2,
				width: (height - index) * 10,
				height: (height - index) * 10,
				...(index === height - 1
					? { boundElements: labels.map((label) => ({ id: label.id, type: "text" })) }
					: {}),
			}),
		),
		...labels.map((label, index) =>
			semanticNode(`z-reverse-node-${index}`, {
				id: `z-reverse-owner-${index}`,
				x: 1_000_000 + index * 4,
				width: 1,
				height: 1,
				boundElements: [{ id: label.id, type: "text" }],
			}),
		),
		...labels,
	];
}

describe("sweep partial-complement capacity", () => {
	test("public partial complements retain linear comparison and bucket work", () => {
		for (const [count, comparisons, bucketScans] of [
			[32, 33, 33],
			[64, 65, 65],
			[128, 129, 129],
			[256, 257, 257],
		] as const) {
			const report = inspectBoardDiagnostics(partialComplementLabelBoard(count));
			expect([
				count,
				report.report.broadPhaseComparisons,
				report.work.broadPhaseBucketScans,
			]).toEqual([count, comparisons, bucketScans]);
		}
	});

	test("own-plus-ancestor matrices retain zero public label work", () => {
		const actual = (
			[
				[8, 128],
				[16, 256],
				[32, 512],
			] as const
		).map(([height, labelCount]) => {
			const diagnostics = inspectBoardDiagnostics(nestedOwnerLabelBoard(height, labelCount));
			return [
				height,
				labelCount,
				diagnostics.report.broadPhaseComparisons,
				diagnostics.work.broadPhaseCompatibleVisits,
				diagnostics.work.broadPhaseBucketScans,
				diagnostics.report.findings.some((finding) => finding.code === "LABEL_OVERLAP"),
			];
		});
		expect(actual).toEqual([
			[8, 128, 0, 0, 0, false],
			[16, 256, 0, 0, 0, false],
			[32, 512, 0, 0, 0, false],
		]);
	});

	test("both sweep directions retain exact partial-complement work formulas", () => {
		for (const count of [1_000, 2_000] as const) {
			const expectedPairs: [string, string][] = Array.from(
				{ length: count },
				(_, index) => `label-${index}`,
			)
				.toSorted()
				.map((id) => [id, "node-unrelated"]);
			for (const reverse of [false, true]) {
				const diagnostics = partialComplementSweep(count, reverse);
				expect(diagnostics.pairs).toEqual(expectedPairs);
				expect({
					pairs: diagnostics.pairs.length,
					activeVisits: diagnostics.work.activeVisits,
					bucketScans: diagnostics.work.bucketScans,
					hierarchyNodeVisits: diagnostics.work.hierarchyNodeVisits,
					peakActiveBuckets: diagnostics.work.peakActiveBuckets,
					peakActiveProfiles: diagnostics.work.peakActiveProfiles,
				}).toEqual({
					pairs: count,
					activeVisits: count,
					bucketScans: count,
					hierarchyNodeVisits: count * (count + 1),
					peakActiveBuckets: count * 2 + 1,
					peakActiveProfiles: count * 2 + 1,
				});
			}
		}
	});

	test("distinct conflicting matrices retain zero work and bounded profiles", () => {
		for (const [height, labelCount] of [
			[8, 128],
			[16, 256],
		] as const) {
			const diagnostics = inspectBoardDiagnostics(
				distinctConflictingLabelBoard(height, labelCount),
			);
			expect({
				comparisons: diagnostics.report.broadPhaseComparisons,
				compatibleVisits: diagnostics.work.broadPhaseCompatibleVisits,
				bucketScans: diagnostics.work.broadPhaseBucketScans,
				labelOverlap: diagnostics.report.findings.some(
					(finding) => finding.code === "LABEL_OVERLAP",
				),
			}).toEqual({ comparisons: 0, compatibleVisits: 0, bucketScans: 0, labelOverlap: false });
			expect(diagnostics.work.broadPhasePeakActiveBuckets).toBeLessThanOrEqual(labelCount + height);
			expect(diagnostics.work.broadPhasePeakActiveProfiles).toBeLessThanOrEqual(
				labelCount * 2 + height,
			);
		}
	});
});
