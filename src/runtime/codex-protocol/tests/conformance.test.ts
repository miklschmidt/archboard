import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
	CODEX_PROTOCOL_BINARY_VERSION,
	CODEX_PROTOCOL_GENERATED_FILE_COUNT,
	CODEX_PROTOCOL_GENERATED_TREE_SHA256,
	CodexProtocolConformanceError,
	digestGeneratedTree,
	runCodexProtocolConformance,
} from "../index.js";

describe("portable Codex protocol conformance", () => {
	test("digests the same TypeScript tree independent of creation order", () => {
		const firstRoot = mkdtempSync(join(tmpdir(), "archboard-digest-first-"));
		const secondRoot = mkdtempSync(join(tmpdir(), "archboard-digest-second-"));
		try {
			for (const root of [firstRoot, secondRoot]) mkdirSync(join(root, "nested"));
			writeFileSync(join(firstRoot, "a.ts"), "export const a = 1;\n");
			writeFileSync(join(firstRoot, "nested", "b.ts"), "export const b = 2;\n");
			writeFileSync(join(firstRoot, "ignored.txt"), "not part of the digest\n");
			writeFileSync(join(secondRoot, "nested", "b.ts"), "export const b = 2;\n");
			writeFileSync(join(secondRoot, "a.ts"), "export const a = 1;\n");

			const expected = {
				fileCount: 2,
				sha256: "ffed8b1a09fdaa99df806f3f5e3faea1b43042a4d46ebdd93f62c6339633b006",
			};
			expect(digestGeneratedTree(firstRoot)).toEqual(expected);
			expect(digestGeneratedTree(secondRoot)).toEqual(expected);
		} finally {
			rmSync(firstRoot, { recursive: true, force: true });
			rmSync(secondRoot, { recursive: true, force: true });
		}
	});

	test("requires an explicit absolute executable path without PATH lookup", () => {
		let thrown: unknown;
		try {
			runCodexProtocolConformance("codex");
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(CodexProtocolConformanceError);
		expect(thrown).toMatchObject({ phase: "path", executablePath: "codex" });
		expect((thrown as Error).message).toContain("PATH lookup is intentionally disabled");
	});

	test("reports a missing explicit executable as an actionable version failure", () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-missing-codex-"));
		const executablePath = join(root, "codex");
		try {
			let thrown: unknown;
			try {
				runCodexProtocolConformance(executablePath);
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(CodexProtocolConformanceError);
			expect(thrown).toMatchObject({ phase: "version", executablePath });
			expect((thrown as Error).message).toContain("could not run --version");
			expect((thrown as Error).message).toContain(CODEX_PROTOCOL_BINARY_VERSION);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("rejects an explicit executable with the wrong Codex version", () => {
		let thrown: unknown;
		try {
			runCodexProtocolConformance(process.execPath);
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(CodexProtocolConformanceError);
		expect(thrown).toMatchObject({ phase: "version", executablePath: process.execPath });
		expect((thrown as Error).message).toContain(`expected ${CODEX_PROTOCOL_BINARY_VERSION}`);
	});

	test("keeps the manifest expectations explicit for manual conformance", () => {
		expect(CODEX_PROTOCOL_GENERATED_FILE_COUNT).toBe(820);
		expect(CODEX_PROTOCOL_GENERATED_TREE_SHA256).toBe(
			"cdd893570801b36e404a20e7842c71312abc6bc716960ddaa53dde92bfa6f273",
		);
	});
});
