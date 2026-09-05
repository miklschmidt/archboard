import { describe, expect, test } from "bun:test";
import {
	CheckResultSchema,
	formatInspectionText,
} from "../../../src/runtime/board-inspection/index.js";
import {
	cleanScene,
	errorScene,
	indeterminateScene,
	warningScene,
} from "./fixtures/package-cases.js";
import { createPackageInspectionOwner } from "./support/package-inspection.js";

describe("package inspection text and exits", () => {
	test("matches the formatter and fixed-base blank-token coercion", async () => {
		const owner = createPackageInspectionOwner();
		try {
			owner.startVault();
			owner.writeBoard("clean", cleanScene());
			const jsonResult = await owner.runInspection("clean");
			const json = CheckResultSchema.parse(JSON.parse(jsonResult.stdout));
			const textResult = await owner.runInspection("clean", ["--text"]);
			expect(textResult.stdout).toBe(`${formatInspectionText(json)}\n`);
			const options = [
				"--dimension-tolerance",
				"--intersection-tolerance",
				"--overlap-tolerance",
			] as const;
			const verifyOption = async (index: number): Promise<void> => {
				const option = options[index];
				if (option === undefined) {
					return;
				}
				const blank = await owner.runInspection("clean", [option, ""]);
				const zero = await owner.runInspection("clean", [option, "0"]);
				expect(blank).toEqual(zero);
				await verifyOption(index + 1);
			};
			await verifyOption(0);
		} finally {
			await owner.dispose();
		}
	});

	test("pins strict exits 6, 7, and 8 on stdout only", async () => {
		const owner = createPackageInspectionOwner();
		try {
			owner.startVault();
			const cases = [
				["warning", warningScene, 6],
				["error", errorScene, 7],
				["unknown", indeterminateScene, 8],
			] as const;
			const verifyCase = async (index: number): Promise<void> => {
				const current = cases[index];
				if (current === undefined) {
					return;
				}
				const [board, scene, status] = current;
				owner.writeBoard(board, scene());
				const result = await owner.runInspection(board, ["--strict"]);
				expect(result.status).toBe(status);
				expect(result.stdout.length).toBeGreaterThan(0);
				expect(result.stderr).toBe("");
				await verifyCase(index + 1);
			};
			await verifyCase(0);
		} finally {
			await owner.dispose();
		}
	});

	test("pins usage 2, operational 1, and invalid-policy precedence", async () => {
		const owner = createPackageInspectionOwner();
		try {
			owner.startVault();
			expect(await owner.runBinary(["check"])).toMatchObject({
				status: 2,
				stdout: "",
			});
			expect(await owner.runInspection("missing")).toMatchObject({
				status: 1,
				stdout: "",
			});
			expect(await owner.runInspection("missing", ["--overlap-tolerance", "bad"])).toMatchObject({
				status: 2,
				stdout: "",
			});
		} finally {
			await owner.dispose();
		}
	});

	test("rejects invalid policy before touching a non-directory vault", async () => {
		const owner = createPackageInspectionOwner();
		try {
			owner.startVaultFile();
			const result = await owner.runInspection("missing", ["--overlap-tolerance", "bad"]);
			expect(result).toEqual({
				status: 2,
				stdout: "",
				stderr:
					"Error: --overlap-tolerance takes a finite nonnegative number\n" +
					"Usage: archboard check --board <key> [--text] [--strict] [--font-family <family>]\n" +
					"      [--dimension-tolerance <px>] [--intersection-tolerance <px>] [--overlap-tolerance <px>]\n\n" +
					"  Strict exits: 0 complete and clean; 6 complete with warnings only;\n" +
					"                7 complete with errors; 8 indeterminate coverage (takes precedence).\n",
			});
			expect(result.stderr).not.toContain("ENOTDIR");
			expect(result.stderr).not.toContain("vault");
		} finally {
			await owner.dispose();
		}
	});
});
