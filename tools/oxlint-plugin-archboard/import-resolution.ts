// How a module specifier written in a file resolves to a repository file: relative paths,
// `#` imports through the `imports` of the package or app that owns the importing file,
// `@archboard/<name>` through the `exports` of a workspace package, and `@archboard-app/<name>`
// to the app that the workspace name stands for. It reads manifests and the file system, and
// it knows nothing about which rule asks.
import fs from "node:fs";
import path from "node:path";
// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no # imports; sibling imports stay relative
import type { RuleContext } from "./rule-api.ts";
import {
	normalizePath,
	workspaceAt,
	type WorkspaceFile,
	// oxlint-disable-next-line archboard/absolute-imports -- tools/ has no # imports; sibling imports stay relative
} from "./source-layout.ts";

/** The only part of a lint context that filesystem resolution needs. */
type ImportContext = Pick<RuleContext, "cwd">;

/** `@archboard/<name>` and the subpath after it, if any. */
const PACKAGE_SPECIFIER = /^@archboard\/([^/]+)(\/.+)?$/;

/** `@archboard-app/<name>` and the subpath after it, if any: the workspace name of an app. */
const APP_SPECIFIER = /^@archboard-app\/([^/?#]+)(?:[/?#].*)?$/;

/** A specifier of a workspace package, and the repository file its `exports` map it to. */
interface PackageImport {
	/** The export subpath that the specifier asks for: `.` or `./voice`. */
	subpath: string;
	/** The repository path of the exported file, or undefined when `exports` does not name it. */
	target: string | undefined;
}

/**
 * Resolve a module specifier to a repository path without touching the file
 * system: relative specifiers resolve against the importing file, and anything
 * else is a package.
 * @param fromRelativePath The importing file's repository path.
 * @param source The specifier as written.
 * @returns The repository path, or undefined for packages and escapes above the root.
 */
function sourceToRepoPath(fromRelativePath: string, source: string): string | undefined {
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
function isExistingFile(context: ImportContext, candidate: string): boolean {
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
	context: ImportContext,
	fromRelativePath: string,
	source: string,
): string | undefined {
	const packageImport = resolvePackageSpecifier(context, source);
	if (packageImport) {
		return packageImport.target;
	}

	const unresolvedPath = source.startsWith("#")
		? resolveSubpathImport(context, fromRelativePath, source.split("?", 1)[0] ?? "")
		: sourceToRepoPath(
				fromRelativePath,
				stripQueryAndFragment(localCssSource(fromRelativePath, source)),
			);
	if (!unresolvedPath) {
		return undefined;
	}
	return existingSource(context, fromRelativePath, unresolvedPath);
}

/**
 * CSS prefers an adjacent file even when its path has no leading dot.
 * @param file The importing file's repository path.
 * @param source The written specifier.
 * @returns The relative spelling for CSS files, or the original specifier.
 */
function localCssSource(file: string, source: string): string {
	return file.endsWith(".css") && !source.startsWith("#") && !source.startsWith(".")
		? `./${source}`
		: source;
}

/**
 * Find the existing file using the importing language's extensions.
 * @param context The repository directory.
 * @param from The importing file's repository path.
 * @param target The unresolved repository path.
 * @returns The real repository path, or undefined when no candidate exists.
 */
function existingSource(context: ImportContext, from: string, target: string): string | undefined {
	const candidates = from.endsWith(".css")
		? [target, `${target}.css`]
		: resolutionCandidates(target);
	const written = candidates.find((candidate) => isExistingFile(context, candidate));
	return written && throughSymlinks(context, written);
}

/**
 * The repository path of a file with every symlink resolved, so that a path
 * through `node_modules/@archboard/<name>` names the package file it links to.
 * @param context The rule context supplying the working directory.
 * @param repoPath The existing file's repository path as written.
 * @returns The path of the real file, or the written path when the file lies outside the repository.
 */
function throughSymlinks(context: ImportContext, repoPath: string): string {
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
function packageExports(context: ImportContext, name: string): Map<string, string> | undefined {
	const declared = readManifestField(context, `packages/${name}`, "exports");
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
 * A field of the `package.json` of an owner's root.
 * @param context The rule context supplying the working directory.
 * @param ownerRoot The owner's repository path: `packages/<name>` or `apps/<name>`.
 * @param field The manifest field to read.
 * @returns The field's value (null when absent), or undefined when the owner has no manifest.
 */
function readManifestField(context: ImportContext, ownerRoot: string, field: string): unknown {
	try {
		const manifest: unknown = JSON.parse(
			fs.readFileSync(path.resolve(context.cwd, ownerRoot, "package.json"), "utf8"),
		);
		return typeof manifest === "object" && manifest !== null
			? (Reflect.get(manifest, field) ?? null)
			: null;
	} catch {
		return undefined;
	}
}

/**
 * The `imports` entries of an owner: the key and the file path it maps to.
 * @param context The rule context supplying the working directory.
 * @param ownerRoot The owner's repository path.
 * @returns The entries, none when the owner declares no `imports`.
 * @throws {Error} When an entry is anything but a file path.
 */
function subpathImports(context: ImportContext, ownerRoot: string): Array<[string, string]> {
	const declared = readManifestField(context, ownerRoot, "imports");
	if (typeof declared !== "object" || declared === null) {
		return [];
	}
	return Object.entries(declared).map(([key, target]) => {
		if (typeof target !== "string") {
			throw new Error(`${ownerRoot}/package.json: imports "${key}" must be a file path`);
		}
		return [key, target];
	});
}

/**
 * Resolve a `#` specifier through the `imports` field of the importing file's own package or app,
 * as Node, TypeScript, Bun and Vite do: the longest matching key wins, and `*` carries the rest.
 * A file in no owner (a script, a tool, a root test) has no `imports`.
 * @param context The rule context supplying the working directory.
 * @param fromRelativePath The importing file's repository path.
 * @param source The specifier as written, with its query dropped.
 * @returns The repository path the specifier names, or undefined when it names none.
 */
function resolveSubpathImport(
	context: ImportContext,
	fromRelativePath: string,
	source: string,
): string | undefined {
	const ownerRoot = workspaceAt(fromRelativePath)?.root;
	const best = ownerRoot
		? subpathImports(context, ownerRoot)
				.map(([key, target]) => ({ key, mapped: mapSubpathImport(key, target, source) }))
				.filter((entry) => entry.mapped !== undefined)
				.toSorted((left, right) => right.key.length - left.key.length)[0]
		: undefined;
	return ownerRoot && best?.mapped !== undefined
		? path.posix.join(ownerRoot, best.mapped)
		: undefined;
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
function resolvePackageSpecifier(
	context: ImportContext,
	source: string,
): PackageImport | undefined {
	const [, name, rest] = PACKAGE_SPECIFIER.exec(stripQueryAndFragment(source)) ?? [];
	const exported = name ? packageExports(context, name) : undefined;
	const subpath = rest ? `.${rest}` : ".";
	return exported ? { subpath, target: exported.get(subpath) } : undefined;
}

/**
 * Resolve `@archboard-app/<name>` and any subpath of it to the app it names. Bun links every
 * workspace into `node_modules`, so such a specifier reaches the files of the app, but an app
 * has no `exports`: no subpath of it is public.
 * @param context The rule context supplying the working directory.
 * @param source The specifier as written.
 * @returns The app's repository path (`apps/<name>`), or undefined when no such app exists.
 */
function resolveAppSpecifier(context: ImportContext, source: string): string | undefined {
	const name = APP_SPECIFIER.exec(source)?.[1];
	const root = name ? `apps/${name}` : undefined;
	return root && readManifestField(context, root, "name") !== undefined ? root : undefined;
}

/**
 * The public subpaths through which an import reaches a file of a package.
 * @param context The rule context supplying the working directory.
 * @param file The file of the package.
 * @param repoPath The file's repository path.
 * @param requested The subpath that a specifier asked for, if the import is one.
 * @returns The requested subpath, or else every subpath that exports the file. None means private.
 */
function exportedSubpaths(
	context: ImportContext,
	file: WorkspaceFile,
	repoPath: string,
	requested: string | undefined,
): string[] {
	if (requested) {
		return [requested];
	}
	const exported = file.kind === "package" ? packageExports(context, file.name) : undefined;
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

export {
	type ImportContext,
	exportedSubpaths,
	isTestingSubpath,
	resolveAppSpecifier,
	resolvePackageSpecifier,
	resolveSourcePath,
};
