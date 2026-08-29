import { describe, expect, test } from "bun:test";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const gitCommand = ["git", "ls-files", "--cached", "--others", "--exclude-standard"] as const;

type GitListing = SpawnSyncReturns<string>;

function gitFailure(result: GitListing): string {
	return [
		`command: ${gitCommand.join(" ")}`,
		`cwd: ${repoRoot}`,
		`status: ${result.status ?? "null"}`,
		`signal: ${result.signal ?? "null"}`,
		`spawn error: ${result.error?.message ?? "none"}`,
		`stdout:\n${result.stdout}`,
		`stderr:\n${result.stderr}`,
	].join("\n");
}

function requireSuccessfulGitListing(result: GitListing): string {
	if (result.error || result.signal || result.status !== 0) {
		throw new Error(`Could not inventory repository paths.\n${gitFailure(result)}`);
	}
	return result.stdout;
}

function forbiddenMjsPaths(stdout: string): string[] {
	return [...new Set(stdout.split(/\r?\n/).filter((entry) => entry.endsWith(".mjs")))].toSorted();
}

function noMjsFailure(stdout: string): string | undefined {
	const forbidden = forbiddenMjsPaths(stdout);
	if (forbidden.length === 0) return undefined;
	return [
		"Repository paths must not use the .mjs extension:",
		...forbidden.map((entry) => `- ${entry}`),
		"Convert each file to typed TypeScript or delete it.",
	].join("\n");
}

function inventoryRepositoryPaths(): string {
	const result = spawnSync(gitCommand[0], gitCommand.slice(1), {
		cwd: repoRoot,
		encoding: "utf8",
	});
	return requireSuccessfulGitListing(result);
}

describe("no-MJS repository policy", () => {
	test("lists every forbidden .mjs path and suggests TypeScript conversion", () => {
		const synthetic = [
			"tracked/second.mjs",
			"untracked/first.mjs",
			"tracked/second.mjs",
			"ignored-looking/vendor.mjs",
			"typed/allowed.ts",
			"almost.mjs.txt",
			"",
		].join("\n");
		expect(noMjsFailure(synthetic)).toBe(
			[
				"Repository paths must not use the .mjs extension:",
				"- ignored-looking/vendor.mjs",
				"- tracked/second.mjs",
				"- untracked/first.mjs",
				"Convert each file to typed TypeScript or delete it.",
			].join("\n"),
		);
	});

	test("diagnoses git spawn, signal, and nonzero failures", () => {
		const failures: GitListing[] = [
			{
				pid: 0,
				output: [null, "partial output", "spawn stderr"],
				stdout: "partial output",
				stderr: "spawn stderr",
				status: null,
				signal: null,
				error: new Error("git unavailable"),
			},
			{
				pid: 1,
				output: [null, "signal output", "signal stderr"],
				stdout: "signal output",
				stderr: "signal stderr",
				status: null,
				signal: "SIGTERM",
			},
			{
				pid: 2,
				output: [null, "status output", "status stderr"],
				stdout: "status output",
				stderr: "status stderr",
				status: 128,
				signal: null,
			},
		];
		for (const result of failures) {
			expect(() => requireSuccessfulGitListing(result)).toThrow("command: git ls-files");
			expect(() => requireSuccessfulGitListing(result)).toThrow(`cwd: ${repoRoot}`);
			expect(() => requireSuccessfulGitListing(result)).toThrow(
				`status: ${result.status ?? "null"}`,
			);
			expect(() => requireSuccessfulGitListing(result)).toThrow(
				`signal: ${result.signal ?? "null"}`,
			);
			expect(() => requireSuccessfulGitListing(result)).toThrow(`stdout:\n${result.stdout}`);
			expect(() => requireSuccessfulGitListing(result)).toThrow(`stderr:\n${result.stderr}`);
		}
	});

	test("the real checkout contains no .mjs path", () => {
		const failure = noMjsFailure(inventoryRepositoryPaths());
		expect(failure, failure).toBeUndefined();
	});
});
