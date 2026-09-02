import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "../../..");

function sources(pattern: string): Array<{ path: string; source: string }> {
	return [...new Bun.Glob(pattern).scanSync({ cwd: repoRoot })].map((path) => ({
		path,
		source: readFileSync(join(repoRoot, path), "utf8"),
	}));
}

test("code-target diagnostics and resolver core stay behind their module roots", () => {
	const productRoot = readFileSync(join(repoRoot, "src/runtime/code-target/index.ts"), "utf8");
	expect(productRoot).not.toMatch(/diagnostic/i);

	const production = sources("src/**/*.ts");
	expect(
		production
			.filter(({ path }) => path !== "src/runtime/code-target/diagnostics.ts")
			.filter(({ source }) => source.includes("code-target/diagnostics"))
			.map(({ path }) => path),
	).toEqual([]);

	const coreImporters = production
		.filter(({ source }) => source.includes("lib/resolver-core"))
		.map(({ path }) => path)
		.toSorted();
	expect(coreImporters).toEqual([
		"src/runtime/code-target/diagnostics.ts",
		"src/runtime/code-target/index.ts",
	]);
	expect(
		sources("**/*.test.ts")
			.filter(({ path }) => path !== "tests/system/repository-policy/code-target-boundary.test.ts")
			.filter(({ source }) => source.includes("lib/resolver-core"))
			.map(({ path }) => path),
	).toEqual([]);
});

test("resolver filesystem views stay derived from Node", () => {
	const core = readFileSync(join(repoRoot, "src/runtime/code-target/lib/resolver-core.ts"), "utf8");
	expect(core).toMatch(/import type \{ Stats \} from "node:fs";/);
	expect(core).toMatch(/stat\(candidate: string\): Pick<Stats, "isDirectory" \| "isFile">;/);
});
