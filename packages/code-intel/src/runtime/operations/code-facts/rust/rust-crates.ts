// The crates of a checkout and their module trees (ADR 0046, TASK-540), read
// from every `Cargo.toml` it holds and from where its files are.
//
// A package is the directory of a `Cargo.toml` that declares one. Its crates
// are its library (`[lib] path`, else `src/lib.rs`) and each binary, test,
// example, bench and build script, each with its root file, as Cargo finds
// them: `src/main.rs`, `src/bin/*.rs`, `tests/*.rs`, `examples/*.rs`,
// `benches/*.rs` (or `<name>/main.rs` in those directories), `[[bin]] path`
// and `build.rs`. A file is in the crate whose root's directory is the deepest
// above it, the library first, and its module is its path below that
// directory: `src/paint/slab.rs` and `src/paint/slab/mod.rs` are
// `paint::slab`. A module's file is found the same way back, so the tree
// follows the files and not the `mod` declarations: a `#[path]` attribute is
// not read, and a module only an inline `mod name { ... }` declares is an item
// path in its file.
//
// A crate depends on the local packages its manifest names by `path`, and on
// those it inherits with `workspace = true` from the `[workspace]` whose
// members hold its package. Code names such a crate by its dependency key
// where the manifest renames the package, else by the library's own name,
// with `-` as `_`; the binaries, tests and examples of a package name its
// library the same way. A dependency of the registry or of Git is outside the
// checkout.

import path from "node:path";
import {
	type CargoDependency,
	type CargoManifest,
	cargoManifest,
} from "#runtime/operations/code-facts/rust/rust-cargo.ts";
import type { ReadText } from "#runtime/operations/code-facts/facts.ts";
import type { CheckoutFiles } from "#runtime/operations/code-facts/modules/module-resolution.ts";

/** The file that declares a package or a workspace. */
const MANIFEST = "Cargo.toml";

/** The root files Cargo finds by convention, relative to the package. */
const CONVENTIONAL_ROOTS =
	/^(?:src\/main\.rs|src\/bin\/[^/]+(?:\/main)?\.rs|(?:tests|examples|benches)\/[^/]+(?:\/main)?\.rs)$/u;

/** One package of the checkout. */
interface RustPackage {
	/** Its directory, relative to the checkout; `""` for the checkout's own. */
	readonly directory: string;
	readonly manifest: CargoManifest;
	/** Its library's root file, if it has a library. */
	readonly lib: string | undefined;
	/** The name code gives its library, with `-` as `_`. */
	readonly libName: string;
	/** The root file of each of its crates, its library first. */
	readonly roots: readonly string[];
}

/** Where a path leads in the crates: the file of a module, and the item path inside it. */
interface PathTarget {
	readonly file: string;
	/** The item's names inside the file; none where the path names the module itself. */
	readonly item: readonly string[];
}

/** A file's place in its crate: the package, the crate's root file and the file's module. */
interface Place {
	readonly package: RustPackage;
	readonly root: string;
	readonly module: readonly string[];
}

/** Where a path starts: a crate's root file, a module of it, and the names after the start. */
interface Start {
	readonly root: string;
	readonly module: readonly string[];
	readonly rest: readonly string[];
}

/** The crates of one checkout, read once in a pass. */
interface Crates {
	/**
	 * The package that holds a file: the nearest above it.
	 * @param file The file, relative to the checkout.
	 */
	packageOf(file: string): RustPackage | undefined;
	/**
	 * A file's crate and module.
	 * @param file The file.
	 */
	placeOf(file: string): Place | undefined;
	/**
	 * The local package a manifest's dependency names.
	 * @param from The package that names it.
	 * @param dependency The dependency.
	 */
	dependencyPackage(from: RustPackage, dependency: CargoDependency): RustPackage | undefined;
	/**
	 * Where a path leads from a file, read from the file's module.
	 * @param from The file.
	 * @param names The path's names, from `crate`, `self`, `super` or a name in scope.
	 */
	resolvePath(from: string, names: readonly string[]): PathTarget | undefined;
}

/**
 * A path below a directory, normalized, `""` being the checkout.
 * @param directory The directory.
 * @param name The path inside it.
 * @returns The joined path.
 */
