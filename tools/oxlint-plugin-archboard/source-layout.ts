// Facts about where a file sits in the repository: its module or package, its
// test owner, and what a module specifier written in it resolves to. Every rule
// that reasons about layout (docs/agents/boundaries.md) reads them from here.
import path from "node:path";
// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no alias root; @/ resolves only into src/
import type { RuleContext } from "./rule-api.ts";

/** The browser entry of the web app. It sits above `ui/` and counts as browser code. */
const BROWSER_ENTRYPOINTS = new Set(["apps/web/src/main.tsx"]);

/** The thin entries of the apps: the files a process or the page starts from. */
const APP_ENTRYPOINTS = new Set([
	"apps/cli/src/bin.ts",
	"apps/server/src/server.ts",
	...BROWSER_ENTRYPOINTS,
]);

/**
 * The prefix of the temporary root `package.json` import entry (`"#web/*": "./apps/web/src/*"`)
 * through which the root `src/` modules reach the web app while it moves (TASK-500.24).
 */
const ROOT_WEB_IMPORT_PREFIX = "#web/";

const MODULE_AREAS = new Set([
	"cli",
	"domain",
	"privileged",
	"runtime",
	"server",
	"shared",
	"transformers",
	"ui",
]);

const GENERIC_BUCKET_SEGMENTS = new Set(["compatibility", "core", "migration", "misc", "utils"]);

/** A workspace has no `lib/` folder: name the role of the folder instead. */
const WORKSPACE_BUCKET_SEGMENTS = new Set(["lib"]);

const AREA_IMPORT_DENIALS: Readonly<Record<string, ReadonlySet<string>>> = {
	cli: new Set(["privileged", "server", "ui"]),
	domain: new Set(["cli", "privileged", "runtime", "server", "transformers", "ui"]),
	privileged: new Set(["cli", "runtime", "server", "ui"]),
	runtime: new Set(["cli", "ui"]),
	server: new Set(["cli", "ui"]),
	shared: new Set(["cli", "domain", "privileged", "runtime", "server", "transformers", "ui"]),
	transformers: new Set(["cli", "privileged", "runtime", "server", "ui"]),
	ui: new Set(["cli", "privileged", "runtime", "server"]),
};

const SOURCE_ALIAS_PREFIX = "@/";

interface SourceModule {
	area: string;
	name: string;
	root: string;
	rest: string;
}

/**
 * A file of a workspace owner: `packages/<name>/(src|tests)/...` or `apps/<name>/(src|tests)/...`.
 * Two files belong to one owner when their `root` is equal.
 */
interface WorkspaceFile {
	kind: "package" | "app";
	name: string;
	/** `packages/<name>` or `apps/<name>`. */
	root: string;
	folder: "src" | "tests";
	/** The path below `src/` or `tests/`. */
	rest: string;
	area: string | undefined;
}

