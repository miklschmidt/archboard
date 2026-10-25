// Facts about where a file sits in the repository: its package or app, its area,
// its test owner and whether it sits in a legacy root. Every rule that reasons
// about layout (docs/agents/boundaries.md) reads them from here.
import path from "node:path";
// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no # imports; sibling imports stay relative
import type { RuleContext } from "./rule-api.ts";

/** The browser entry of the web app. It sits above `ui/` and counts as browser code. */
const BROWSER_ENTRYPOINTS = new Set([
	"apps/web/src/main.tsx",
	"apps/workbench-example/src/main.tsx",
]);

/** The thin entries of the apps: the files a process or the page starts from. */
const APP_ENTRYPOINTS = new Set([
	"apps/cli/src/bin.ts",
	"apps/server/src/server.ts",
	"apps/workbench-example/src/server.ts",
	...BROWSER_ENTRYPOINTS,
]);

/** The top-level folders that held source before the workspaces. Nothing lives there any more. */
const LEGACY_ROOTS = /^(?:src|frontend)\//;

/** The folders below `src/` of a package or an app. Each is an area with its own import directions. */
const AREAS = new Set(["cli", "runtime", "server", "shared", "ui"]);

/** A bucket names no role. A workspace has no `lib/` folder either: name the role of the folder. */
const GENERIC_BUCKET_SEGMENTS = new Set([
	"compatibility",
	"core",
	"lib",
	"migration",
	"misc",
	"utils",
]);

const AREA_IMPORT_DENIALS: Readonly<Record<string, ReadonlySet<string>>> = {
	cli: new Set(["server", "ui"]),
	runtime: new Set(["cli", "ui"]),
	server: new Set(["cli", "ui"]),
	shared: new Set(["cli", "runtime", "server", "ui"]),
	ui: new Set(["cli", "runtime", "server"]),
};

/**
 * A file of a workspace owner: `packages/<name>/(src|tests|assets)/...` or `apps/<name>/(src|tests|assets)/...`.
 * Two files belong to one owner when their `root` is equal.
 */
interface WorkspaceFile {
	kind: "package" | "app";
	name: string;
	/** `packages/<name>` or `apps/<name>`. */
	root: string;
	folder: "src" | "tests" | "assets";
	/** The path below `src/`, `tests/` or `assets/`. */
	rest: string;
	area: string | undefined;
}

interface TestOwner {
	root: string;
}

/**
 * Join a relative path with forward slashes whatever the host separator is.
 * @param from The directory the path is relative to.
 * @param to The path to express relatively.
 * @returns The forward-slash relative path.
 */
function normalizedRelativePath(from: string, to: string): string {
	return path.relative(from, to).split(path.sep).join("/");
}

/**
 * Express a path with forward slashes whatever the host separator is.
 * @param filePath The path to normalise.
 * @returns The forward-slash path.
 */
function normalizePath(filePath: string): string {
	return filePath.split(path.sep).join("/");
}

/**
 * The linted file's path relative to the lint working directory, or its
 * absolute path when it lies outside that directory.
 * @param context The rule context naming the file and working directory.
 * @returns The forward-slash path the layout rules match against.
 */
function getRepoRelativePath(context: RuleContext): string {
	const relativePath = normalizedRelativePath(context.cwd, context.filename);
	return relativePath.startsWith("..") ? normalizePath(context.filename) : relativePath;
}

/**
 * Whether a path names JavaScript-like source by extension.
 * @param relativePath The path to test.
 * @returns Whether the extension is one of the js, ts, jsx, tsx families.
 */
function isSourceFile(relativePath: string): boolean {
	return /\.[cm]?[jt]sx?$/.test(relativePath);
}

/**
 * Whether a path is a state file: `state.ts` or anything under a `state/` directory, however deep.
 * @param relativePath The path to test.
 * @returns Whether the state-files-pure rule owns the file.
 */
function isStateFile(relativePath: string): boolean {
	return (
		/(^|\/)state\/(?:.+\/)?[^/]+\.[jt]sx?$/.test(relativePath) ||
		/(^|\/)state\.[jt]sx?$/.test(relativePath)
	);
}

