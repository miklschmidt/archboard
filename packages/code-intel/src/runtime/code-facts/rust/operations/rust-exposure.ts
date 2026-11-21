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
//
// A type's own `impl` block can be in any file of its crate, as `impl Stage`
// in the private module file `stage/arrival.rs` is, and its methods are as
// much the type's as those its root file passes on (TASK-653.04). So an
// exposed type that holds data gains the members of each such block that its
// crate's other modules can name, `pub` or `pub(crate)`, wherever the root
// files' re-exports do not reach: the block's type is the name its file
// defines or imports (definition-site.ts). A member a narrower word opens,
// such as `pub(super)` in `arrival.rs`, is for its module's own files. A test
// file's imports are no imports of the crate's (reader.ts), so its blocks add
// nothing, and nor does a block in an inline module, whose names the file's
// imports do not reach.

import { definitionSite } from "#runtime/code-facts/operations/definition-site.ts";
import type { Definition } from "#runtime/code-facts/operations/facts.ts";
import type {
	ExposedName,
	ExposureRule,
} from "#runtime/code-facts/modules/operations/module-exposure.ts";
import {
	below,
	cratesOf,
	type Crates,
	directoryOf,
	type RustPackage,
} from "#runtime/code-facts/rust/operations/rust-crates.ts";
import type { CheckoutFiles } from "#runtime/code-facts/modules/operations/module-resolution.ts";
import type { FactsPass } from "#runtime/code-facts/services/reader.ts";

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

/** The words that open a member to every module of its crate. */
const CRATE_WIDE = new Set(["pub", "pub(crate)"]);

/** A member of an `impl` block, the type it adds to and its own name: `Stage` and `enter` of `Stage.enter`. */
interface ImplMember {
	readonly holder: string;
	readonly own: string;
	readonly definition: Definition;
}

/**
 * A member of a type's own `impl` block at the top of its file that every
 * module of its crate can name.
 * @param definition A definition of the file.
 * @returns The member, or undefined for a definition that is no such member.
 */
function implMember(definition: Definition): ImplMember | undefined {
	const [holder, own, ...deeper] = definition.symbol.split(".");
	const named = CRATE_WIDE.has(definition.visibility.replaceAll(" ", ""));
	if (holder === undefined || own === undefined || deeper.length > 0 || !named) return undefined;
	return definition.implementation === true ? undefined : { holder, own, definition };
}

/**
 * The files of the crates that define a module's exposed types, in order.
 * @param pass The pass.
 * @param checkout The checkout.
 * @param types The exposed types.
 * @returns The files.
 */
function crateFiles(
	pass: FactsPass,
	checkout: CheckoutFiles,
	types: readonly ExposedName[],
): string[] {
	const crates = cratesIn(pass, checkout);
	const roots = new Set(types.map((type) => crates.placeOf(type.path)?.root));
	return [...checkout.files]
		.filter((file) => RUST_FILE.test(file) && roots.has(crates.placeOf(file)?.root))
		.toSorted();
}

/**
 * The exposed type a name in a file is, wherever the type is defined.
 * @param pass The pass.
 * @param checkout The checkout.
 * @param file The file.
 * @param name The name, as the file spells it.
 * @param types The exposed types.
 * @returns The type, or undefined for a name that is none of them.
 */
async function exposedType(
	pass: FactsPass,
	checkout: CheckoutFiles,
	file: string,
	name: string,
	types: readonly ExposedName[],
): Promise<ExposedName | undefined> {
	const site = await definitionSite(pass, checkout, file, name);
	if (site === undefined) return undefined;
	const { path, definition } = site;
	return types.find((type) => type.path === path && type.definition.symbol === definition.symbol);
}

/**
 * The members one file's `impl` blocks add to a module's exposed types.
 * @param pass The pass.
 * @param checkout The checkout.
 * @param file The file.
 * @param exposed What the module's root files expose.
 * @returns Each member the root files do not pass on, spelled under its type
 *   and passed on by the type's file.
 */
async function fileMembers(
	pass: FactsPass,
	checkout: CheckoutFiles,
	file: string,
	exposed: readonly ExposedName[],
): Promise<ExposedName[]> {
	const facts = await pass.read(checkout, file);
	if (facts?.adapter !== "rust") return [];
	const members = facts.definitions.flatMap((definition) => {
		const reached = exposed.some(
			(name) => name.path === file && name.definition.symbol === definition.symbol,
		);
		return reached ? [] : (implMember(definition) ?? []);
	});
	const types = exposed.filter((name) => name.definition.data === true);
	const holders = new Map(
		await Promise.all(
			[...new Set(members.map((member) => member.holder))].map(
				async (holder) => [holder, await exposedType(pass, checkout, file, holder, types)] as const,
			),
		),
	);
	return members.flatMap(({ holder, own, definition }): ExposedName[] => {
		const type = holders.get(holder);
		if (type === undefined) return [];
		const symbol = `${type.definition.symbol}.${own}`;
		const name = `${type.name}.${own}`;
		return [
			{ name, path: file, definition: { ...definition, symbol }, via: [...type.via, type.path] },
		];
	});
}

/**
 * The members a module's exposed types that hold data gain in `impl` blocks
 * its root files do not pass on, wherever their crate declares them.
 * @param pass The pass.
 * @param checkout The checkout.
 * @param exposed What the root files expose.
 * @returns Each member, in the crate's file order.
 */
async function rustMembers(
	pass: FactsPass,
	checkout: CheckoutFiles,
	exposed: readonly ExposedName[],
): Promise<ExposedName[]> {
	const types = exposed.filter((name) => name.definition.data === true);
	const files = crateFiles(pass, checkout, types);
	const found = await Promise.all(files.map((file) => fileMembers(pass, checkout, file, exposed)));
	return found.flat();
}

/**
 * Rust's rule: a crate, whose `lib.rs` exposes its `pub` items and what it
 * passes on, or a module of a crate's tree, whose `mod.rs` or file beside its
 * directory does, with the members its types gain elsewhere in the crate.
 */
const RUST: ExposureRule = {
	/**
	 * Whether a file is Rust.
	 * @param file The file.
	 * @returns True when it is.
	 */
	writes: (file) => RUST_FILE.test(file),
	/**
	 * Whether a file is a crate's `lib.rs` or a module's `mod.rs`, which stand for their directory.
	 * @param name The file's name.
	 * @returns True when it is.
	 */
	entry: (name) => name === "lib.rs" || name === "mod.rs",
	rootFiles: rustRootFiles,
	members: rustMembers,
	holds: rustHolds,
};

export { RUST, RUST_FILE, cratesIn };
