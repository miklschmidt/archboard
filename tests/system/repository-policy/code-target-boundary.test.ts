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

test("resolver filesystem views stay derived from Node and change reports keep one batch", () => {
	const core = readFileSync(join(repoRoot, "src/runtime/code-target/lib/resolver-core.ts"), "utf8");
	expect(core).toMatch(/import type \{ Stats \} from "node:fs";/);
	expect(core).toMatch(/stat\(candidate: string\): Pick<Stats, "isDirectory" \| "isFile">;/);

	const application = readFileSync(join(repoRoot, "src/server/canvas/lib/application.ts"), "utf8");
	const routeStart = application.indexOf('app.post("/api/elements/changes"');
	const nextRoute = application.indexOf("\napp.", routeStart + 1);
	expect(routeStart).toBeGreaterThanOrEqual(0);
	expect(nextRoute).toBeGreaterThan(routeStart);
	const changeReportRoute = application.slice(routeStart, nextRoute);
	expect(changeReportRoute).not.toMatch(/\bpresentElement\s*\(/);
	expect(changeReportRoute.match(/\bpresentElements\s*\(/g)).toHaveLength(1);
});