function below(directory: string, name: string): string {
	const joined = path.posix.normalize(path.posix.join(directory, name)).replace(/\/+$/u, "");
	return joined === "." ? "" : joined;
}

/**
 * The directory of a file, `""` for a file of the checkout's own directory.
 * @param file The file.
 * @returns Its directory.
 */
function directoryOf(file: string): string {
	const directory = path.posix.dirname(file);
	return directory === "." ? "" : directory;
}

/**
 * A path relative to a directory that holds it.
 * @param directory The directory, `""` being the checkout.
 * @param file The path.
 * @returns The path below the directory.
 */
function relativeTo(directory: string, file: string): string {
	return directory === "" ? file : file.slice(directory.length + 1);
}

/**
 * Whether a file is below a directory.
 * @param file The file.
 * @param directory The directory, `""` being the checkout.
 * @returns True when it is.
 */
function inside(file: string, directory: string): boolean {
	return directory === "" || file.startsWith(`${directory}/`);
}

/**
 * The root files of a package's crates other than its library, as Cargo finds them.
 * @param directory The package's directory.
 * @param manifest Its manifest.
 * @param files The checkout's files.
 * @returns The files, the declared ones first.
 */
function otherRoots(
	directory: string,
	manifest: CargoManifest,
	files: ReadonlySet<string>,
): string[] {
	const conventional = [...files]
		.filter(
			(file) => inside(file, directory) && CONVENTIONAL_ROOTS.test(relativeTo(directory, file)),
		)
		.toSorted();
	const build = manifest.build === false ? [] : [manifest.build ?? "build.rs"];
	const declared = [...manifest.bins, ...build].map((file) => below(directory, file));
	return [...declared, ...conventional].filter((file) => files.has(file));
}

/**
 * A crate name as code writes it.
 * @param name The name as the manifest writes it.
 * @returns It with `-` as `_`.
 */
function crateName(name: string): string {
	return name.replaceAll("-", "_");
}

/**
 * One package, with its crates' root files.
 * @param directory Its directory.
 * @param manifest Its manifest, which declares a package.
 * @param name The package's name.
 * @param files The checkout's files.
 * @returns The package.
 */
function packageAt(
	directory: string,
	manifest: CargoManifest,
	name: string,
	files: ReadonlySet<string>,
): RustPackage {
	const libPath = below(directory, manifest.lib.path ?? "src/lib.rs");
	const lib = files.has(libPath) ? libPath : undefined;
	const others = otherRoots(directory, manifest, files).filter((file) => file !== lib);
	const roots = [...new Set([...(lib === undefined ? [] : [lib]), ...others])];
	return { directory, manifest, lib, libName: crateName(manifest.lib.name ?? name), roots };
}

/**
 * The manifest of every directory of a checkout that has one that parses.
 * @param checkout The checkout's files.
 * @param read Reads a file of the checkout as text.
 * @returns The manifests by directory.
 */
function manifestsOf(checkout: CheckoutFiles, read: ReadText): Map<string, CargoManifest> {
	const manifests = new Map<string, CargoManifest>();
	for (const file of checkout.files) {
		if (path.posix.basename(file) !== MANIFEST) continue;
		const manifest = cargoManifest(read(file) ?? "");
		if (manifest !== undefined) manifests.set(directoryOf(file), manifest);
	}
	return manifests;
}

/**
 * The module of a file below its crate's root: its path below the root's
 * directory, without `.rs` and without a last `mod`.
 * @param root The crate's root file.
 * @param file The file.
 * @returns The module's names; none for the root itself.
 */
function moduleOf(root: string, file: string): string[] {
	if (file === root) return [];
	const names = relativeTo(directoryOf(root), file).replace(/\.rs$/u, "").split("/");
	return names.at(-1) === "mod" ? names.slice(0, -1) : names;
}

/**
 * Whether a path below a workspace matches one of its globs.
 * @param globs The globs.
 * @param relative The path, relative to the workspace.
 * @returns True when one matches.
 */
function matches(globs: readonly string[], relative: string): boolean {
	return globs.some((glob) => new Bun.Glob(glob.replace(/\/+$/u, "")).match(relative));
}

/**
 * Whether a workspace's members hold a package.
 * @param root The workspace's directory.
 * @param manifest Its manifest.
 * @param directory The package's directory.
 * @returns True when they do.
 */
