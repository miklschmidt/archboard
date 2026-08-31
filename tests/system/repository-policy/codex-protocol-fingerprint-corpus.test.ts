import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, test } from "bun:test";

const repoRoot = path.resolve(import.meta.dir, "../../..");
const checker = path.join(repoRoot, "scripts/check-codex-protocol-fingerprint-corpus.ts");

function runChecker(corpusPath?: string): Error | undefined {
	try {
		execFileSync(
			"bun",
			corpusPath
				? [checker, "--corpus", corpusPath]
				: ["run", "check:codex-protocol-fingerprint-corpus"],
			{
				cwd: repoRoot,
				encoding: "utf8",
			},
		);
		return undefined;
	} catch (error) {
		return error as Error;
	}
}

describe("Codex protocol fingerprint corpus", () => {
	test("regenerates every fingerprint from the pinned project-local generator", () => {
		expect(runChecker()).toBeUndefined();
	});

	test("rejects corruption in an otherwise unused fingerprint", () => {
		const temporaryRoot = fs.mkdtempSync(
			path.join(process.env.TMPDIR ?? "/tmp", "archboard-codex-corpus-"),
		);
		const temporaryCorpus = path.join(temporaryRoot, "corpus.json");
		try {
			const original = fs.readFileSync(
				path.join(
					repoRoot,
					"tests/system/repository-policy/support/codex-protocol-fingerprint-corpus.json",
				),
				"utf8",
			);
			const corrupted = JSON.parse(original) as { entries: Record<string, string[]> };
			const firstPath = Object.keys(corrupted.entries)[0];
			if (!firstPath) throw new Error("Corpus is empty");
			const firstTokens = corrupted.entries[firstPath];
			if (!firstTokens) throw new Error(`Corpus entry ${firstPath} is empty`);
			firstTokens[0] = "corrupt:unused-token";
			fs.writeFileSync(temporaryCorpus, `${JSON.stringify(corrupted, null, "\t")}\n`);
			const failure = runChecker(temporaryCorpus);
			expect(failure).toBeInstanceOf(Error);
			expect((failure as Error & { stderr?: Buffer }).stderr?.toString()).toContain(
				"does not match",
			);
		} finally {
			fs.rmSync(temporaryRoot, { recursive: true, force: true });
		}
	});
});
