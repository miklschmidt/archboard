import { describe, expect, test } from "bun:test";
import { formatInspectionText } from "../../../src/runtime/board-inspection/index.js";
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
			const json = JSON.parse(owner.runInspection("clean").stdout);
			expect(owner.runInspection("clean", ["--text"]).stdout).toBe(
				`${formatInspectionText(json)}\n`,
			);
			for (const option of [
				"--dimension-tolerance",
				"--intersection-tolerance",
				"--overlap-tolerance",
			]) {
				expect(owner.runInspection("clean", [option, ""])).toEqual(
					owner.runInspection("clean", [option, "0"]),
				);
			}
		} finally {
			await owner.dispose();
		}
	});

	test("pins strict exits 6, 7, and 8 on stdout only", async () => {
		const owner = createPackageInspectionOwner();
		try {
			owner.startVault();
			for (const [board, scene, status] of [
				["warning", warningScene, 6],
				["error", errorScene, 7],
				["unknown", indeterminateScene, 8],
			] as const) {
				owner.writeBoard(board, scene());
				const result = owner.runInspection(board, ["--strict"]);
				expect(result.status).toBe(status);
				expect(result.stdout.length).toBeGreaterThan(0);
				expect(result.stderr).toBe("");
			}
		} finally {
			await owner.dispose();
		}
	});

	test("pins usage 2, operational 1, and invalid-policy precedence", async () => {
		const owner = createPackageInspectionOwner();
		try {
			owner.startVault();
			expect(owner.runBinary(["check"])).toMatchObject({
				status: 2,
				stdout: "",
			});
			expect(owner.runInspection("missing")).toMatchObject({
				status: 1,
				stdout: "",
			});
			expect(owner.runInspection("missing", ["--overlap-tolerance", "bad"])).toMatchObject({
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
			const result = owner.runInspection("missing", ["--overlap-tolerance", "bad"]);
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
