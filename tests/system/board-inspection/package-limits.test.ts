import { describe, expect, test } from "bun:test";
import {
	CheckResultSchema,
	formatInspectionText,
} from "../../../src/runtime/board-inspection/index.js";
import { inputLimitedScene } from "./fixtures/package-limit-cases.js";
import { createPackageInspectionOwner } from "./support/package-inspection.js";

describe("package inspection limits", () => {
	test("persists the input ceiling with strict and non-strict byte equality", async () => {
		const owner = createPackageInspectionOwner();
		try {
			owner.startVault();
			owner.writeBoard("input-limit", inputLimitedScene());
			const normal = await owner.runInspection("input-limit");
			const strict = await owner.runInspection("input-limit", ["--strict"]);
			expect([normal.status, strict.status]).toEqual([0, 8]);
			expect(strict.stdout).toBe(normal.stdout);
			const report = CheckResultSchema.parse(JSON.parse(normal.stdout));
			let foundInputCeiling = false;
			for (const finding of report.findings) {
				if (finding.reason === "input-complexity-ceiling") {
					foundInputCeiling = true;
				}
			}
			expect(foundInputCeiling).toBe(true);
			const textResult = await owner.runInspection("input-limit", ["--text"]);
			expect(textResult.stdout).toBe(
				`${formatInspectionText(report)}\n`,
			);
		} finally {
			await owner.dispose();
		}
	});
});