/**
 * The area a file sits in: the first folder below `src/`, `tests/` or `assets/`.
 * @param rest The file's path below `src/`, `tests/` or `assets/`.
 * @returns The area, or undefined for a file at the root or in a folder that is no area.
 */
function areaFolder(rest: string): string | undefined {
	const [first, second] = rest.split("/", 2);
	return first && second !== undefined && AREAS.has(first) ? first : undefined;
}

/**
 * The package or app a file belongs to: the one place that tells the two owners apart.
 * @param relativePath The file's repository path.
 * @returns The owner's file, or undefined outside `<packages|apps>/<name>/(src|tests|assets)`.
 */
function workspaceAt(relativePath: string): WorkspaceFile | undefined {
	const [, group, name, folder, rest] =
		/^(packages|apps)\/([^/]+)\/(src|tests|assets)\/(.+)$/.exec(relativePath) ?? [];
	if (!group || !name || !folder || !rest) {
		return undefined;
	}
	return workspaceFile(relativePath, { group, name, folder, rest });
}

/**
 * The record of a file that the workspace pattern matched.
 * @param relativePath The file's repository path.
 * @param parts The pattern's groups: `packages` or `apps`, the name, `src`, `tests` or `assets`, and the rest.
 * @param parts.group The folder that holds the owner.
 * @param parts.name The owner's directory name.
 * @param parts.folder `src` or `tests`.
 * @param parts.rest The file's path below that folder.
 * @returns The owner's file.
 */
function workspaceFile(
	relativePath: string,
	parts: { group: string; name: string; folder: string; rest: string },
): WorkspaceFile {
	const { group, name, folder, rest } = parts;
	return {
		kind: group === "apps" ? "app" : "package",
		name,
		root: `${group}/${name}`,
		folder: folder === "tests" ? "tests" : folder === "assets" ? "assets" : "src",
		rest,
		area: areaOfWorkspaceFile(relativePath, rest),
	};
}

/**
 * The area of a file of a package or an app. The web app's browser entry has none below
 * `src/`, and counts as browser code.
 * @param relativePath The file's repository path.
 * @param rest The file's path below `src/`, `tests/` or `assets/`.
 * @returns The area, or undefined for a file in no area.
 */
function areaOfWorkspaceFile(relativePath: string, rest: string): string | undefined {
	return BROWSER_ENTRYPOINTS.has(relativePath) ? "ui" : areaFolder(rest);
}

/**
 * Whether a path is product source: the `src/` of a package or an app.
 * @param relativePath The file's repository path.
 * @returns Whether the path is under `packages/<name>/src/` or `apps/<name>/src/`.
 */
function isProductSourcePath(relativePath: string): boolean {
	return workspaceAt(relativePath)?.folder === "src";
}

/**
 * Whether a path sits in a root that held source before the workspaces: top-level `src/` or `frontend/`.
 * @param relativePath The file's repository path.
 * @returns Whether the path is below one of them.
 */
function isLegacyRoot(relativePath: string): boolean {
	return LEGACY_ROOTS.test(relativePath);
}

/**
 * Whether a path is a thin entry: the entry of an app.
 * @param relativePath The file's repository path.
 * @returns Whether the file may hold startup wiring only.
 */
function isEntrypoint(relativePath: string): boolean {
	return APP_ENTRYPOINTS.has(relativePath);
}

/**
 * Whether a path is an app's flat file below its `src/`, which only an entry may be.
 * @param relativePath The file's repository path.
 * @returns Whether the file sits directly in `apps/<name>/src/`.
 */
function isFlatAppSource(relativePath: string): boolean {
	return /^apps\/[^/]+\/src\/[^/]+$/.test(relativePath);
}

/**
 * What is wrong with where a file of an app sits, beyond the area rules.
 * @param relativePath The file's repository path.
 * @returns "legacy-root" below an app folder other than `src/` and `tests/`, "unknown-area" for
 * a folder below an app's `src/` that is no area, and undefined when the placement is right.
 * Package folders keep their own layout, including types shared between areas and assets.
 */
