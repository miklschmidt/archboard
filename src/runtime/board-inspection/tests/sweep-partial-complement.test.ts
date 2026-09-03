import { describe, expect, test } from "bun:test";
import { inspectBoardDiagnostics } from "../diagnostics.js";
import { partialComplementLabelBoard } from "./fixtures/partial-complement-cases.js";

describe("sweep partial complements", () => {
	test("public partial complements retain exact findings and details", () => {
		const count = 32;
		const report = inspectBoardDiagnostics(partialComplementLabelBoard(count)).report;
		const ownerId = `partial-owner-${count - 1}`;
		const labelIds = Array.from(
			{ length: count },
			(_, index) => `partial-label-${count}-${index}`,
		).toSorted();
		const driftIds = Array.from(
			{ length: count - 6 },
			(_, index) => `partial-label-${count}-${index + 6}`,
		).toSorted();
		expect(
			report.findings.map(
				({ code, reason, elements }) =>
					`${code}/${reason}/${elements.map(({ id }) => id).join(",")}`,
			),
		).toEqual([
			`LABEL_CORRUPTION/duplicate/${[...labelIds, ownerId].join(",")}`,
			...driftIds.map((id) => `LABEL_CORRUPTION/drift/${id},${ownerId}`),
		]);
		expect(report.findings[0]?.details).toEqual({
			containerId: ownerId,
			keeperId: `partial-label-${count}-0`,
			duplicateIds: labelIds.slice(1),
		});
	});
});
