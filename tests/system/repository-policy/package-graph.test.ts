import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { builtinModules } from "node:module";
import {
	cleanSpecifier,
	namedOwner,
	ownerOfFile,
	ownersIn,
	readSource,
	resolveSource,
	sourceFiles,
	sourceOf,
	type Owner,
} from "./support/package-sources.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const packagesRoot = path.join(repoRoot, "packages");
const appsRoot = path.join(repoRoot, "apps");

// The agreed layer order of ADR 0055 and docs/agents/boundaries.md. A package
// imports only a lower layer. Nothing imports an app, and the apps share
// the top layer. App ids include their prefix to distinguish them from packages.
const LAYERS: Record<string, number> = {
	timing: 0,
	diagnostics: 0,
	"ui-kit": 0,
	"server-requests": 0,
	process: 1,
	workspace: 2,
	"code-binding": 3,
	board: 4,
	"codex-app-server": 5,
	renderer: 5,
	"code-intel": 5,
	"server-lifecycle": 6,
	"code-opener": 6,
	walkthrough: 6,
	"codex-realtime-voice": 6,
	workbench: 7,
	skills: 7,
	"apps/cli": 8,
	"apps/server": 8,
	"apps/web": 8,
	"apps/workbench-example": 8,
};

interface Edge {
	from: string;
	to: string;
	file: string;
	specifier: string;
}

function appDirectories(root: string = appsRoot): Owner[] {
	return ownersIn(root, "apps/");
}

function ownerOfSpecifier(specifier: string): string | undefined {
	const named = namedOwner(cleanSpecifier(specifier), owners);
	if (named) return named.id;
	const app = /(?:^|\/)apps\/([a-z0-9-]+)\/(?:src|tests)\//.exec(specifier)?.[1];
	return app ? `apps/${app}` : undefined;
}

function readEdges(owners: Owner[]): Edge[] {
	return owners.flatMap(({ id: from, directory }) =>
		["src", "tests", "assets"]
			.flatMap((area) => sourceFiles(path.join(directory, area)))
			.flatMap((file) =>
				readSource(file).imports.flatMap((specifier) => {
					const target = resolveSource(file, specifier, owners);
					const to =
						namedOwner(cleanSpecifier(specifier), owners)?.id ??
						(target && ownerOfFile(target, owners)?.id);
					return to && to !== from
						? [{ from, to, file: path.relative(repoRoot, file), specifier }]
						: [];
				}),
			),
	);
}

/** Root scripts and tests have no layer, but cannot import an app either. */
function rootImportsOfApps(rootFiles: string[]): string[] {
	return rootFiles.flatMap((file) =>
		readSource(file).imports.flatMap((specifier) => {
			const target = resolveSource(file, specifier, owners);
			const to =
				namedOwner(cleanSpecifier(specifier), owners)?.id ??
				(target && ownerOfFile(target, owners)?.id);
			return to?.startsWith("apps/") || ownerOfSpecifier(specifier)?.startsWith("apps/")
				? [`${path.relative(repoRoot, file)} imports "${specifier}", which names an app`]
				: [];
		}),
	);
}

function rootSourceFiles(): string[] {
	return ["scripts", "tools", "tests"].flatMap((area) => sourceFiles(path.join(repoRoot, area)));
}

function layerViolations(edges: Edge[], layers: Record<string, number>): string[] {
	return edges.flatMap(({ from, to, file, specifier }) => {
		const source = layers[from];
		const target = layers[to];
		return source !== undefined && target !== undefined && target >= source
			? [
					`${file} imports "${specifier}": layer ${source} (${from}) takes in layer ${target} (${to})`,
				]
			: [];
	});
}

function findCycle(edges: Edge[]): string[] | undefined {
	const next = new Map<string, Set<string>>();
	for (const { from, to } of edges) {
		next.set(from, (next.get(from) ?? new Set()).add(to));
	}
	const done = new Set<string>();
	const walk = (node: string, trail: string[]): string[] | undefined => {
		const at = trail.indexOf(node);
		if (at >= 0) return [...trail.slice(at), node];
		if (done.has(node)) return undefined;
		for (const to of next.get(node) ?? []) {
			const cycle = walk(to, [...trail, node]);
			if (cycle) return cycle;
		}
		done.add(node);
		return undefined;
	};
	for (const node of next.keys()) {
		const cycle = walk(node, []);
		if (cycle) return cycle;
	}
	return undefined;
}

function edge(from: string, to: string): Edge {
	return { from, to, file: `${from}/src/a.ts`, specifier: `@archboard/${to}` };
}

/**
 * The edges that reach a package through a subpath that its `exports` does not name.
 * @param edges The edges to judge.
 * @param exportsOf The subpaths that each package exports.
 * @returns One line for each import of a private file.
 */
