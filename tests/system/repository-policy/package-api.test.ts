import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sourceOf } from "./support/package-sources.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const packagesRoot = path.join(repoRoot, "packages");

// An `api/` folder is a package's interface over private implementation (docs/agents/boundaries.md,
// "Packages"). A package that adopts it points the `exports` of an area only into that area's
// `api/`, and nothing private reaches back up into it. Each package lists the areas it adopts it
// for.
const ADOPTERS: {
	name: string;
	areas: string[];
}[] = [
	{ name: "model", areas: ["shared", "runtime"] },
	{ name: "codex-app-server", areas: ["shared", "runtime"] },
	{ name: "workspace", areas: ["shared", "runtime", "server"] },
	{ name: "code-binding", areas: ["shared", "runtime"] },
	{ name: "ui-kit", areas: ["ui"] },
	{ name: "server-requests", areas: ["ui"] },
	{ name: "code-intel", areas: ["shared", "runtime"] },
	{ name: "renderer", areas: ["shared", "runtime", "ui"] },
	{ name: "code-opener", areas: ["shared", "server", "ui"] },
	{ name: "walkthrough", areas: ["shared", "runtime"] },
	{ name: "skills", areas: ["runtime"] },
	{ name: "server-lifecycle", areas: ["shared", "runtime"] },
	{ name: "workbench", areas: ["shared", "runtime", "server", "ui"] },
	{ name: "codex-realtime-voice", areas: ["shared", "runtime", "server", "ui"] },
	{ name: "process", areas: ["runtime"] },
];

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
		isApiFile(target) ? [subpath === "." ? "" : subpath.slice(2)] : [],
	);
}

