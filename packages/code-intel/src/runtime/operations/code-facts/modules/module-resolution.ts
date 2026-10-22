// Where a TypeScript import leads in its checkout (ADR 0046), resolved again
// on each pass, because it depends on other files: a `tsconfig.json` and the
// files that exist.
//
// A relative specifier resolves against the importing file. A `#` import uses
// the nearest package.json's imports. A workspace package uses only its declared
// public exports, found through the root manifest's workspace patterns. Both
// read string targets from the same snapshot as the source files.
// Other specifiers resolve through the `paths` of the nearest `tsconfig.json`, such
// as `@/*` to `./src/*`, and then against its `baseUrl`. A configuration's
// `extends` is followed where it names a file of the checkout; one that names
// a package is not, because a package lives in an ignored `node_modules` that
// the check never reads. What remains, such as `react` or `node:fs`, is a
// package, and resolves to no file of the checkout.
//
// A candidate resolves only to a file Git lists in the checkout, so a
// resolution never leaves the checkout and never reads an ignored file. The
// probing follows TypeScript's bundler resolution: `.js` stands for `.ts`, an
// extension can be left out, and a directory means its `index`.

import path from "node:path";

/** The extensions a specifier can leave out, in the order TypeScript tries them. */
const EXTENSIONS = [".ts", ".tsx", ".d.ts", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

/** What a written JavaScript extension can stand for. */
const WRITTEN_FOR: Readonly<Record<string, readonly string[]>> = {
	".js": [".ts", ".tsx", ".js"],
	".jsx": [".tsx", ".jsx"],
	".mjs": [".mts", ".mjs"],
	".cjs": [".cts", ".cjs"],
};

/** How deep `extends` is followed, so a cycle ends. */
const EXTENDS_DEPTH = 8;

/** One checkout's files, as the pass may read them. */
interface CheckoutFiles {
	readonly root: string;
	/** Every file Git does not ignore, relative to the root, with `/` between names. */
	readonly files: ReadonlySet<string>;
}

/** The part of a `tsconfig.json` that resolution reads, with its paths relative to the checkout. */
interface PathConfig {
	/** The directory `paths` resolve against. */
	readonly pathsBase: string;
	readonly paths: Readonly<Record<string, readonly string[]>>;
	readonly baseUrl?: string;
}

/** Reads one file of a checkout as text, or says it cannot. */
type ReadText = (relative: string) => string | undefined;

/**
 * Whether a value is a plain object.
 * @param value The value.
 * @returns True for an object that is not an array.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A `paths` value, keeping only patterns that map to strings.
 * @param value The value.
 * @returns The patterns.
 */
function pathsOf(value: unknown): Record<string, string[]> | undefined {
	if (!isRecord(value)) return undefined;
	return Object.fromEntries(
		Object.entries(value).map(([pattern, targets]) => [
			pattern,
			Array.isArray(targets) ? targets.filter((target) => typeof target === "string") : [],
		]),
	);
}

/**
 * The configurations a `tsconfig.json` extends, as checkout files.
 * @param value Its `extends`.
 * @param directory The directory of the configuration.
 * @returns Each file, relative to the checkout.
 */
function extendedFiles(value: unknown, directory: string): string[] {
	const named = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
	return named
		.filter((name): name is string => typeof name === "string" && name.startsWith("."))
		.map((name) => {
			const file = path.posix.join(directory, name);
			return file.endsWith(".json") ? file : `${file}.json`;
		});
}

/**
 * A configuration file's JSON, comments and trailing commas allowed.
 * @param file The configuration, relative to the checkout.
 * @param read Reads a file of the checkout.
 * @returns Its object, or undefined when it cannot be read or is not one.
 */
function readJsonc(file: string, read: ReadText): Record<string, unknown> | undefined {
	const text = read(file);
	if (text === undefined) return undefined;
	try {
		const parsed: unknown = Bun.JSONC.parse(text);
		return isRecord(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Lay one configuration's options over what it extends. As in TypeScript,
 * `paths` resolve against `baseUrl` where one is set, else against the
 * directory of the configuration that declares them.
 * @param options Its `compilerOptions`.
 * @param directory Its directory.
 * @param base What it extends, if anything.
 * @returns The merged configuration.
 */
function layered(
	options: Record<string, unknown>,
	directory: string,
	base: PathConfig = { pathsBase: directory, paths: {} },
): PathConfig {
	const own = pathsOf(options["paths"]);
	const baseUrl = baseUrlOf(options, directory) ?? base.baseUrl;
	const declaredAt = own === undefined ? base.pathsBase : directory;
	const paths = own ?? base.paths;
	return baseUrl === undefined
		? { pathsBase: declaredAt, paths }
		: { pathsBase: baseUrl, paths, baseUrl };
}

/**
 * The `baseUrl` a configuration sets itself, relative to the checkout.
 * @param options Its `compilerOptions`.
 * @param directory Its directory.
 * @returns The directory, or undefined when it sets none.
 */
function baseUrlOf(options: Record<string, unknown>, directory: string): string | undefined {
	const baseUrl = options["baseUrl"];
	return typeof baseUrl === "string" ? path.posix.join(directory, baseUrl) : undefined;
}

/**
 * Read one configuration file and the files it extends.
 * @param file The configuration, relative to the checkout.
 * @param read Reads a file of the checkout.
 * @param depth How many more `extends` to follow.
 * @returns What resolution reads, or undefined when the file cannot be read.
 */
function readPathConfig(file: string, read: ReadText, depth: number): PathConfig | undefined {
	const parsed = depth < 0 ? undefined : readJsonc(file, read);
	if (parsed === undefined) return undefined;
	const directory = path.posix.dirname(file);
	const base = extendedFiles(parsed["extends"], directory).reduce<PathConfig | undefined>(
		(merged, extended) => readPathConfig(extended, read, depth - 1) ?? merged,
		undefined,
	);
	const options = isRecord(parsed["compilerOptions"]) ? parsed["compilerOptions"] : {};
	return layered(options, directory, base);
}

/**
 * The checkout file a candidate path names, trying TypeScript's extensions and
 * a directory's `index`.
 * @param candidate The path, relative to the checkout.
 * @param files The checkout's files.
 * @returns The file, or undefined when none exists.
 */
function probe(candidate: string, files: ReadonlySet<string>): string | undefined {
	const normal = path.posix.normalize(candidate).replace(/^\.\//u, "");
	if (path.posix.isAbsolute(normal) || normal === ".." || normal.startsWith("../"))
		return undefined;
	const written = path.posix.extname(normal);
	const stem = normal.slice(0, normal.length - written.length);
	const tries = [
		...(WRITTEN_FOR[written] ?? []).map((extension) => `${stem}${extension}`),
		normal,
		...EXTENSIONS.map((extension) => `${normal}${extension}`),
		...EXTENSIONS.map((extension) => `${normal}/index${extension}`),
	];
	return tries.find((file) => files.has(file));
}

/**
 * The targets a `paths` pattern gives a specifier: `@/*` matches `@/a/b` with
 * `a/b` as its star.
 * @param pattern The pattern.
 * @param specifier The specifier.
 * @returns The star's text, or undefined when the pattern does not match.
 */
function starOf(pattern: string, specifier: string): string | undefined {
	const star = pattern.indexOf("*");
	if (star === -1) return pattern === specifier ? "" : undefined;
	const prefix = pattern.slice(0, star);
	const suffix = pattern.slice(star + 1);
	const fits =
		specifier.length >= prefix.length + suffix.length &&
		specifier.startsWith(prefix) &&
		specifier.endsWith(suffix);
	return fits ? specifier.slice(prefix.length, specifier.length - suffix.length) : undefined;
}

/**
 * How long a pattern's prefix is, where a pattern with no star is exact and
 * comes before every other.
 * @param pattern The pattern.
 * @returns The length of the text before its star.
 */
function prefixLength(pattern: string): number {
	const star = pattern.indexOf("*");
	return star === -1 ? Number.POSITIVE_INFINITY : star;
}

/**
 * The candidates the `paths` of a configuration give a specifier, from the
 * pattern TypeScript picks: an exact one, else the one with the longest prefix.
 * @param config The configuration.
 * @param specifier The specifier.
 * @returns Each candidate path, relative to the checkout.
 */
function pathCandidates(config: PathConfig, specifier: string): string[] {
	const matching = Object.keys(config.paths)
		.filter((pattern) => starOf(pattern, specifier) !== undefined)
		.toSorted((left, right) => prefixLength(right) - prefixLength(left));
	const pattern = matching[0];
	if (pattern === undefined) return [];
	const star = starOf(pattern, specifier) ?? "";
	return (config.paths[pattern] ?? []).map((target) =>
		path.posix.join(config.pathsBase, target.replace("*", star)),
	);
}

/** Resolves the imports of one checkout for one pass. */
interface ModuleResolver {
	/**
	 * The checkout file an import names.
	 * @param from The importing file, relative to the checkout.
	 * @param specifier What the import names.
	 * @returns The file, or undefined for a package or a file that does not exist.
	 */
	resolve(from: string, specifier: string): string | undefined;
}

/**
 * Whether a specifier names a path relative to the importing file.
 * @param specifier The specifier.
 * @returns True for `./x`, `../x`, `.` and `..`.
 */
function isRelative(specifier: string): boolean {
	return /^\.\.?(\/|$)/u.test(specifier);
}

/**
 * The configuration files that could govern a directory, nearest first.
 * @param directory The directory, relative to the checkout.
 * @param name The configuration's file name.
 * @returns Each candidate file, up to the checkout root.
 */
function configFiles(directory: string, name = "tsconfig.json"): string[] {
	const files: string[] = [];
	for (let at = directory; at !== "." && at !== ""; at = path.posix.dirname(at)) {
		files.push(`${at}/${name}`);
	}
	return [...files, name];
}

/**
 * A manifest mapping's one selected string target, exact before longest pattern.
 * A missing or blocked target never falls through to a less specific mapping.
 * @param mappings The imports or exports map.
 * @param specifier Its requested key.
 * @returns The target with its wildcard replaced, or none.
 */
function mappedTarget(mappings: unknown, specifier: string): string | undefined {
	if (!isRecord(mappings)) return undefined;
	const pattern = Object.keys(mappings)
		.filter((key) => starOf(key, specifier) !== undefined)
		.toSorted(
			(left, right) => prefixLength(right) - prefixLength(left) || right.length - left.length,
		)[0];
	if (pattern === undefined) return undefined;
	const target = mappings[pattern];
	return typeof target === "string"
		? target.replaceAll("*", starOf(pattern, specifier) ?? "")
		: undefined;
}

/**
 * A manifest's local target, refusing traversal and package redirects.
 * @param directory The manifest's directory.
 * @param target Its selected target.
 * @returns The candidate inside that package, or none.
 */
function localTarget(directory: string, target: string | undefined): string | undefined {
	if (target === undefined || !target.startsWith("./") || target.includes("\\")) return undefined;
	const segments = target.slice(2).split("/");
	if (segments.some((segment) => ["..", ".", "node_modules"].includes(segment))) return undefined;
	return path.posix.join(directory, target);
}

/**
 * Workspace manifests listed by the root's workspace array, without reading disk.
 * @param files The snapshot's files.
 * @param workspaces The root manifest's workspace patterns.
 * @returns Each workspace's package.json in a stable order.
 */
function workspaceManifests(files: ReadonlySet<string>, workspaces: unknown): string[] {
	if (!Array.isArray(workspaces)) return [];
	const patterns = workspaces
		.filter((pattern): pattern is string => typeof pattern === "string")
		.map((pattern) => new Bun.Glob(pattern.replace(/^\.\//u, "").replace(/\/$/u, "")));
	return [...files]
		.filter(
			(file) =>
				file.endsWith("/package.json") &&
				patterns.some((pattern) => pattern.match(path.posix.dirname(file))),
		)
		.toSorted();
}

/**
 * The package name at the start of a bare import, including its scope.
 * @param specifier The import.
 * @returns Its package name.
 */
function packageName(specifier: string): string {
	return specifier
		.split("/")
		.slice(0, specifier.startsWith("@") ? 2 : 1)
		.join("/");
}

/**
 * A resolver for one checkout, which reads each `tsconfig.json` once.
 * @param checkout The checkout's files.
 * @param read Reads a file of the checkout as text.
 * @returns The resolver.
 */
function createModuleResolver(checkout: CheckoutFiles, read: ReadText): ModuleResolver {
	const configs = new Map<string, PathConfig | undefined>();
	const manifests = new Map<string, Record<string, unknown> | undefined>();
	/**
	 * Read a manifest once, only when the snapshot lists it.
	 * @param file The manifest path.
	 * @returns Its fields, or none.
	 */
	const manifestOf = (file: string): Record<string, unknown> | undefined => {
		if (!checkout.files.has(file)) return undefined;
		if (!manifests.has(file)) manifests.set(file, readJsonc(file, read));
		return manifests.get(file);
	};
	const workspaces = new Map<string, string>();
	for (const file of workspaceManifests(
		checkout.files,
		manifestOf("package.json")?.["workspaces"],
	)) {
		const name = manifestOf(file)?.["name"];
		if (typeof name === "string") workspaces.set(name, file);
	}
	/**
	 * Resolve a package-local import through its nearest owner, never an ancestor's aliases.
	 * @param directory The importing directory.
	 * @param specifier The import.
	 * @returns Its candidate, or none.
	 */
	const importTarget = (directory: string, specifier: string): string | undefined => {
		const file = configFiles(directory, "package.json").find((candidate) =>
			checkout.files.has(candidate),
		);
		if (file === undefined) return undefined;
		return localTarget(
			path.posix.dirname(file),
			mappedTarget(manifestOf(file)?.["imports"], specifier),
		);
	};
	/**
	 * Resolve only a workspace package's declared public export.
	 * @param file Its manifest.
	 * @param subpath The requested export key.
	 * @returns Its candidate, or none.
	 */
	const exportTarget = (file: string, subpath: string): string | undefined => {
		const exports = manifestOf(file)?.["exports"];
		const target =
			typeof exports === "string" && subpath === "." ? exports : mappedTarget(exports, subpath);
		return localTarget(path.posix.dirname(file), target);
	};
	/**
	 * Probe a selected package target, if it exists.
	 * @param target The candidate.
	 * @returns Its listed source file, or none.
	 */
	const probeTarget = (target: string | undefined): string | undefined =>
		target === undefined ? undefined : probe(target, checkout.files);
	/**
	 * The configuration that governs a directory: the nearest `tsconfig.json`.
	 * @param directory The directory, relative to the checkout.
	 * @returns Its configuration, or undefined when none governs it.
	 */
	const configOf = (directory: string): PathConfig | undefined => {
		const file = configFiles(directory).find((candidate) => checkout.files.has(candidate));
		if (file === undefined) return undefined;
		if (!configs.has(file)) configs.set(file, readPathConfig(file, read, EXTENDS_DEPTH));
		return configs.get(file);
	};
	/**
	 * Resolve an existing tsconfig alias or baseUrl import.
	 * @param directory The importing directory.
	 * @param specifier The import.
	 * @returns Its listed source file, or none.
	 */
	const resolvePaths = (directory: string, specifier: string): string | undefined => {
		const config = configOf(directory);
		if (config === undefined) return undefined;
		const candidates = [
			...pathCandidates(config, specifier),
			...(config.baseUrl === undefined ? [] : [path.posix.join(config.baseUrl, specifier)]),
		];
		return candidates.map((candidate) => probe(candidate, checkout.files)).find(Boolean);
	};
	return {
		/**
		 * The checkout file an import names.
		 * @param from The importing file.
		 * @param specifier What the import names.
		 * @returns The file, or undefined.
		 */
		resolve(from, specifier) {
			const directory = path.posix.dirname(from);
			if (isRelative(specifier))
				return probe(path.posix.join(directory, specifier), checkout.files);
			if (specifier.startsWith("#")) return probeTarget(importTarget(directory, specifier));
			const name = packageName(specifier);
			const workspace = workspaces.get(name);
			if (workspace !== undefined) {
				const subpath = specifier === name ? "." : `.${specifier.slice(name.length)}`;
				return probeTarget(exportTarget(workspace, subpath));
			}
			return resolvePaths(directory, specifier);
		},
	};
}

export { type CheckoutFiles, type ModuleResolver, createModuleResolver, extendedFiles };
