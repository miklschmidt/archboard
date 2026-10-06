// Where a Python import leads in its checkout (ADR 0046), resolved again on
// each pass, because it depends on other files: which modules exist, and the
// project file that says where the packages live.
//
// A module is a file, `a/b.py`, or a package, `a/b/__init__.py` (or their
// `.pyi` stubs). A relative import (`.m`, `..`) resolves against the package
// of the importing file. An absolute import resolves against the roots of the
// importing file, in this order:
//
// 1. Its own root: the nearest directory above it without `__init__.py`. That
//    is where its top package sits, and where a script finds its siblings.
// 2. The source roots the nearest `pyproject.toml` or `setup.cfg` names:
//    setuptools' `package-dir` and `packages.find.where`, Poetry's `from`,
//    and the directories of Hatch's wheel `packages`.
// 3. The `src` directory of that project, and the project directory itself,
//    which setuptools, flit and hatch find with no configuration. With no
//    project file, the checkout root stands for the project.
//
// `from package import name` reaches the submodule `package/name.py` when one
// exists, and otherwise the name the package defines: a package's
// `__init__.py` usually imports its submodules, so the name and the submodule
// are one module. A module that resolves to no file of the checkout, such as
// `os` or an installed package, is a package of the environment and leads
// nowhere. A candidate resolves only to a file Git lists in the checkout.

import path from "node:path";
import type {
	Import,
	ImportResolver,
	ReadText,
	ResolvedImport,
} from "@/runtime/code-facts/lib/facts";
import type { CheckoutFiles } from "@/runtime/code-facts/lib/module-resolution";

/** What a module path can stand for, in the order Python and a type checker try them. */
const MODULE_FILES = [".py", "/__init__.py", ".pyi", "/__init__.pyi"];

/** The project files that can name source roots, nearest first in each directory. */
const PROJECT_FILES = ["pyproject.toml", "setup.cfg"];

/**
 * Whether a value is a plain object.
 * @param value The value.
 * @returns True for an object that is not an array.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The value at a path of keys in parsed configuration.
 * @param value The configuration.
 * @param keys The keys, outermost first.
 * @returns The value, or undefined where a key is missing.
 */
function at(value: unknown, ...keys: readonly string[]): unknown {
	let found = value;
	for (const key of keys) found = isRecord(found) ? found[key] : undefined;
	return found;
}

/**
 * The strings of a value that is a string or a list of them.
 * @param value The value.
 * @returns Its strings.
 */
function strings(value: unknown): string[] {
	if (typeof value === "string") return [value];
	return Array.isArray(value) ? value.filter((each) => typeof each === "string") : [];
}

/**
 * The source roots a `pyproject.toml` names, relative to its directory.
 * @param text The file's text.
 * @returns The roots.
 */
function pyprojectRoots(text: string): string[] {
	let parsed: unknown;
	try {
		parsed = Bun.TOML.parse(text);
	} catch {
		return [];
	}
	const tool = at(parsed, "tool");
	const poetry = at(tool, "poetry", "packages");
	return [
		...strings(at(tool, "setuptools", "package-dir", "")),
		...strings(at(tool, "setuptools", "packages", "find", "where")),
		...(Array.isArray(poetry) ? poetry.flatMap((each) => strings(at(each, "from"))) : []),
		...strings(at(tool, "hatch", "build", "targets", "wheel", "packages")).map((package_) =>
			path.posix.dirname(package_),
		),
	];
}

/**
 * One value of an INI file, with the indented lines that continue it.
 * @param text The file's text.
 * @param section The section.
 * @param key The key, a plain word.
 * @returns The value, or undefined when the section does not set it.
 */