function privateImports(edges: Edge[], exportsOf: Record<string, readonly string[]>): string[] {
	return edges.flatMap(({ to, file, specifier }) => {
		const rest = cleanSpecifier(specifier).slice(`@archboard/${to}`.length);
		const subpath = rest === "" ? "." : `.${rest}`;
		return !to.startsWith("apps/") &&
			(!specifier.startsWith(`@archboard/${to}`) || !exportsOf[to]?.includes(subpath))
			? [`${file} imports "${specifier}", which exports does not name`]
			: [];
	});
}

/** The subpaths that each package's manifest exports. */
function exportsByPackage(owners: Owner[]): Record<string, string[]> {
	return Object.fromEntries(owners.map(({ id, exports }) => [id, Object.keys(exports)]));
}

const packages = ownersIn(packagesRoot, "");
const apps = appDirectories();
const owners = [...packages, ...apps];
const edges = readEdges(owners);

describe("the package graph", () => {
	test("the reusable workbench depends only on its host-neutral foundation", () => {
		const foundation = new Set([
			"codex-app-server",
			"diagnostics",
			"process",
			"timing",
			"workspace",
		]);
		const violations = edges
			.filter(({ from, to }) => from === "codex-realtime-voice" && !foundation.has(to))
			.map(({ file, specifier }) => `${file} imports "${specifier}"`);
		expect(violations).toEqual([]);
	});

	test("every directory under packages/ and apps/ has a layer", () => {
		expect(owners.filter(({ id }) => LAYERS[id] === undefined).map(({ id }) => id)).toEqual([]);
	});

	test("the apps share layer 8 above every package, and the graph does not need them to exist", () => {
		const appLayers = Object.entries(LAYERS).filter(([id]) => id.startsWith("apps/"));
		const packageLayers = Object.entries(LAYERS).filter(([id]) => !id.startsWith("apps/"));
		expect(new Set(appLayers.map(([id]) => id))).toEqual(
			new Set(appDirectories().map(({ id }) => id)),
		);
		expect(new Set(appLayers.map(([, layer]) => layer))).toEqual(new Set([8]));
		expect(Math.max(...packageLayers.map(([, layer]) => layer))).toBeLessThan(8);
		expect(appDirectories(path.join(appsRoot, "missing"))).toEqual([]);
		expect(readEdges([])).toEqual([]);
	});

	test("no package or app imports an owner of the same or a higher layer", () => {
		expect(layerViolations(edges, LAYERS)).toEqual([]);
	});

	test("no package depends on another that depends back on it, directly or through others", () => {
		const cycle = findCycle(edges);
		expect(cycle ? cycle.join(" -> ") : undefined).toBeUndefined();
	});

	test("every owner imports another package only through a subpath that exports names", () => {
		expect(privateImports(edges, exportsByPackage(packages))).toEqual([]);
	});

	test("no file of the root imports an app, by its workspace name or by a path", () => {
		// Catches a script, a system test or a root module that reaches an app: they are in no
		// layer, so the edges above never see them.
		expect(rootImportsOfApps(rootSourceFiles())).toEqual([]);
	});

	test("the root scan finds a bare app name and an app path, and no package", () => {
		// Catches a scan that reads only paths, or only owners: a bare name resolves through the
		// workspace link in node_modules just as a path does.
		const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-app-scan-"));
		try {
			const named = path.join(scratch, "named.ts");
			const pathed = path.join(scratch, "pathed.ts");
			const clean = path.join(scratch, "clean.ts");
			fs.writeFileSync(
				named,
				'import { clip } from "@archboard-app/cli/src/runtime/clipboard.ts";\n',
			);
			fs.writeFileSync(pathed, 'await import("../../apps/web/src/main.tsx");\n');
			fs.writeFileSync(clean, 'import { id } from "@archboard/board/ids";\n');
			expect(rootImportsOfApps([named, pathed, clean])).toHaveLength(2);
		} finally {
			fs.rmSync(scratch, { recursive: true, force: true });
		}
	});

	test("a specifier names its owner, and an edge into an app is an upward edge", () => {
		// Catches a graph that cannot see an app: nothing imports one, so every edge into an app
		// must be found by its name or its path and must break the layer order.
		expect(ownerOfSpecifier("@archboard/board/ids")).toBe("board");
		expect(ownerOfSpecifier("@archboard-app/web")).toBe("apps/web");
		expect(ownerOfSpecifier("../../../apps/cli/src/runtime/clipboard.js")).toBe("apps/cli");
		expect(ownerOfSpecifier("node_modules/@archboard-app/web/src/x.ts")).toBeUndefined();
		expect(ownerOfSpecifier("node:fs")).toBeUndefined();

		const ok = [
			edge("apps/web", "board"),
			edge("apps/cli", "workbench"),
			edge("apps/server", "ui-kit"),
		];
		expect(layerViolations(ok, LAYERS)).toEqual([]);
		const bad = layerViolations(
			[edge("workbench", "apps/web"), edge("apps/cli", "apps/web"), edge("apps/web", "apps/web")],
			LAYERS,
		);
		expect(bad).toHaveLength(3);
		expect(bad[0]).toContain("layer 7 (workbench) takes in layer 8 (apps/web)");

		const exported = { board: [".", "./ids"] };
		const reached = [
			{ ...edge("apps/web", "board"), specifier: "@archboard/board" },
			{ ...edge("apps/web", "board"), specifier: "@archboard/board/ids" },
			{ ...edge("apps/web", "board"), specifier: "@archboard/board/src/shared/ids.ts" },
		];
		expect(privateImports(reached, exported)).toHaveLength(1);
	});

	test("the detector names a cycle and an upward edge in a synthetic graph", () => {
		const synthetic = [edge("process", "timing"), edge("workspace", "process")];
		expect(findCycle(synthetic)).toBeUndefined();
		expect(layerViolations(synthetic, LAYERS)).toEqual([]);

		expect(findCycle([...synthetic, edge("timing", "workspace")])).toEqual([
			"process",
			"timing",
			"workspace",
			"process",
		]);
		const upward = layerViolations([edge("process", "workspace"), edge("board", "board")], LAYERS);
		expect(upward).toHaveLength(2);
		expect(upward[0]).toContain("process/src/a.ts");
		expect(upward[0]).toContain("@archboard/workspace");
	});
});