function placementProblem(relativePath: string): "legacy-root" | "unknown-area" | undefined {
	const [, folder, rest] = /^apps\/[^/]+\/([^/]+)\/(.+)$/.exec(relativePath) ?? [];
	if (rest === undefined || folder === "tests") {
		return undefined;
	}
	return folder === "src" ? sourceProblem(rest) : "legacy-root";
}

/**
 * What is wrong with where a file sits below an app's `src/`.
 * @param rest The file's path below `src/`.
 * @returns "unknown-area" for a folder that is no area, and undefined otherwise.
 */
function sourceProblem(rest: string): "unknown-area" | undefined {
	const [first = ""] = rest.split("/");
	return rest.includes("/") && !AREAS.has(first) ? "unknown-area" : undefined;
}

/**
 * The area that the area rules judge a file by.
 * @param relativePath The file's repository path.
 * @returns The area of the file's package or app, or undefined for a file in no area.
 */
function areaAt(relativePath: string): string | undefined {
	return workspaceAt(relativePath)?.area;
}

/**
 * Whether Bun would discover a file as a test by its name.
 * @param relativePath The file's repository path.
 * @returns Whether the name carries a test or spec suffix.
 */
function isTestFile(relativePath: string): boolean {
	return /(^|\/)[^/]+(?:\.|_)(?:test|spec)\.[jt]sx?$/.test(relativePath);
}

/**
 * The test owner of a file: a package's or an app's `tests/` folder, or `tests/system`.
 * @param relativePath The file's repository path.
 * @returns The owner, or undefined for product source.
 */
function testOwnerAt(relativePath: string): TestOwner | undefined {
	const workspaceTests = /^(?:packages|apps)\/[^/]+\/tests(?=\/)/.exec(relativePath);
	if (workspaceTests) {
		return { root: workspaceTests[0] };
	}

	if (relativePath === "tests/system" || relativePath.startsWith("tests/system/")) {
		return { root: "tests/system" };
	}

	return undefined;
}

/**
 * Whether two files share a test owner.
 * @param left One file's owner, possibly none.
 * @param right The other file's owner, possibly none.
 * @returns Whether both name the same owner root.
 */
function sameTestOwner(left: TestOwner | undefined, right: TestOwner | undefined): boolean {
	return left?.root === right?.root;
}

/**
 * A test owner's source must be checked by one of the two TypeScript gates.
 * The root program covers all retained TS, TSX, MTS and CTS source.
 * @param relativePath The file's repository path.
 * @returns Whether the extension is one the root program compiles.
 */
function isTypedTestSource(relativePath: string): boolean {
	return /\.(?:ts|tsx|mts|cts)$/u.test(relativePath);
}

/**
 * Whether any path segment is a refused generic bucket name.
 * @param relativePath The file's repository path.
 * @returns Whether the path passes through such a segment.
 */
function hasGenericBucket(relativePath: string): boolean {
	return relativePath.split("/").some((segment) => GENERIC_BUCKET_SEGMENTS.has(segment));
}

/**
 * Whether a path is browser code that sits outside a `ui/` folder.
 * @param relativePath The file's repository path.
 * @returns Whether the path is the web app's browser entry.
 */
function isBrowserEntrypoint(relativePath: string): boolean {
	return BROWSER_ENTRYPOINTS.has(relativePath);
}

export {
	AREA_IMPORT_DENIALS,
	normalizePath,
	placementProblem,
	areaAt,
	getRepoRelativePath,
	hasGenericBucket,
	isBrowserEntrypoint,
	isEntrypoint,
	isFlatAppSource,
	isLegacyRoot,
	isProductSourcePath,
	isSourceFile,
	isStateFile,
	isTestFile,
	isTypedTestSource,
	sameTestOwner,
	testOwnerAt,
	workspaceAt,
	type TestOwner,
	type WorkspaceFile,
};
