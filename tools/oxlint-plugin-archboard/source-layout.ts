// Facts about where a file sits in the repository: its module or package, its
// test owner, and what a module specifier written in it resolves to. Every rule
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

/** `@archboard/<name>` and the subpath after it, if any. */
const PACKAGE_SPECIFIER = /^@archboard\/([^/]+)(\/.+)?$/;

interface SourceModule {
	area: string;
	name: string;
	root: string;
	rest: string;
}

/** A file of a workspace package: `packages/<name>/src/...` or `packages/<name>/tests/...`. */
interface PackageFile {
	name: string;
	root: string;
	area: string | undefined;
}

/** Where a file sits for the area rules: a module under `src/<area>/` or a folder of a package. */
interface AreaOwner {
	kind: "module" | "package";
	area: string;
	root: string;
}

interface TestOwner {
	root: string;
}

/** A specifier of a workspace package, and the repository file its `exports` map it to. */
interface PackageImport {
	/** The export subpath that the specifier asks for: `.` or `./voice`. */
	subpath: string;
	/** The repository path of the exported file, or undefined when `exports` does not name it. */
	target: string | undefined;
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
	const packageImport = resolvePackageSpecifier(context, source);
	if (packageImport) {
		return packageImport.target;
	}
	const unresolvedPath = source.startsWith("#")
		? resolveSubpathImport(context, fromRelativePath, source.split("?", 1)[0] ?? "")
		: sourceToRepoPath(fromRelativePath, stripQueryAndFragment(source));
	if (!unresolvedPath) {
		return undefined;
	}
	const written = resolutionCandidates(unresolvedPath).find((candidate) =>
		isExistingFile(context, candidate),
	);
	return written && throughSymlinks(context, written);
}

/**
 * The repository path of a file with every symlink resolved, so that a path
 * through `node_modules/@archboard/<name>` names the package file it links to.
 * @param context The rule context supplying the working directory.
 * @param repoPath The existing file's repository path as written.
 * @returns The path of the real file, or the written path when the file lies outside the repository.
 */
function throughSymlinks(context: RuleContext, repoPath: string): string {
	const real = path.relative(
		fs.realpathSync(context.cwd),
		fs.realpathSync(path.resolve(context.cwd, repoPath)),
	);
	return real.startsWith("..") ? repoPath : normalizePath(real);
}

/**
 * What a workspace package's `package.json` exports: each public subpath and
 * the repository file it names. A package is a directory under `packages/`, so
 * an `@archboard/` name with no such directory (an npm dependency) is not one.
 * @param context The rule context supplying the working directory.
 * @param name The package's name without the scope.
 * @returns Subpath to repository path, or undefined when no such package exists.
 * @throws {Error} When `exports` holds anything but file paths: a package has no build step.
 */
function packageExports(context: RuleContext, name: string): Map<string, string> | undefined {
	const declared = readManifestField(context, name, "exports");
	if (declared === undefined) {
		return undefined;
	}
	const entries = typeof declared === "object" && declared !== null ? Object.entries(declared) : [];
	return new Map(
		entries.map(([subpath, file]) => {
			if (typeof file !== "string") {
				throw new Error(`packages/${name}/package.json: exports "${subpath}" must be a file path`);
			}
			return [subpath, path.posix.join("packages", name, file)];
		}),
	);
}

/**
 * A field of a workspace package's manifest.
 * @param context The rule context supplying the working directory.
 * @param name The package's name without the scope.
 * @param field The manifest field to read.
 * @returns The field's value (null when absent), or undefined when no such package exists.
 */
function readManifestField(context: RuleContext, name: string, field: string): unknown {
	try {
		const manifest: unknown = JSON.parse(
			fs.readFileSync(path.resolve(context.cwd, "packages", name, "package.json"), "utf8"),
		);
		return typeof manifest === "object" && manifest !== null
			? (Reflect.get(manifest, field) ?? null)
			: null;
	} catch {
		return undefined;
	}
}

/**
 * The `imports` entries of a package: the key and the file path it maps to.
 * @param context The rule context supplying the working directory.
 * @param own The package.
 * @returns The entries, none when the package declares no `imports`.
 * @throws {Error} When an entry is anything but a file path.
 */
function subpathImports(context: RuleContext, own: PackageFile): Array<[string, string]> {
	const declared = readManifestField(context, own.name, "imports");
	if (typeof declared !== "object" || declared === null) {
		return [];
	}
	return Object.entries(declared).map(([key, target]) => {
		if (typeof target !== "string") {
			throw new Error(`${own.root}/package.json: imports "${key}" must be a file path`);
		}
		return [key, target];
	});
}

/**
 * Resolve a `#` specifier through the `imports` field of the importing file's own package,
 * as Node, TypeScript, Bun and Vite do: the longest matching key wins, and `*` carries the rest.
 * @param context The rule context supplying the working directory.
 * @param fromRelativePath The importing file's repository path.
 * @param source The specifier as written, with its query dropped.
 * @returns The repository path the specifier names, or undefined when it names none.
 */
