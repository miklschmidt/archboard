import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const packagesRoot = path.join(repoRoot, "packages");

// An `api/` folder is a package's interface over private implementation (docs/agents/boundaries.md,
// "Packages"). A package that adopts it points the `exports` of an area only into that area's
// `api/`, and nothing private reaches back up into it. Each package lists the areas it adopts it
// for. An `executables` entry names an export that is a file to run, not a module to import, with
// the reason: it keeps pointing at its file.
const ADOPTERS: {
	name: string;
	areas: string[];
	executables?: Record<string, string>;
}[] = [
	{ name: "board", areas: ["shared", "runtime"] },
	{ name: "codex-app-server", areas: ["shared", "runtime"] },
	{ name: "workspace", areas: ["shared", "runtime", "server"] },
	{ name: "code-binding", areas: ["shared", "runtime"] },
	{ name: "ui-kit", areas: ["ui"] },
	{
		name: "process",
		areas: ["runtime"],
		executables: {
			"./git-owner": "a Git command runs it as a child process, found with import.meta.resolve",
		},
	},
];

const API_IMPORT = /["'`]#[a-z]+\/api\//;
const EXPORT_STAR = /\bexport\s*\*/;

function exportsOutsideApi(
	exports: Record<string, string>,
	area: string,
	executables: readonly string[] = [],
): string[] {
	const prefix = `./src/${area}/`;
	return Object.entries(exports).flatMap(([subpath, target]) =>
		target.startsWith(prefix) &&
		!executables.includes(subpath) &&
		!new RegExp(`^\\./src/${area}/api/[^/]+\\.ts$`).test(target)
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

describe.each(ADOPTERS)("the api folder of $name", ({ name, areas, executables = {} }) => {
	const manifest = JSON.parse(
		fs.readFileSync(path.join(packagesRoot, name, "package.json"), "utf8"),
	) as { exports: Record<string, string> };
	const files = productionFiles(name);

	test.each(areas)("every export into src/%s points into its api folder", (area) => {
		const exempt = Object.keys(executables);
		expect(exempt.filter((subpath) => !(subpath in manifest.exports))).toEqual([]);
		expect(exportsOutsideApi(manifest.exports, area, exempt)).toEqual([]);
	});

	test("no private production file imports an api file", () => {
		expect(privateFilesImportingApi(files, name, apiSubpaths(manifest.exports))).toEqual([]);
	});

	test("no api file uses export *", () => {
		expect(apiFilesWithExportStar(files)).toEqual([]);
	});
});

// Code outside `packages/` reaches a package through its public name (`@archboard/<name>/<subpath>`),
// never through a literal path into `packages/<name>/src/`. Such a path loads or mocks a private
// file and passes the package boundary unseen, because lint reads only literal import arguments. A
// generated subprocess script gets the file of the public name from `import.meta.resolve`. These
// places name a package file as a file, not as a module to load, and each says why.
const PRIVATE_PATH_FILE_USES: Record<string, string> = {
	"scripts/generate-codex-app-server-contract.ts": "writes the generated contract into the package",
	"tests/system/repository-policy/package-api.test.ts": "holds the synthetic paths of its own scan",
	"tests/system/server-state/staleness-source.test.ts":
		"touches a package file to age the source the server runs",
};
const OUTSIDE_PACKAGES = ["tests", "scripts", "src"];
const SKIPPED_TREES = new Set(["node_modules", "dist", "generated", ".git"]);
const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

/** The line numbers of string literals that name a private path of one of the packages. */
function privatePackagePathLines(
	text: string,
	packageNames: readonly string[],
	executableTargets: readonly string[],
): number[] {
	const pattern = new RegExp(
		`["'\`][^"'\`\\n]*\\bpackages/(${packageNames.join("|")})/src/([^"'\`\\s]*)`,
		"g",
	);
	return text.split("\n").flatMap((line, index) =>
		COMMENT_LINE.test(line) ||
		[...line.matchAll(pattern)].every(([, name, rest = ""]) => {
			const file = `./src/${rest}`;
			return rest.split("/").includes("api") || executableTargets.includes(`${name}:${file}`);
		})
			? []
			: [index + 1],
	);
}

function codeFilesOutsidePackages(): string[] {
	return OUTSIDE_PACKAGES.flatMap((top) => {
		const walk = (directory: string): string[] =>
			fs.readdirSync(path.join(repoRoot, directory), { withFileTypes: true }).flatMap((entry) => {
				const relative = path.join(directory, entry.name);
				if (entry.isDirectory()) {
					return SKIPPED_TREES.has(entry.name) ? [] : walk(relative);
				}
				return CODE_FILE.test(entry.name) ? [relative] : [];
			});
		return walk(top);
	});
}

describe("no code outside the packages names a private package path", () => {
	const packageNames = fs.readdirSync(packagesRoot);
	const executableTargets = ADOPTERS.flatMap(({ name, executables = {} }) => {
		const { exports } = JSON.parse(
			fs.readFileSync(path.join(packagesRoot, name, "package.json"), "utf8"),
		) as { exports: Record<string, string> };
		return Object.keys(executables).map((subpath) => `${name}:${exports[subpath]}`);
	});

	test("tests, scripts and src load a package through its public name", () => {
		const violations = codeFilesOutsidePackages().flatMap((file) =>
			file in PRIVATE_PATH_FILE_USES
				? []
				: privatePackagePathLines(
						fs.readFileSync(path.join(repoRoot, file), "utf8"),
						packageNames,
						executableTargets,
					).map((line) => `${file}:${line}`),
		);
		expect(violations).toEqual([]);
	});

	test("the scan names a private path and spares the rest, in a synthetic file", () => {
		const text = [
			`mock.module("../../packages/board/src/runtime/store/doing.ts", () => ({}));`, // 1: private
			`const p = join(root, \`packages/board/src/shared/ids/ids.ts\`);`, // 2: private
			`import x from "../../packages/board/src/shared/api/ids.ts";`, // 3: api file
			`const e = "packages/process/src/runtime/processes/git-owner.ts";`, // 4: executable
			`const f = "packages/alpha/src/shared/x.ts";`, // 5: not a package here
			` * Mirrors \`packages/board/src/runtime/store/doing.ts\`.`, // 6: comment
			`// "packages/board/src/runtime/store/doing.ts"`, // 7: comment
		].join("\n");
		expect(
			privatePackagePathLines(
				text,
				["board", "process"],
				["process:./src/runtime/processes/git-owner.ts"],
			),
		).toEqual([1, 2]);
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
					"./owner": "./src/runtime/processes/owner.ts",
					"./group": "./src/runtime/processes/group.ts",
					"./api": "./src/runtime/api/group.ts",
				},
				"runtime",
				["./owner"],
			),
		).toEqual(["./group -> ./src/runtime/processes/group.ts"]);
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