function memberOf(root: string, manifest: CargoManifest, directory: string): boolean {
	const space = manifest.workspace;
	if (space === undefined || directory === root) return space !== undefined;
	const relative = relativeTo(root, directory);
	return (
		inside(directory, root) && matches(space.members, relative) && !matches(space.exclude, relative)
	);
}

/**
 * The directories from a directory up to the checkout, the directory first.
 * @param directory The directory.
 * @returns The directories.
 */
function upwards(directory: string): string[] {
	const names = directory === "" ? [] : directory.split("/");
	return [...names.map((_, index) => names.slice(0, names.length - index).join("/")), ""];
}

/**
 * The crate's root file a file is in: the file itself where it is one, else
 * the root whose directory is the deepest above it, the library first.
 * @param pkg The file's package.
 * @param file The file.
 * @returns The root file, or undefined where no crate holds the file.
 */
function rootOf(pkg: RustPackage, file: string): string | undefined {
	if (pkg.roots.includes(file)) return file;
	const holding = pkg.roots.filter((root) => inside(file, directoryOf(root)));
	return holding.reduce<string | undefined>(
		(best, root) =>
			best === undefined || directoryOf(root).length > directoryOf(best).length ? root : best,
		undefined,
	);
}

/**
 * Where a path that starts with `super` starts: as many modules above the file's.
 * @param place The file's place.
 * @param names The path's names.
 * @returns The start, or undefined where it leads above the crate.
 */
function superStart(place: Place, names: readonly string[]): Start | undefined {
	const ups = names.findIndex((name) => name !== "super");
	const count = ups === -1 ? names.length : ups;
	const module = place.module.slice(0, place.module.length - count);
	return count > place.module.length
		? undefined
		: { root: place.root, module, rest: names.slice(count) };
}

/**
 * The crates of one checkout.
 * @param checkout The checkout's files.
 * @param read Reads a file of the checkout as text.
 * @returns Them.
 */