function resolveSubpathImport(
	context: RuleContext,
	fromRelativePath: string,
	source: string,
): string | undefined {
	const own = packageAt(fromRelativePath);
	const best = own
		? subpathImports(context, own)
				.map(([key, target]) => ({ key, mapped: mapSubpathImport(key, target, source) }))
				.filter((entry) => entry.mapped !== undefined)
				.toSorted((left, right) => right.key.length - left.key.length)[0]
		: undefined;
	return own && best?.mapped !== undefined ? path.posix.join(own.root, best.mapped) : undefined;
}

/**
 * Apply one `imports` entry to a specifier.
 * @param key The entry's key, with at most one `*`.
 * @param target The entry's target, which repeats the `*`.
 * @param source The specifier as written.
 * @returns The mapped target, or undefined when the key does not match.
 */
function mapSubpathImport(key: string, target: string, source: string): string | undefined {
	const star = key.indexOf("*");
	if (star === -1) {
		return source === key ? target : undefined;
	}
	const head = key.slice(0, star);
	const tail = key.slice(star + 1);
	const fits = source.length >= head.length + tail.length;
	return fits && source.startsWith(head) && source.endsWith(tail)
		? target.replace("*", source.slice(head.length, source.length - tail.length))
		: undefined;
}

/**
 * Resolve `@archboard/<name>[/subpath]` through the package's `exports`.
 * @param context The rule context supplying the working directory.
 * @param source The specifier as written.
 * @returns The exported file, or undefined when the specifier names no workspace package.
 */
function resolvePackageSpecifier(context: RuleContext, source: string): PackageImport | undefined {
	const [, name, rest] = PACKAGE_SPECIFIER.exec(stripQueryAndFragment(source)) ?? [];
	const exported = name ? packageExports(context, name) : undefined;
	const subpath = rest ? `.${rest}` : ".";
	return exported ? { subpath, target: exported.get(subpath) } : undefined;
}

/**
 * The public subpaths through which an import reaches a package file.
 * @param context The rule context supplying the working directory.
 * @param file The file of the package.
 * @param repoPath The file's repository path.
 * @param requested The subpath that a specifier asked for, if the import is one.
 * @returns The requested subpath, or else every subpath that exports the file. None means private.
 */
function exportedSubpaths(
	context: RuleContext,
	file: PackageFile,
	repoPath: string,
	requested: string | undefined,
): string[] {
	if (requested) {
		return [requested];
	}
	const exported = packageExports(context, file.name);
	return [...(exported ?? [])]
		.filter(([, target]) => target === repoPath)
		.map(([subpath]) => subpath);
}

/**
 * Whether an export subpath is test support, which production code never imports.
 * @param subpath The subpath of a package export.
 * @returns Whether it is `./testing` or below it.
 */
function isTestingSubpath(subpath: string): boolean {
	return subpath === "./testing" || subpath.startsWith("./testing/");
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
 * The package a file belongs to.
 * @param relativePath The file's repository path.
 * @returns The package, or undefined outside `packages/<name>/src` and `packages/<name>/tests`.
 */
function packageAt(relativePath: string): PackageFile | undefined {
	const [, name, folder, rest] = /^packages\/([^/]+)\/(src|tests)\/(.+)$/.exec(relativePath) ?? [];
	if (!name || !folder || !rest) {
		return undefined;
	}
	return { name, root: `packages/${name}`, area: areaFolder(rest) };
}

/**
 * Whether a path is product source: a module under `src/` or a package's `src/`.
 * @param relativePath The file's repository path.
 * @returns Whether the path is under `src/` or `packages/<name>/src/`.
 */
function isProductSourcePath(relativePath: string): boolean {
	return relativePath.startsWith("src/") || /^packages\/[^/]+\/src\//.test(relativePath);
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
	const file = packageAt(relativePath);
	return file?.area ? { kind: "package", area: file.area, root: file.root } : undefined;
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
 * The test owner of a file: a module's or package's `tests/` folder, or `tests/system`.
 * @param relativePath The file's repository path.
 * @returns The owner, or undefined for product source.
 */
function testOwnerAt(relativePath: string): TestOwner | undefined {
	const module = moduleAt(relativePath);
	if (module && isModuleTest(module)) {
		return { root: `${module.root}/tests` };
	}

	const packageTests = /^packages\/[^/]+\/tests(?=\/)/.exec(relativePath);
	if (packageTests) {
		return { root: packageTests[0] };
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

export {
	AREA_IMPORT_DENIALS,
	ROOT_SOURCE_ENTRYPOINTS,
	SOURCE_ALIAS_PREFIX,
	areaOwnerAt,
	exportedSubpaths,
	getRepoRelativePath,
	hasGenericBucket,
	isModuleInternal,
	isProductSourcePath,
	isSourceFile,
	isStateFile,
	isTestFile,
	isTestingSubpath,
	isTypedTestSource,
	moduleAt,
	packageAt,
	resolvePackageSpecifier,
	resolveSourcePath,
	sameModule,
	sameTestOwner,
	testOwnerAt,
	type AreaOwner,
	type PackageFile,
	type SourceModule,
	type TestOwner,
};
