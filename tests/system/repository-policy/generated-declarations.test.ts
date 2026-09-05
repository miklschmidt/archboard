import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../../..");
const generated =
	"src/shared/codex-app-server-contract/generated/versions/version-0.151.0-recipe-1";

test("the structural exception contains only untouched pinned vendor declarations", () => {
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
		for (const file of files)
			expect(readFileSync(join(repoRoot, generated, file)), file).toEqual(
				readFileSync(join(root, file)),
			);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
