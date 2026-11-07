// The end state of the workspace migration (TASK-500): all source lives in packages/* and
// apps/*, and the old roots and the @/ alias are gone. Each check catches a legacy path coming
// back that lint cannot see, because lint only reads the folders it is given.
// Inside each area, code is grouped by behavior first, and the role folder is the last folder of
// a path (ADR 0075, docs/agents/boundaries.md).
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Read a JSON file that may carry comments and trailing commas.
 * @param name The file, relative to the repository root.
 * @returns The parsed value.
 */
function readJsonc(name: string): Record<string, unknown> {
	return Bun.JSONC.parse(fs.readFileSync(path.join(repoRoot, name), "utf8")) as Record<
		string,
		unknown
	>;
}

/**
 * The files git knows under some paths, tracked or not yet added, ignored files left out.
 * @param paths The pathspecs.
 * @returns The repository paths.
 */
function gitFiles(...paths: string[]): string[] {
	const result = Bun.spawnSync({
		cmd: ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ...paths],
		cwd: repoRoot,
	});
	expect(result.exitCode).toBe(0);
	return result.stdout.toString().split("\0").filter(Boolean);
}

describe("the workspace layout", () => {
	test("no file lives in the retired roots src/ and frontend/", () => {
		expect(gitFiles("src", "frontend")).toEqual([]);
	});

	test("the root package.json lists the workspaces and maps no # imports", () => {
		const manifest = readJsonc("package.json");
		expect(manifest["workspaces"]).toEqual(["packages/*", "apps/*"]);
		expect(manifest).not.toHaveProperty("imports");
	});

	test.each(["tsconfig.json", "tsconfig.frontend.json", "components.json"])(
		"%s keeps no @/ alias",
		(name) => {
			expect(JSON.stringify(readJsonc(name))).not.toContain('"@/');
		},
	);
});

/** The role folders of an area. A role folder is the last folder of a path and holds files only. */
const ROLES = new Set([
	"api",
	"clients",
	"components",
	"constants",
	"hooks",
	"lifecycle",
	"middleware",
	"operations",
	"processes",
	"projections",
	"protocol",
	"routes",
	"rules",
	"schemas",
	"services",
	"sockets",
	"state",
	"store",
	"wiring",
	"workers",
]);

const AREAS = new Set(["cli", "runtime", "server", "shared", "ui"]);

/**
 * The ratchet of the move to behavior first (TASK-582.03): the trees whose files still put the
 * role first. The rule skips them. Each move commit removes the trees it empties, because the
 * test fails for a listed tree that breaks the rule no more, and the last move removes the list.
 */
const ROLE_FIRST_TREES: readonly string[] = [
	"apps/workbench-example/src/server",
	"apps/workbench-example/src/ui",
	"apps/workbench-example/tests/ui",
	"packages/code-intel/src/runtime",
	"packages/code-intel/tests/runtime",
	"packages/ui-kit/src/ui",
	"packages/ui-kit/tests/ui",
];

/** A TypeScript file below an area: its tree, `<workspace>/<src|tests>/<area>`, and its folders. */
interface AreaFile {
	path: string;
	tree: string;
	tests: boolean;
	/** The folders between the area and the file. */
	folders: string[];
}

/**
 * The area file a repository path names.
 * @param file The repository path.
 * @returns The file, or undefined for a path that is not TypeScript below an area.
 */
function areaFile(file: string): AreaFile | undefined {
	const [, tree, folder, area, rest] =
		/^((?:packages|apps)\/[^/]+\/(src|tests)\/([^/]+))\/(.+\.tsx?)$/.exec(file) ?? [];
	if (tree === undefined || rest === undefined || !AREAS.has(area ?? "")) return undefined;
	return { path: file, tree, tests: folder === "tests", folders: rest.split("/").slice(0, -1) };
}

/**
 * What breaks the behavior-first rule in where a file sits.
 * @param file The area file.
 * @returns The problem, or undefined when the file sits where the rule puts it.
 */
function layoutProblem(file: AreaFile): string | undefined {
	const { folders } = file;
	if (file.tests && folders[0] === "support") return undefined;
	if (folders.some((folder) => AREAS.has(folder))) return "a folder below the area is an area name";
	const roles = folders.filter((folder) => ROLES.has(folder));
	if (roles.length !== 1) return `${roles.length} role folders`;
	if (!ROLES.has(folders.at(-1) ?? "")) return "the role folder is not the last folder";
	if (roles[0] === "api" && folders.length > 1) return "api sits below a behavior folder";
	return undefined;
}

describe("the behavior-first layout inside each area", () => {
	const files = gitFiles("packages", "apps")
		.map(areaFile)
		.filter((file) => file !== undefined);

	test("every file below an area sits in one role folder, the last folder of its path", () => {
		const ratchet = new Set(ROLE_FIRST_TREES);
		const problems = files
			.filter((file) => !ratchet.has(file.tree))
			.flatMap((file) => {
				const problem = layoutProblem(file);
				return problem === undefined ? [] : [`${file.path}: ${problem}`];
			});
		expect(problems).toEqual([]);
	});

	test("every tree of the ratchet still holds a file that puts the role first", () => {
		const moved = ROLE_FIRST_TREES.filter(
			(tree) => !files.some((file) => file.tree === tree && layoutProblem(file) !== undefined),
		);
		expect(moved).toEqual([]);
	});
});
