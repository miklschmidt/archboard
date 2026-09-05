import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../../..");
const generated =
	"src/shared/codex-app-server-contract/generated/versions/version-0.151.0-recipe-2";

const corrections = new Map<string, readonly [string, string]>([
	["v2/ThreadRealtimeStartParams.ts", ["prompt?: string | null | null", "prompt?: string | null"]],
	["v2/ThreadForkParams.ts", ["serviceTier?: string | null | null", "serviceTier?: string | null"]],
]);

test("the structural exception contains the pinned output with only approved corrections", () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-vendor-declarations-"));
	try {
		const result = Bun.spawnSync(
			[
				process.execPath,
				join(repoRoot, "node_modules/@openai/codex/bin/codex.js"),
				"app-server",
				"generate-ts",
				"--experimental",
				"--out",
				root,
			],
			{ cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
		);
		expect(result.exitCode, result.stderr.toString()).toBe(0);
		const files = [...new Bun.Glob("**/*").scanSync({ cwd: root, onlyFiles: true })].toSorted();
		const actual = [
			...new Bun.Glob("**/*").scanSync({ cwd: join(repoRoot, generated), onlyFiles: true }),
		].toSorted();
		expect(
			actual,
			"Regenerate with bun run generate:codex-contract; do not hand-edit vendor declarations",
		).toEqual(files);
		for (const file of files) {
			const raw = readFileSync(join(root, file), "utf8");
			const correction = corrections.get(file);
			const expected = correction ? raw.replace(correction[0], correction[1]) : raw;
			if (correction) expect(raw.split(correction[0]).length - 1, file).toBe(1);
			expect(readFileSync(join(repoRoot, generated, file), "utf8"), file).toBe(expected);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
