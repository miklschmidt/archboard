import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packagesRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../packages",
);

// An `api/` folder is a package's interface over private implementation (docs/agents/boundaries.md,
// "Packages"). A package that adopts it points the `exports` of an area only into that area's
// `api/`, and nothing private reaches back up into it. Each package lists the areas it adopts it
// for.
const ADOPTERS = [
	{ name: "board", areas: ["shared", "runtime"] },
	{ name: "codex-app-server", areas: ["shared", "runtime"] },
];

const API_IMPORT = /["'`]#[a-z]+\/api\//;
const EXPORT_STAR = /\bexport\s*\*/;

function exportsOutsideApi(exports: Record<string, string>, area: string): string[] {
	const prefix = `./src/${area}/`;
	return Object.entries(exports).flatMap(([subpath, target]) =>
		target.startsWith(prefix) && !new RegExp(`^\\./src/${area}/api/[^/]+\\.ts$`).test(target)
			? [`${subpath} -> ${target}`]
			: [],
	);
}

function isApiFile(file: string): boolean {
	return file.split("/").includes("api");
}

/** The api subpaths of a package: the `exports` keys that point into an `api/` folder. */
function apiSubpaths(exports: Record<string, string>): string[] {
	return Object.entries(exports).flatMap(([subpath, target]) =>
		isApiFile(target) ? [subpath.slice(2)] : [],
	);
}

/** Whether a file names an api file, by `#` specifier or by the package's own name. */
function importsApi(text: string, name: string, subpaths: readonly string[]): boolean {
	const own = new RegExp(`["'\`]@archboard/${name}/([^"'\`?]+)`, "g");
	return (
		API_IMPORT.test(text) ||
		[...text.matchAll(own)].some(([, subpath]) => subpaths.includes(subpath ?? ""))
	);
}

function privateFilesImportingApi(
	files: Record<string, string>,
	name: string,
	subpaths: readonly string[],
): string[] {
	return Object.entries(files).flatMap(([file, text]) =>
		!isApiFile(file) && importsApi(text, name, subpaths) ? [file] : [],
	);
}

function apiFilesWithExportStar(files: Record<string, string>): string[] {
	return Object.entries(files).flatMap(([file, text]) =>
		isApiFile(file) && EXPORT_STAR.test(text) ? [file] : [],
	);
}

function productionFiles(name: string): Record<string, string> {
	const src = path.join(packagesRoot, name, "src");
	return Object.fromEntries(
		fs
			.readdirSync(src, { recursive: true, encoding: "utf8" })
			.filter((file) => /\.tsx?$/.test(file))
			.map((file) => [file, fs.readFileSync(path.join(src, file), "utf8")]),
	);
}

describe.each(ADOPTERS)("the api folder of $name", ({ name, areas }) => {
	const manifest = JSON.parse(
		fs.readFileSync(path.join(packagesRoot, name, "package.json"), "utf8"),
	) as { exports: Record<string, string> };
	const files = productionFiles(name);

	test.each(areas)("every export into src/%s points into its api folder", (area) => {
		expect(exportsOutsideApi(manifest.exports, area)).toEqual([]);
	});

	test("no private production file imports an api file", () => {
		expect(privateFilesImportingApi(files, name, apiSubpaths(manifest.exports))).toEqual([]);
	});

	test("no api file uses export *", () => {
		expect(apiFilesWithExportStar(files)).toEqual([]);
	});
});

describe("the api checks", () => {
	test("each check names a violation in a synthetic package", () => {
		expect(
			exportsOutsideApi(
				{
					"./document": "./src/shared/api/document.ts",
					"./ids": "./src/shared/rules/ids.ts",
					"./write": "./src/runtime/operations/write/write.ts",
					"./nested": "./src/shared/api/deeper/nested.ts",
				},
				"shared",
			),
		).toEqual([
			"./ids -> ./src/shared/rules/ids.ts",
			"./nested -> ./src/shared/api/deeper/nested.ts",
		]);
		expect(
			exportsOutsideApi(
				{
					"./lock": "./src/runtime/api/lock.ts",
					"./write": "./src/runtime/operations/write/write.ts",
					"./ids": "./src/shared/api/ids.ts",
				},
				"runtime",
			),
		).toEqual(["./write -> ./src/runtime/operations/write/write.ts"]);

		const files = {
			"shared/api/document.ts": `export { a } from "#shared/rules/a.ts";\n`,
			"shared/api/star.ts": `export * from "#shared/rules/a.ts";\n`,
			"shared/rules/b.ts": `import { a } from "#shared/api/document.ts";\n`,
			"runtime/c.ts": `import { a } from "#shared/rules/a.ts";\n`,
			"runtime/d.ts": `import { mintId } from "@archboard/board/ids";\n`,
			"runtime/e.ts": `import { x } from "@archboard/board/private-thing";\n`,
		};
		expect(privateFilesImportingApi(files, "board", ["document", "ids"])).toEqual([
			"shared/rules/b.ts",
			"runtime/d.ts",
		]);
		expect(apiFilesWithExportStar(files)).toEqual(["shared/api/star.ts"]);
	});
});
