import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packagesRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../packages",
);

// Layers of docs/design/package-map.md. A package may import only a lower layer. The table
// lists planned packages too, so a package that lands later is already placed.
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
};

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
	/(?:\bfrom\s*|\bimport\s*\(?\s*|\bmock\.module\s*\(\s*|\bvi\.(?:mock|doMock)\s*\(\s*|\bimport\.meta\.resolve\s*\(\s*)["'](@archboard\/([a-z0-9-]+)[^"']*)["']/g;

function sourceFiles(dir: string): string[] {
	if (!fs.existsSync(dir)) return [];
	return fs
		.readdirSync(dir, { recursive: true, encoding: "utf8" })
		.filter((file) => /\.tsx?$/.test(file) && !file.split(path.sep).includes("generated"))
		.map((file) => path.join(dir, file));
}

function packageDirectories(): string[] {
	return fs
		.readdirSync(packagesRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.toSorted();
}

function readEdges(directories: string[]): Edge[] {
	const edges: Edge[] = [];
	for (const from of directories) {
		for (const area of ["src", "tests"]) {
			for (const file of sourceFiles(path.join(packagesRoot, from, area))) {
				for (const match of fs.readFileSync(file, "utf8").matchAll(SPECIFIER)) {
					const [, specifier = "", to = ""] = match;
					// An npm package in the @archboard scope is not in packages/.
					if (to !== from && directories.includes(to)) {
						edges.push({ from, to, file: path.relative(packagesRoot, file), specifier });
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

const directories = packageDirectories();
const edges = readEdges(directories);

describe("the package graph", () => {
	test("every directory under packages/ has a layer", () => {
		expect(directories.filter((name) => LAYERS[name] === undefined)).toEqual([]);
	});

	test("no package imports a package of the same or a higher layer", () => {
		expect(layerViolations(edges, LAYERS)).toEqual([]);
	});

	test("no package depends on another that depends back on it, directly or through others", () => {
		const cycle = findCycle(edges);
		expect(cycle ? cycle.join(" -> ") : undefined).toBeUndefined();
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