function cratesOf(checkout: CheckoutFiles, read: ReadText): Crates {
	const manifests = manifestsOf(checkout, read);
	const packages = new Map<string, RustPackage>();
	for (const [directory, manifest] of manifests) {
		if (manifest.name !== undefined) {
			packages.set(directory, packageAt(directory, manifest, manifest.name, checkout.files));
		}
	}
	const named = new Map<string, ReadonlyMap<string, RustPackage>>();

	/**
	 * The package that holds a file.
	 * @param file The file.
	 * @returns The nearest package above it.
	 */
	const packageOf = (file: string): RustPackage | undefined =>
		upwards(directoryOf(file))
			.map((directory) => packages.get(directory))
			.find((found) => found !== undefined);

	/**
	 * The dependency a member inherits from the workspace that holds it.
	 * @param pkg The member.
	 * @param key The dependency's key.
	 * @returns The workspace's dependency, with the workspace's directory.
	 */
	const inherited = (pkg: RustPackage, key: string) => {
		const root = upwards(pkg.directory).find((directory) => {
			const manifest = manifests.get(directory);
			return manifest !== undefined && memberOf(directory, manifest, pkg.directory);
		});
		const space = root === undefined ? undefined : manifests.get(root)?.workspace;
		const dependency = space?.dependencies.find((each) => each.key === key);
		return root === undefined || dependency === undefined ? undefined : { root, dependency };
	};

	/**
	 * The dependency as its package's manifest or its workspace's spells it.
	 * @param from The package that names it.
	 * @param dependency The dependency.
	 * @returns It, with the directory its path is relative to.
	 */
	const specOf = (from: RustPackage, dependency: CargoDependency) =>
		dependency.workspace ? inherited(from, dependency.key) : { root: from.directory, dependency };

	/**
	 * The local package a dependency names.
	 * @param from The package that names it.
	 * @param dependency The dependency.
	 * @returns The package, or undefined for one outside the checkout.
	 */
	const dependencyPackage = (from: RustPackage, dependency: CargoDependency) => {
		const spec = specOf(from, dependency);
		const at = spec?.dependency.path;
		return spec === undefined || at === undefined ? undefined : packages.get(below(spec.root, at));
	};

	/**
	 * Each name a package's code gives a local crate it depends on, read once.
	 * @param pkg The package.
	 * @returns The packages by name.
	 */
	const dependenciesOf = (pkg: RustPackage): ReadonlyMap<string, RustPackage> => {
		const known = named.get(pkg.directory);
		if (known !== undefined) return known;
		const byName = new Map<string, RustPackage>();
		for (const dependency of pkg.manifest.dependencies) {
			const target = dependencyPackage(pkg, dependency);
			const renamed = specOf(pkg, dependency)?.dependency.package !== undefined;
			if (target !== undefined)
				byName.set(renamed ? crateName(dependency.key) : target.libName, target);
		}
		named.set(pkg.directory, byName);
		return byName;
	};

	/**
	 * A file's crate and module.
	 * @param file The file.
	 * @returns Its place, or undefined for a file no crate holds.
	 */
	const placeOf = (file: string): Place | undefined => {
		const pkg = packageOf(file);
		const root = pkg === undefined ? undefined : rootOf(pkg, file);
		return pkg === undefined || root === undefined
			? undefined
			: { package: pkg, root, module: moduleOf(root, file) };
	};

	/**
	 * The file of a module of a crate.
	 * @param root The crate's root file.
	 * @param module The module's names.
	 * @returns The file, or undefined where none is in the checkout.
	 */
	const moduleFile = (root: string, module: readonly string[]): string | undefined => {
		if (module.length === 0) return root;
		const base = below(directoryOf(root), module.join("/"));
		return [`${base}.rs`, `${base}/mod.rs`].find((file) => checkout.files.has(file));
	};

	/**
	 * Where a path starts that names no module of its own: a child module of
	 * the file's module, else a crate the package depends on or its own library.
	 * @param place The file's place.
	 * @param names The path's names.
	 * @returns The start, or undefined where the first name is neither.
	 */
	const nameStart = (place: Place, names: readonly string[]): Start | undefined => {
		const [head = "", ...rest] = names;
		if (moduleFile(place.root, [...place.module, head]) !== undefined) {
			return { root: place.root, module: place.module, rest: names };
		}
		const lib = crateLib(place, head);
		return lib === undefined ? undefined : { root: lib, module: [], rest };
	};

	/**
	 * The root file of the library a name names from a file: a crate the
	 * package depends on, or the package's own library from its other crates.
	 * @param place The file's place.
	 * @param head The name.
	 * @returns The library's root file, or undefined where the name names none.
	 */
	const crateLib = (place: Place, head: string): string | undefined => {
		const own = place.root !== place.package.lib && head === place.package.libName;
		return (own ? place.package : dependenciesOf(place.package).get(head))?.lib;
	};

	/**
	 * Where a path starts.
	 * @param place The file's place.
	 * @param names The path's names.
	 * @returns The start, or undefined where it leads above the crate or out of the checkout.
	 */
	const startOf = (place: Place, names: readonly string[]): Start | undefined => {
		const [head = ""] = names;
		if (head === "crate") return { root: place.root, module: [], rest: names.slice(1) };
		if (head === "self") return { root: place.root, module: place.module, rest: names.slice(1) };
		return head === "super" ? superStart(place, names) : nameStart(place, names);
	};

	/**
	 * Follow a path's names down a crate's modules, as far as a file holds them.
	 * @param start Where the path starts.
	 * @returns The deepest module's file, and the names after it.
	 */
	const walk = (start: Start): PathTarget | undefined => {
		const module = [...start.module];
		let index = 0;
		for (const name of start.rest) {
			if (moduleFile(start.root, [...module, name]) === undefined) break;
			module.push(name);
			index += 1;
		}
		const file = moduleFile(start.root, module);
		return file === undefined ? undefined : { file, item: start.rest.slice(index) };
	};

	return {
		packageOf,
		placeOf,
		dependencyPackage,
		/**
		 * Where a path leads from a file.
		 * @param from The file.
		 * @param names The path's names.
		 * @returns The module's file and the item path in it, or undefined.
		 */
		resolvePath: (from, names) => {
			const place = placeOf(from);
			const start = place === undefined ? undefined : startOf(place, names);
			return start === undefined ? undefined : walk(start);
		},
	};
}

export { below, type Crates, type PathTarget, type Place, type RustPackage, cratesOf, directoryOf };
