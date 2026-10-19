import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const packagesRoot = path.join(repoRoot, "packages");
const appsRoot = path.join(repoRoot, "apps");

// Layers of docs/design/package-map.md and docs/design/apps-migration.md. A package or an app
// may import only a lower layer. The table lists planned packages too, so a package that lands
// later is already placed. An app is written `apps/<name>`, so that it never collides with a
// package name. Nothing imports an app, and the three apps share the top layer.
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
	workbench: 7,
	skills: 7,
	"apps/cli": 8,
	"apps/server": 8,
	"apps/web": 8,
};

/** A package or an app: its id in the layer table, its directory and its manifest's name. */
interface Owner {
	id: string;
	directory: string;
}

interface Edge {
	from: string;
	to: string;
	file: string;
	specifier: string;
}

// Not a parser: a regex over the source. It reads the specifier of a static import, a
// re-export, a side-effect import, import(), mock.module(), vi.mock(), vi.doMock() and
// import.meta.resolve(). A comment that looks like one is read as one.
const SPECIFIER =
	/(?:\bfrom\s*|\bimport\s*\(?\s*|\bmock\.module\s*\(\s*|\bvi\.(?:mock|doMock)\s*\(\s*|\bimport\.meta\.resolve\s*\(\s*)["']([^"'\n]+)["']/g;

/**
 * The id of the package or app that a specifier names: `@archboard/<name>` is a package, and
 * `@archboard-app/<name>` or a path into `apps/<name>/(src|tests)` is an app.
 * @param specifier The specifier as written.
 * @returns The id, or undefined for a specifier that names neither.
 */
function ownerOfSpecifier(specifier: string): string | undefined {
	const packageName = /^@archboard\/([a-z0-9-]+)/.exec(specifier)?.[1];
	if (packageName) return packageName;
	const appName =
		/^@archboard-app\/([a-z0-9-]+)/.exec(specifier)?.[1] ??
		/(?:^|\/)apps\/([a-z0-9-]+)\/(?:src|tests)\//.exec(specifier)?.[1];
	return appName ? `apps/${appName}` : undefined;
}

function sourceFiles(dir: string): string[] {
	if (!fs.existsSync(dir)) return [];
	return fs
		.readdirSync(dir, { recursive: true, encoding: "utf8" })
		.filter((file) => /\.tsx?$/.test(file) && !file.split(path.sep).includes("generated"))
		.map((file) => path.join(dir, file));
}

function directoriesIn(root: string, prefix: string): Owner[] {
	if (!fs.existsSync(root)) return [];
	return fs
		.readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => ({ id: `${prefix}${entry.name}`, directory: path.join(root, entry.name) }))
		.toSorted((left, right) => left.id.localeCompare(right.id));
}

/** The apps under a directory; none when the directory does not exist. */
function appDirectories(root: string = appsRoot): Owner[] {
	return directoriesIn(root, "apps/");
}

function readEdges(owners: Owner[]): Edge[] {
	const edges: Edge[] = [];
	const ids = new Set(owners.map(({ id }) => id));
	for (const { id: from, directory } of owners) {
		for (const area of ["src", "tests"]) {
			for (const file of sourceFiles(path.join(directory, area))) {
				for (const match of fs.readFileSync(file, "utf8").matchAll(SPECIFIER)) {
					const [, specifier = ""] = match;
					const to = ownerOfSpecifier(specifier);
					// An npm package in the @archboard scope is not in packages/.
					if (to !== undefined && to !== from && ids.has(to)) {
						edges.push({ from, to, file: path.relative(repoRoot, file), specifier });
					}
				}
			}
		}
	}
	return edges;
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
		const rest = specifier.slice(`@archboard/${to}`.length).split("?")[0] ?? "";
		const subpath = rest === "" ? "." : `.${rest}`;
		return specifier.startsWith("@archboard/") && !exportsOf[to]?.includes(subpath)
			? [`${file} imports "${specifier}", which exports does not name`]
			: [];
	});
}

/** The subpaths that each package's manifest exports. */
function exportsByPackage(owners: Owner[]): Record<string, string[]> {
	return Object.fromEntries(
		owners.map(({ id, directory }) => {
			const manifest = JSON.parse(
				fs.readFileSync(path.join(directory, "package.json"), "utf8"),
			) as {
				exports?: Record<string, string>;
			};
			return [id, Object.keys(manifest.exports ?? {})];
		}),
	);
}

const packages = directoriesIn(packagesRoot, "");
const apps = appDirectories();
const owners = [...packages, ...apps];
const edges = readEdges(owners);

describe("the package graph", () => {
	test("every directory under packages/ and apps/ has a layer", () => {
		expect(owners.filter(({ id }) => LAYERS[id] === undefined).map(({ id }) => id)).toEqual([]);
	});

	test("the apps share layer 8 above every package, and the graph does not need them to exist", () => {
		const appLayers = Object.entries(LAYERS).filter(([id]) => id.startsWith("apps/"));
		const packageLayers = Object.entries(LAYERS).filter(([id]) => !id.startsWith("apps/"));
		expect(appLayers.map(([id]) => id)).toEqual(["apps/cli", "apps/server", "apps/web"]);
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

	test("an app imports a package only through a subpath that exports names", () => {
		const appEdges = edges.filter(({ from }) => from.startsWith("apps/"));
		expect(privateImports(appEdges, exportsByPackage(packages))).toEqual([]);
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