/** Follow every local import, including erased types, from browser entrypoints and exports. */
function browserViolations(roots: string[], graphOwners: Owner[]): string[] {
	const seen = new Set<string>();
	const violations: string[] = [];
	const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
	const walk = (file: string, trail: string[]): void => {
		if (seen.has(file)) return;
		seen.add(file);
		const chain = [...trail, path.relative(repoRoot, file)];
		const source = readSource(file);
		if (source.bun) violations.push(`${chain.join(" -> ")} uses Bun`);
		for (const specifier of source.imports) {
			if (builtins.has(specifier) || /^(?:node:|bun(?::|$))/.test(specifier)) {
				violations.push(`${chain.join(" -> ")} imports ${specifier}`);
				continue;
			}
			const target = resolveSource(file, specifier, graphOwners);
			const owner = target && ownerOfFile(target, graphOwners);
			if (!target || !owner) continue;
			const relative = path.relative(owner.directory, target);
			if (
				/^src\/(?:runtime|server|cli)\//.test(relative) ||
				(owner.id.startsWith("apps/") && ownerOfFile(file, graphOwners)?.id !== owner.id)
			) {
				violations.push(`${chain.join(" -> ")} imports ${specifier} (${owner.id}/${relative})`);
			} else if (/\.(?:[cm]?[jt]sx?|css)$/.test(target) && fs.existsSync(target))
				walk(target, chain);
		}
	};
	for (const root of roots) walk(root, []);
	return violations;
}

