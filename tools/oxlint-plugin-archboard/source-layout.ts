// Facts about where a file sits in the repository: its module, its test
// owner, and what a module specifier written in it resolves to. Every rule
// that reasons about layout (docs/agents/boundaries.md) reads them from here.
import fs from "node:fs";
import path from "node:path";
// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no alias root; @/ resolves only into src/
import type { RuleContext } from "./rule-api.ts";

const ROOT_SOURCE_ENTRYPOINTS = new Set(["src/bin.ts", "src/server.ts"]);

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

interface TestOwner {
	kind: "module" | "system";
	root: string;
	moduleRoot: string | undefined;
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
 * Whether a path is a state file: `state.ts` or anything under a `state/` directory.
 * @param relativePath The path to test.
 * @returns Whether the state-files-pure rule owns the file.
 */
function isStateFile(relativePath: string): boolean {
	return (
		/(^|\/)state\/[^/]+\.[jt]sx?$/.test(relativePath) || /(^|\/)state\.[jt]sx?$/.test(relativePath)
	);
}

/**
 * Resolve a module specifier to a repository path without touching the file
 * system: `@/` aliases map into `src/`, relative specifiers resolve against
 * the importing file, and anything else is a package.
 * @param fromRelativePath The importing file's repository path.
 * @param source The specifier as written.
 * @returns The repository path, or undefined for packages and escapes above the root.
 */
function sourceToRepoPath(fromRelativePath: string, source: string): string | undefined {
	if (source.startsWith(SOURCE_ALIAS_PREFIX)) {
		const resolved = path.posix.normalize(
			path.posix.join("src", source.slice(SOURCE_ALIAS_PREFIX.length)),
		);
		return resolved === "src" || resolved.startsWith("src/") ? resolved : undefined;
	}

	if (!source.startsWith(".")) {
		return undefined;
	}

	const resolved = path.posix.normalize(
		path.posix.join(path.posix.dirname(fromRelativePath), source),
	);
	return resolved.startsWith("../") ? undefined : resolved;
}

/**
 * Drop a Vite resource query or fragment (`?raw`, `#hash`) from a specifier.
 * @param source The specifier as written.
 * @returns The specifier's path part.
 */
function stripQueryAndFragment(source: string): string {
	return source.split(/[?#]/, 1)[0] ?? "";
}

/**
 * The files a specifier may denote once TypeScript resolution rules apply:
 * extensionless directories and files, and `.js` spellings of `.ts` sources.
 * @param unresolvedPath The specifier's repository path.
 * @returns The candidate paths in resolution order.
 */
function resolutionCandidates(unresolvedPath: string): string[] {
	const extension = path.posix.extname(unresolvedPath);
	const stem = unresolvedPath.slice(0, unresolvedPath.length - extension.length);
	const candidates = [unresolvedPath];
	if (!extension) {
		candidates.push(
			`${unresolvedPath}.ts`,
			`${unresolvedPath}.tsx`,
			`${unresolvedPath}/index.ts`,
			`${unresolvedPath}/index.tsx`,
		);
	} else if (extension === ".js" || extension === ".jsx") {
		candidates.push(`${stem}.ts`, `${stem}.tsx`);
	} else if (extension === ".mjs") {
		candidates.push(`${stem}.mts`);
	} else if (extension === ".cjs") {
		candidates.push(`${stem}.cts`);
	}
	return candidates;
}

/**
 * Whether a repository path is an existing regular file.
 * @param context The rule context supplying the working directory.
 * @param candidate The repository path to test.
 * @returns Whether the file exists.
 */
function isExistingFile(context: RuleContext, candidate: string): boolean {
	try {
		return fs.statSync(path.resolve(context.cwd, candidate)).isFile();
	} catch {
		return false;
	}
}

/**
 * Resolve a specifier to the repository file it imports.
 * @param context The rule context supplying the working directory.
 * @param fromRelativePath The importing file's repository path.
 * @param source The specifier as written.
 * @returns The imported file's repository path, or undefined when it is not a local file.
 */
function resolveSourcePath(
	context: RuleContext,
	fromRelativePath: string,
	source: string,
): string | undefined {
	const unresolvedPath = sourceToRepoPath(fromRelativePath, stripQueryAndFragment(source));
	if (!unresolvedPath) {
		return undefined;
	}
	return resolutionCandidates(unresolvedPath).find((candidate) =>
		isExistingFile(context, candidate),
	);
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
 * The test owner of a file: a module's `tests/` folder or `tests/system`.
 * @param relativePath The file's repository path.
 * @returns The owner, or undefined for product source.
 */
function testOwnerAt(relativePath: string): TestOwner | undefined {
	const module = moduleAt(relativePath);
	if (module && isModuleTest(module)) {
		return {
			kind: "module",
			root: `${module.root}/tests`,
			moduleRoot: module.root,
		};
	}

	if (relativePath === "tests/system" || relativePath.startsWith("tests/system/")) {
		return { kind: "system", root: "tests/system", moduleRoot: undefined };
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

export {
	AREA_IMPORT_DENIALS,
	ROOT_SOURCE_ENTRYPOINTS,
	SOURCE_ALIAS_PREFIX,
	getRepoRelativePath,
	hasGenericBucket,
	isModuleInternal,
	isSourceFile,
	isStateFile,
	isTestFile,
	isTypedTestSource,
	moduleAt,
	resolveSourcePath,
	sameModule,
	sameTestOwner,
	testOwnerAt,
	type SourceModule,
	type TestOwner,
};
