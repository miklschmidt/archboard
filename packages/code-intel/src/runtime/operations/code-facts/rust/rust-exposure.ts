// What a Rust module is (ADR 0044, ADR 0046, TASK-540): a crate, whose root
// file says what it exposes, or a module of one, whose file does.
//
// A directory that is a package, or that holds its library's root file (the
// `src` of a crate), is the library: its root file `lib.rs` is the one root
// file, and it exposes its `pub` items and what its `pub use` and `pub mod`
// declarations pass on. A crate with no library exposes nothing. Any other
// directory is a module where a crate's module tree has one there: its root
// file is the directory's `mod.rs`, or the file of the same name beside it,
// `paint.rs` for `paint/`, which is then the module's own and no caller.
//
// A definition is exposed when code outside its file can name it, which
// includes `pub(crate)` and `pub(super)` (rust-definitions.ts): what a crate
// exposes to other crates is its `pub` items, so a `pub(crate)` item of
// `lib.rs` can read as exposed and unused, while a use from outside never
// reaches past the interface for it.

import {
	below,
	cratesOf,
	type Crates,
	directoryOf,
	type RustPackage,
} from "#runtime/operations/code-facts/rust/rust-crates.ts";
import type { CheckoutFiles } from "#runtime/operations/code-facts/modules/module-resolution.ts";
import type { FactsPass } from "#runtime/services/code-facts/reader.ts";

/** A Rust file. */
const RUST_FILE = /\.rs$/u;

/** The crates of each checkout a pass read, by the pass and the checkout's root. */
const CRATES = new WeakMap<FactsPass, Map<string, Crates>>();

/**
 * The crates of a checkout, read once in a pass.
 * @param pass The pass.
 * @param checkout The checkout.
 * @returns Them.
 */
function cratesIn(pass: FactsPass, checkout: CheckoutFiles): Crates {
	const byRoot = CRATES.get(pass) ?? new Map<string, Crates>();
	CRATES.set(pass, byRoot);
	let crates = byRoot.get(checkout.root);
	if (crates === undefined) {
		crates = cratesOf(checkout, (file) => pass.text(checkout, file));
		byRoot.set(checkout.root, crates);
	}
	return crates;
}

/**
 * The root file of a Rust module: a library's root file for a package or the
 * directory of that file, else the file of a module of a crate's tree.
 * @param pass The pass.
 * @param checkout The checkout.
 * @param directory The directory.
 * @returns The file; none for a directory that is no module.
 */
function rustRootFiles(
	pass: FactsPass,
	checkout: CheckoutFiles,
	directory: string,
): Promise<string[]> {
	const crates = cratesIn(pass, checkout);
	const pkg = crates.packageOf(below(directory, "Cargo.toml"));
	const files = [`${directory}/mod.rs`, `${directory}.rs`].filter(
		(file) => checkout.files.has(file) && crates.placeOf(file) !== undefined,
	);
	return Promise.resolve(libraryRoot(pkg, directory) ?? files.slice(0, 1));
}

/**
 * The library's root file where a directory is its package or holds that file.
 * @param pkg The package that holds the directory.
 * @param directory The directory.
 * @returns The file, none for a package with no library, or undefined where
 *   the directory is neither.
 */
function libraryRoot(pkg: RustPackage | undefined, directory: string): string[] | undefined {
	if (pkg === undefined) return undefined;
	if (pkg.directory === directory) return pkg.lib === undefined ? [] : [pkg.lib];
	return pkg.lib !== undefined && directoryOf(pkg.lib) === directory ? [pkg.lib] : undefined;
}

/**
 * Whether a file is a module's own: below its directory, or the file beside it.
 * @param directory The module's directory.
 * @param file A Rust file.
 * @returns True when it is.
 */
function rustHolds(directory: string, file: string): boolean {
	return directory === "" || file.startsWith(`${directory}/`) || file === `${directory}.rs`;
}

export { RUST_FILE, rustHolds, rustRootFiles };