function iniValue(text: string, section: string, key: string): string | undefined {
	const body = text.split(/^\[/mu).find((chunk) => chunk.startsWith(`${section}]`));
	const value = new RegExp(`^${key}\\s*[=:](.*(?:\\n[ \\t]+.*)*)`, "mu");
	return body === undefined ? undefined : value.exec(body)?.[1];
}

/**
 * The source roots a `setup.cfg` names, relative to its directory:
 * `package_dir` for the root package (`=src`) and `packages.find`'s `where`.
 * @param text The file's text.
 * @returns The roots.
 */
function setupCfgRoots(text: string): string[] {
	const packageDir = (iniValue(text, "options", "package_dir") ?? "")
		.split("\n")
		.map((line) => /^\s*=\s*(\S+)\s*$/u.exec(line)?.[1])
		.filter((root) => root !== undefined);
	const where = iniValue(text, "options.packages.find", "where")?.trim();
	return [...packageDir, ...(where === undefined || where === "" ? [] : [where])];
}

/**
 * A path relative to the checkout, with `""` for its root.
 * @param parts The parts to join.
 * @returns The path, or undefined when it leaves the checkout.
 */
function inCheckout(...parts: readonly string[]): string | undefined {
	const joined = path.posix.normalize(path.posix.join(...parts));
	if (joined === "..") return undefined;
	if (joined.startsWith("../")) return undefined;
	return joined === "." ? "" : joined.replace(/\/$/u, "");
}

/**
 * The directory of a file relative to the checkout, with `""` for its root.
 * @param file The file.
 * @returns Its directory.
 */
function directoryOf(file: string): string {
	const directory = path.posix.dirname(file);
	return directory === "." ? "" : directory;
}

/**
 * The checkout file a module path names.
 * @param module The module's path, such as `a/b`, or `""` for the root package.
 * @param files The checkout's files.
 * @returns The module's file, or undefined when none exists.
 */
function moduleFile(module: string, files: ReadonlySet<string>): string | undefined {
	const tries =
		module === ""
			? ["__init__.py", "__init__.pyi"]
			: MODULE_FILES.map((suffix) => `${module}${suffix}`);
	return tries.find((file) => files.has(file));
}

/**
 * Whether a directory is a package: it holds an `__init__.py`.
 * @param directory The directory.
 * @param files The checkout's files.
 * @returns True for a package.
 */
function isPackage(directory: string, files: ReadonlySet<string>): boolean {
	return directory !== "" && moduleFile(directory, files)?.includes("__init__.") === true;
}

/**
 * The nearest directory above a file without `__init__.py`.
 * @param file The file.
 * @param files The checkout's files.
 * @returns The directory.
 */
function ownRoot(file: string, files: ReadonlySet<string>): string {
	let directory = directoryOf(file);
	while (isPackage(directory, files)) directory = directoryOf(directory);
	return directory;
}

/**
 * The package a relative import with this many dots names.
 * @param file The importing file.
 * @param dots The number of leading dots.
 * @returns The package's directory, or undefined above the checkout's root.
 */
function relativeBase(file: string, dots: number): string | undefined {
	let directory = directoryOf(file);
	for (let up = 1; up < dots; up += 1) {
		if (directory === "") return undefined;
		directory = directoryOf(directory);
	}
	return directory;
}

/**
 * The submodule a `from module import name` names, where one exists. Such
 * an import names one name; `import module` and `from module import *` name
 * the whole module, `*`.
 * @param module The module's path.
 * @param found The import.
 * @param files The checkout's files.
 * @returns The import as the whole submodule, or undefined.
 */
function asSubmodule(
	module: string,
	found: Import,
	files: ReadonlySet<string>,
): ResolvedImport | undefined {
	const [name] = found.names;
	if (name === undefined || name.imported === "*") return undefined;
	const file = moduleFile(path.posix.join(module, ...name.imported.split(".")), files);
	return file === undefined
		? undefined
		: { ...found, names: [{ ...name, imported: "*" }], resolved: file };
}

/**
 * The module an import resolves to under one base: a name that is a
 * submodule first, then the module itself.
 * @param base The directory the module path starts from.
 * @param parts The module path's names.
 * @param found The import.
 * @param files The checkout's files.
 * @returns The resolved import, or undefined when no module exists there.
 */
function resolveUnder(
	base: string,
	parts: readonly string[],
	found: Import,
	files: ReadonlySet<string>,
): ResolvedImport | undefined {
	const module = inCheckout(base, ...parts);
	if (module === undefined) return undefined;
	const file = moduleFile(module, files);
	return (
		asSubmodule(module, found, files) ??
		(file === undefined ? undefined : { ...found, resolved: file })
	);
}

/**
 * A specifier's leading dots and the module path after them.
 * @param specifier The specifier, such as `..pkg.mod`.
 * @returns The number of dots, and the names of the path.
 */
function splitSpecifier(specifier: string): { readonly dots: number; readonly parts: string[] } {
	const dots = /^\.*/u.exec(specifier)?.[0].length ?? 0;
	const rest = specifier.slice(dots);
	return { dots, parts: rest === "" ? [] : rest.split(".") };
}

/**
 * A resolver for one checkout, which reads each project file once.
 * @param checkout The checkout's files.
 * @param read Reads a file of the checkout as text.
 * @returns The resolver.
 */
function createPythonResolver(checkout: CheckoutFiles, read: ReadText): ImportResolver {
	const { files } = checkout;
	const configured = new Map<string, string[]>();
	/**
	 * The source roots a project file names, read once in a pass.
	 * @param file The project file.
	 * @returns The roots, relative to the checkout.
	 */
	const rootsNamedIn = (file: string): string[] => {
		let roots = configured.get(file);
		if (roots === undefined) {
			const text = read(file) ?? "";
			const named = file.endsWith(".toml") ? pyprojectRoots(text) : setupCfgRoots(text);
			roots = named.flatMap((root) => inCheckout(directoryOf(file), root) ?? []);
			configured.set(file, roots);
		}
		return roots;
	};
	/**
	 * The roots an absolute import of a file resolves against, in order.
	 * @param file The importing file.
	 * @returns The roots, each once.
	 */
	const rootsOf = (file: string): string[] => {
		let project = "";
		const named: string[] = [];
		for (let directory = directoryOf(file); ; directory = directoryOf(directory)) {
			const projectFiles = PROJECT_FILES.map((name) => inCheckout(directory, name) ?? name);
			const present = projectFiles.filter((each) => files.has(each));
			if (present.length > 0) {
				project = directory;
				named.push(...present.flatMap(rootsNamedIn));
				break;
			}
			if (directory === "") break;
		}
		const conventional = [inCheckout(project, "src") ?? "src", project];
		return [...new Set([ownRoot(file, files), ...named, ...conventional])];
	};
	return {
		/**
		 * Where one import leads.
		 * @param from The importing file.
		 * @param found The import.
		 * @returns The import, with the file it resolves to where one exists.
		 */
		resolve(from, found) {
			const { dots, parts } = splitSpecifier(found.specifier);
			const bases = dots > 0 ? [relativeBase(from, dots) ?? []].flat() : rootsOf(from);
			for (const base of bases) {
				const resolved = resolveUnder(base, parts, found, files);
				if (resolved !== undefined) return resolved;
			}
			return found;
		},
	};
}

export { createPythonResolver };
