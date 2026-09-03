import { describe, expect, test } from "bun:test";
import { inspectBoardDiagnostics } from "../diagnostics.js";
import { semanticNode } from "./fixtures/elements.js";

function partialComplementLabelBoard(count: number) {
	const labels = Array.from({ length: count }, (_, index) => ({
		id: `partial-label-${count}-${index}`,
		type: "text",
		x: count + 1,
		y: count + 1 + index * 2,
		width: 1,
		height: 1,
		angle: 0,
		fontFamily: 5,
		text: `${index}`,
		containerId: `partial-owner-${count - 1}`,
	}));
	return [
		...Array.from({ length: count }, (_, index) =>
			semanticNode(`partial-owner-${index}`, {
				x: index,
				y: index,
				width: (count - index) * 4,
				height: (count - index) * 4,
				...(index === count - 1
					? { boundElements: labels.map((label) => ({ id: label.id, type: "text" })) }
					: {}),
			}),
		),
		semanticNode(`partial-unrelated-${count}`, {
			x: count,
			y: count * 10,
			width: count * 2,
			height: 1,
		}),
		...labels,
	];
}

describe("sweep partial complements", () => {
	test("public partial complements retain exact findings and work tuples", () => {
		for (const [count, comparisons, bucketScans] of [
			[32, 33, 33],
			[64, 65, 65],
			[128, 129, 129],
			[256, 257, 257],
		] as const) {
			const report = inspectBoardDiagnostics(partialComplementLabelBoard(count));
			const ownerId = `partial-owner-${count - 1}`;
			const labelIds = Array.from(
				{ length: count },
				(_, index) => `partial-label-${count}-${index}`,
			).toSorted();
			const driftIds = Array.from(
				{ length: count - 6 },
				(_, index) => `partial-label-${count}-${index + 6}`,
			).toSorted();
			expect([
				count,
				report.report.broadPhaseComparisons,
				report.work.broadPhaseBucketScans,
			]).toEqual([count, comparisons, bucketScans]);
			expect(
				report.report.findings.map(
					({ code, reason, elements }) =>
						`${code}/${reason}/${elements.map(({ id }) => id).join(",")}`,
				),
			).toEqual([
				`LABEL_CORRUPTION/duplicate/${[...labelIds, ownerId].join(",")}`,
				...driftIds.map((id) => `LABEL_CORRUPTION/drift/${id},${ownerId}`),
			]);
			const duplicate = report.report.findings[0];
			expect(duplicate?.details).toEqual({
				containerId: ownerId,
				keeperId: `partial-label-${count}-0`,
				duplicateIds: labelIds.slice(1),
			});
		}
	});
});