/** Where a file sits for the area rules: a module under `src/<area>/` or a folder of a workspace owner. */
interface AreaOwner {
	kind: "module" | "workspace";
	area: string;
	root: string;
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
 * The area a file sits in: the first folder below `src/` or `tests/`.
 * @param rest The file's path below `src/` or `tests/`.
 * @returns The area, or undefined for a file at the root or in a folder that is no area.
 */
function areaFolder(rest: string): string | undefined {
	const [first, second] = rest.split("/", 2);
	return first && second !== undefined && MODULE_AREAS.has(first) ? first : undefined;
}

/**
 * The package or app a file belongs to: the one place that tells the two owners apart.
 * @param relativePath The file's repository path.
 * @returns The owner's file, or undefined outside `<packages|apps>/<name>/(src|tests)`.
 */
function workspaceAt(relativePath: string): WorkspaceFile | undefined {
	const [, group, name, folder, rest] =
		/^(packages|apps)\/([^/]+)\/(src|tests)\/(.+)$/.exec(relativePath) ?? [];
	if (!group || !name || !folder || !rest) {
		return undefined;
	}
	return workspaceFile(relativePath, { group, name, folder, rest });
}

/**
 * The record of a file that the workspace pattern matched.
 * @param relativePath The file's repository path.
 * @param parts The pattern's groups: `packages` or `apps`, the name, `src` or `tests`, and the rest.
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
		folder: folder === "tests" ? "tests" : "src",
		rest,
		area: areaOfWorkspaceFile(relativePath, rest),
	};
}

/**
 * The area of a file of a package or an app. The web app's browser entry has none below
 * `src/`, and counts as browser code.
 * @param relativePath The file's repository path.
 * @param rest The file's path below `src/` or `tests/`.
 * @returns The area, or undefined for a file in no area.
 */
function areaOfWorkspaceFile(relativePath: string, rest: string): string | undefined {
	return BROWSER_ENTRYPOINTS.has(relativePath) ? "ui" : areaFolder(rest);
}

/**
 * Whether a path is product source: a module under `src/`, or the `src/` of a package or app.
 * @param relativePath The file's repository path.
 * @returns Whether the path is under `src/`, `packages/<name>/src/` or `apps/<name>/src/`.
 */
function isProductSourcePath(relativePath: string): boolean {
	return relativePath.startsWith("src/") || workspaceAt(relativePath)?.folder === "src";
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
 * What is wrong with where an app's file sits, beyond the area rules.
 * @param relativePath The file's repository path.
 * @returns "legacy-root" below an app folder other than `src/` and `tests/`, "unknown-area" for
 * a folder below `src/` that is no area, and undefined when the placement is right.
 */
function appPlacementProblem(relativePath: string): "legacy-root" | "unknown-area" | undefined {
	const [, folder, rest] = /^apps\/[^/]+\/([^/]+)\/(.+)$/.exec(relativePath) ?? [];
	if (folder === undefined || rest === undefined || folder === "tests") {
		return undefined;
	}
	return folder === "src" ? appSourceProblem(rest) : "legacy-root";
}

/**
 * What is wrong with where a file sits below an app's `src/`.
 * @param rest The file's path below `src/`.
 * @returns "unknown-area" for a folder that is no area, and undefined otherwise.
 */
function appSourceProblem(rest: string): "unknown-area" | undefined {
	const [first = ""] = rest.split("/");
	return rest.includes("/") && !MODULE_AREAS.has(first) ? "unknown-area" : undefined;
}

/**
 * The area and root that the area rules judge a file by.
 * @param relativePath The file's repository path.
 * @returns The owner, or undefined for a file in no area.
 */
function areaOwnerAt(relativePath: string): AreaOwner | undefined {
	const module = moduleAt(relativePath);
	if (module) {
		return { kind: "module", area: module.area, root: module.root };
	}
	const file = workspaceAt(relativePath);
	return file?.area ? { kind: "workspace", area: file.area, root: file.root } : undefined;
}

/**
 * The `src/<area>/<module>/` a file belongs to.
 * @param relativePath The file's repository path.
 * @returns The module, or undefined outside a known area.
 */
function moduleAt(relativePath: string): SourceModule | undefined {
	const match = /^src\/([^/]+)\/([^/]+)\/(.+)$/.exec(relativePath);
	const [, area, name, rest] = match ?? [];
	if (!area || !name || !rest || !MODULE_AREAS.has(area)) {
		return undefined;
	}

	return {
		area,
		name,
		root: `src/${area}/${name}`,
		rest,
	};
}

/**
 * Whether two files belong to the same module.
 * @param left One file's module, possibly none.
 * @param right The other file's module, possibly none.
 * @returns Whether both name the same module root.
 */
function sameModule(left: SourceModule | undefined, right: SourceModule | undefined): boolean {
	return left?.root === right?.root;
}

/**
 * Whether a file is private implementation below its module root.
 * @param module The file's module.
 * @returns Whether the file lives in a subfolder of the module.
 */
function isModuleInternal(module: SourceModule): boolean {
	return module.rest.includes("/");
}

/**
 * Whether a file is inside its module's `tests/` folder.
 * @param module The file's module.
 * @returns Whether the module's tests own the file.
 */
function isModuleTest(module: SourceModule): boolean {
	return module.rest === "tests" || module.rest.startsWith("tests/");
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
 * The test owner of a file: a module's, package's or app's `tests/` folder, or `tests/system`.
 * @param relativePath The file's repository path.
 * @returns The owner, or undefined for product source.
 */
function testOwnerAt(relativePath: string): TestOwner | undefined {
	const module = moduleAt(relativePath);
	if (module && isModuleTest(module)) {
		return { root: `${module.root}/tests` };
	}

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
 * Whether any path segment is a refused generic bucket name. A package or an app also
 * refuses `lib`; the modules of root `src/` still keep a `lib/` folder.
 * @param relativePath The file's repository path.
 * @returns Whether the path passes through such a segment.
 */
function hasGenericBucket(relativePath: string): boolean {
	const refused =
		workspaceAt(relativePath)?.folder === "src" ? WORKSPACE_BUCKET_SEGMENTS : undefined;
	return relativePath
		.split("/")
		.some((segment) => GENERIC_BUCKET_SEGMENTS.has(segment) || refused?.has(segment) === true);
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
	ROOT_WEB_IMPORT_PREFIX,
	SOURCE_ALIAS_PREFIX,
	normalizePath,
	appPlacementProblem,
	areaOwnerAt,
	getRepoRelativePath,
	hasGenericBucket,
	isBrowserEntrypoint,
	isEntrypoint,
	isFlatAppSource,
	isModuleInternal,
	isProductSourcePath,
	isSourceFile,
	isStateFile,
	isTestFile,
	isTypedTestSource,
	moduleAt,
	sameModule,
	sameTestOwner,
	testOwnerAt,
	workspaceAt,
	type AreaOwner,
	type SourceModule,
	type TestOwner,
	type WorkspaceFile,
};