describe("the resolved package graph", () => {
	test("all manifest exports name existing source files inside their package", () => {
		const violations = packages.flatMap(({ id, directory, exports }) =>
			Object.entries(exports).flatMap(([subpath, target]) => {
				if (
					typeof target !== "string" ||
					!(target.startsWith("./src/") || target.startsWith("./assets/")) ||
					target.includes("*") ||
					subpath.includes("*")
				)
					return [`${id}:${subpath}`];
				const file = path.resolve(directory, target);
				const area = target.startsWith("./assets/") ? "assets" : "src";
				return file.startsWith(`${directory}/${area}/`) &&
					fs.existsSync(file) &&
					fs.statSync(file).isFile()
					? []
					: [`${id}:${subpath} -> ${target}`];
			}),
		);
		expect(violations).toEqual([]);
	});

	test("the web entry and every browser-safe package export reach only browser code", () => {
		const roots = [
			...appDirectories()
				.map(({ directory }) => path.join(directory, "src/main.tsx"))
				.filter(fs.existsSync),
			...packages.flatMap(({ directory, exports }) =>
				Object.values(exports)
					.filter(
						(target) =>
							/^\.\/src\/(?:shared|ui)\//.test(target) || /^\.\/assets\/.+\.css$/.test(target),
					)
					.map((target) => path.resolve(directory, target)),
			),
		];
		expect(browserViolations(roots, owners)).toEqual([]);
	});

	test("the syntax reader includes type imports, mocks and resolver calls without reading comments as code", () => {
		const source = sourceOf(
			[
				'import type { A } from "@archboard/board/document";',
				'export type { B } from "@archboard/board/content";',
				'type C = import("@archboard/board/flow").C;',
				'import("@archboard/board/views");',
				"mock.module(`@archboard/board/policy`, () => ({}));",
				'import.meta.resolve("@archboard/board/comparison");',
				'new Worker(new URL("../workers/layout-worker.ts", import.meta.url));',
				'new URL("../assets/layout.wasm", import.meta.url);',
				'// import "@archboard-app/server";',
			].join("\n"),
		);
		expect(source.imports).toEqual([
			"@archboard/board/document",
			"@archboard/board/content",
			"@archboard/board/flow",
			"@archboard/board/views",
			"@archboard/board/policy",
			"@archboard/board/comparison",
			"../workers/layout-worker.ts",
		]);
	});

	test("resolved files expose a cycle, upward edge, private import and browser leak", () => {
		// Regression owner: a detector fed only prebuilt edges cannot prove its source scan works.
		const base = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-graph-"));
		const write = (file: string, text: string): void => {
			fs.mkdirSync(path.dirname(path.join(base, file)), { recursive: true });
			fs.writeFileSync(path.join(base, file), text);
		};
		try {
			for (const name of ["timing", "process", "workspace"]) {
				write(
					`packages/${name}/package.json`,
					JSON.stringify({
						name: `@archboard/${name}`,
						exports: { ".": "./src/shared/api.ts" },
						imports: { "#*": "./src/*" },
					}),
				);
			}
			write(
				"packages/process/src/shared/api.ts",
				'export type A = import("../../../timing/src/shared/api.ts").A;',
			);
			write(
				"packages/timing/src/shared/api.ts",
				"mock.module(`@archboard/workspace`, () => ({}));",
			);
			write("packages/workspace/src/shared/api.ts", 'import.meta.resolve("@archboard/process");');
			const fixtureOwners = ownersIn(path.join(base, "packages"), "");
			const fixtureEdges = readEdges(fixtureOwners);
			expect(findCycle(fixtureEdges)).toEqual(["process", "timing", "workspace", "process"]);
			expect(layerViolations(fixtureEdges, LAYERS)).toHaveLength(1);
			expect(privateImports(fixtureEdges, exportsByPackage(fixtureOwners))).toHaveLength(1);
			write("packages/process/src/shared/api.ts", 'export { x } from "#runtime/private.ts";');
			write("packages/process/src/runtime/private.ts", "export const x = Bun.version;");
			expect(
				browserViolations([path.join(base, "packages/process/src/shared/api.ts")], fixtureOwners),
			).toHaveLength(1);
			write(
				"packages/process/src/shared/api.ts",
				'import "node:fs"; export const x = Bun.version;',
			);
			expect(
				browserViolations([path.join(base, "packages/process/src/shared/api.ts")], fixtureOwners),
			).toHaveLength(2);
			write(
				"packages/process/src/shared/api.ts",
				'new Worker(new URL("../ui/background.ts", import.meta.url));',
			);
			write("packages/process/src/ui/background.ts", 'import "node:fs";');
			expect(
				browserViolations([path.join(base, "packages/process/src/shared/api.ts")], fixtureOwners),
			).toHaveLength(1);
			// CSS in assets contributes edges and is followed through browser-safe exports too.
			for (const name of ["timing", "process", "workspace"]) {
				write(`packages/${name}/src/shared/api.ts`, "export {};");
				write(
					`packages/${name}/package.json`,
					JSON.stringify({
						name: `@archboard/${name}`,
						exports: { "./theme.css": "./assets/theme.css" },
						imports: { "#*": "./src/*" },
					}),
				);
			}
			write("packages/process/assets/theme.css", '@import "@archboard/timing/theme.css";');
			write("packages/timing/assets/theme.css", '@import "@archboard/workspace/theme.css";');
			write("packages/workspace/assets/theme.css", '@import "@archboard/process/theme.css";');
			const cssOwners = ownersIn(path.join(base, "packages"), "");
			const cssEdges = readEdges(cssOwners);
			expect(findCycle(cssEdges)).toEqual(["process", "timing", "workspace", "process"]);
			expect(layerViolations(cssEdges, LAYERS)).toHaveLength(1);
			write("packages/timing/assets/theme.css", '@import "#runtime/private.css";');
			write("packages/timing/src/runtime/private.css", ".a { color: red; }");
			expect(
				browserViolations([path.join(base, "packages/process/assets/theme.css")], cssOwners),
			).toHaveLength(1);
		} finally {
			fs.rmSync(base, { recursive: true, force: true });
		}
	});
});