/** Whether a file names an api file, by `#` specifier or by the package's own name. */
function importsApi(
	text: string,
	name: string,
	subpaths: readonly string[],
	file: string,
): boolean {
	return sourceOf(text).imports.some((specifier) => {
		const source = specifier.split("?")[0] ?? "";
		if (/^#[a-z]+\/api\//.test(source)) return true;
		if (
			source.startsWith(".") &&
			isApiFile(path.posix.normalize(path.posix.join(path.posix.dirname(file), source)))
		)
			return true;
		if (source.startsWith("file:") && isApiFile(source)) return true;
		const own = `@archboard/${name}`;
		return (
			(source === own && subpaths.includes("")) ||
			(source.startsWith(`${own}/`) && subpaths.includes(source.slice(own.length + 1)))
		);
	});
}

function privateFilesImportingApi(
	files: Record<string, string>,
	name: string,
	subpaths: readonly string[],
): string[] {
	return Object.entries(files).flatMap(([file, text]) =>
		!isApiFile(file) && importsApi(text, name, subpaths, file) ? [file] : [],
	);
}

function apiFilesWithExportStar(files: Record<string, string>): string[] {
	return Object.entries(files).flatMap(([file, text]) =>
		isApiFile(file) && sourceOf(text).exportStar ? [file] : [],
	);
}

function productionFiles(name: string): Record<string, string> {
	const src = path.join(packagesRoot, name, "src");
	return Object.fromEntries(
		fs
			.readdirSync(src, { recursive: true, encoding: "utf8" })
			.filter(
				(file) =>
					/\.tsx?$/.test(file) && !file.split(path.sep).some((part) => SKIPPED_TREES.has(part)),
			)
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

// Code outside `packages/` (the apps too, which are the top layer) reaches a package through its
// public name (`@archboard/<name>/<subpath>`), never through a literal path into
// `packages/<name>/src/`. Such a path loads or mocks a private
// file and passes the package boundary unseen, because lint reads only literal import arguments. A
// generated subprocess script gets the file of the public name from `import.meta.resolve`. These
// places name a package file as a file, not as a module to load, and each says why.
const PRIVATE_PATH_FILE_USES: Record<string, string> = {
	"scripts/generate-codex-app-server-contract.ts": "writes the generated contract into the package",
	"scripts/release/compile.ts":
		"embeds the modules that start on their own at the checkout paths where programRoot finds them",
	"tests/system/repository-policy/package-api.test.ts": "holds the synthetic paths of its own scan",
	"tests/system/repository-policy/package-graph.test.ts":
		"holds disposable graph fixtures with intentional private imports",
	"tests/system/server-state/fixtures/public-codex-startup-preload.ts":
		"replaces the cleanup timing and the startup readiness of the private files that the launcher's spawn imports",
	"tests/system/server-state/staleness-source.test.ts":
		"touches a package file to age the source the server runs",
};
const OUTSIDE_PACKAGES = ["tests", "scripts", "tools", "apps"];
const SKIPPED_TREES = new Set(["node_modules", "dist", "generated", ".git"]);
const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/;

/** The line numbers of string literals that name a private path of one of the packages. */
function privatePackagePathLines(text: string, packageNames: readonly string[]): number[] {
	const pattern = new RegExp(
		`(?:^|/)packages/(${packageNames.join("|")})/src/([^"'\`\\s);]*)`,
		"g",
	);
	return [
		...new Set(
			sourceOf(text).strings.flatMap(({ text: literal, line }) =>
				[...literal.matchAll(pattern)].some(([, , rest = ""]) => /\.[cm]?[jt]sx?$/.test(rest))
					? [line]
					: [],
			),
		),
	];
}

/** The code files below the top folders of a repository; a top folder that does not exist is skipped. */
function codeFilesBelow(base: string, tops: readonly string[]): string[] {
	return tops.flatMap((top) => {
		const walk = (directory: string): string[] =>
			fs.readdirSync(path.join(base, directory), { withFileTypes: true }).flatMap((entry) => {
				const relative = path.join(directory, entry.name);
				if (entry.isDirectory()) {
					return SKIPPED_TREES.has(entry.name) ? [] : walk(relative);
				}
				return CODE_FILE.test(entry.name) ? [relative] : [];
			});
		return fs.existsSync(path.join(base, top)) ? walk(top) : [];
	});
}

function codeFilesOutsidePackages(): string[] {
	return codeFilesBelow(repoRoot, OUTSIDE_PACKAGES);
}

describe("no code outside the packages names a private package path", () => {
	const packageNames = fs.readdirSync(packagesRoot);

	test("tests, scripts and src load a package through its public name", () => {
		const violations = codeFilesOutsidePackages().flatMap((file) =>
			file in PRIVATE_PATH_FILE_USES
				? []
				: privatePackagePathLines(
						fs.readFileSync(path.join(repoRoot, file), "utf8"),
						packageNames,
					).map((line) => `${file}:${line}`),
		);
		expect(violations).toEqual([]);
	});

	test("the scan reaches the source and the tests of an app, and no app need exist", () => {
		// Catches an app that loads a private package file by path: apps hold the code that
		// sits above every package, and the scan listed only tests, scripts and src.
		const base = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-package-api-"));
		try {
			expect(codeFilesBelow(base, OUTSIDE_PACKAGES)).toEqual([]);
			for (const file of ["apps/cli/src/cli/run.ts", "apps/cli/tests/run.test.ts"]) {
				fs.mkdirSync(path.join(base, path.dirname(file)), { recursive: true });
				fs.writeFileSync(path.join(base, file), "export const run = 1;\n");
			}
			fs.mkdirSync(path.join(base, "apps/cli/node_modules"), { recursive: true });
			fs.writeFileSync(path.join(base, "apps/cli/node_modules/skipped.ts"), "");
			expect(codeFilesBelow(base, OUTSIDE_PACKAGES).toSorted()).toEqual([
				"apps/cli/src/cli/run.ts",
				"apps/cli/tests/run.test.ts",
			]);
		} finally {
			fs.rmSync(base, { recursive: true, force: true });
		}
	});

	test("the scan names a private path and spares the rest, in a synthetic file", () => {
		const text = [
			`mock.module("../../packages/model/src/runtime/store/doing.ts", () => ({}));`, // 1: private
			`const p = join(root, \`packages/model/src/shared/ids/ids.ts\`);`, // 2: private
			`import x from "../../packages/model/src/shared/api/ids.ts";`, // 3: a public file still needs its exported name
			`const f = "packages/alpha/src/shared/x.ts";`, // 4: not a package here
			`/** Mirrors \`packages/model/src/runtime/store/doing.ts\`. */`, // 5: comment
			`// "packages/model/src/runtime/store/doing.ts"`, // 6: comment
		].join("\n");
		expect(privatePackagePathLines(text, ["model", "process"])).toEqual([1, 2, 3]);
	});
});

describe("the api checks", () => {
	test("each check names a violation in a synthetic package", () => {
		expect(
			exportsOutsideApi(
				{
					"./legacy-board": "./src/shared/api/legacy-board.ts",
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
					"./group": "./src/runtime/processes/group.ts",
					"./api": "./src/runtime/api/group.ts",
				},
				"runtime",
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
			"shared/rules/b.ts": `import { a } from "#shared/api/legacy-board.ts";\n`,
			"runtime/c.ts": `import { a } from "#shared/rules/a.ts";\n`,
			"runtime/d.ts": `import { mintId } from "@archboard/model/ids";\n`,
			"runtime/e.ts": `import { x } from "@archboard/model/private-thing";\n`,
			"shared/rules/relative.ts": `import { a } from "../api/document.ts";\n`,
			"shared/rules/type.ts": `type A = import("../api/document.ts").A;\n`,
		};
		expect(privateFilesImportingApi(files, "model", ["legacy-board", "ids"])).toEqual([
			"shared/rules/b.ts",
			"runtime/d.ts",
			"shared/rules/relative.ts",
			"shared/rules/type.ts",
		]);
		expect(apiFilesWithExportStar(files)).toEqual(["shared/api/star.ts"]);
	});
});
