// Where the imports and uses of a Rust file lead (ADR 0046, TASK-540), for
// one pass, through the crates of its checkout (rust-crates.ts).
//
// An import of a `use` leaf leads to the file of the module its path names:
// to the module itself where the leaf is a module (`use crate::paint;` brings
// in the whole of `paint.rs`, as the name `*` there), else to the file whose
// module declares the leaf, under the leaf's item path there. A glob leads to
// the module it opens, and a `mod name;` and an `extern crate` to the module
// or the crate they name.
//
// A use that no import names leads where its path leads: a path from `crate`
// or `super`, or from a child module or a crate the package depends on
// (`archboard_layout::draw`), resolves in the module tree, the file itself
// included; a path that names a whole module or crate leads to its file as
// the name `*`. A bare name that the file does not define leads to the one file a
// glob of the file opens that offers it: a module offers what it defines or
// imports, every name to the modules inside it and only what it opens with
// `pub` to any other. A name the file defines, a name the file binds in a
// narrower scope, and a member reached through a value lead nowhere here: the
// first two are the file's own reading, and only the value's type tells the
// third. Every such use is resolved, because the module tree and the manifest
// name the file; a name a glob of a crate outside the checkout brings in is
// not read.
//
// A `Cargo.toml` names the local packages its crate depends on, and that use
// leads to the directory of the dependency's library, written with a trailing
// `/`, so the build dependency reaches the part bound to the crate or to its
// sources.

import path from "node:path";
import type {
	Import,
	ImportResolver,
	ModuleReading,
	ParsedFacts,
	ReadParsed,
	ReadText,
	Reference,
	ReferenceThroughImport,
	ResolvedImport,
	Target,
} from "#runtime/operations/code-facts/facts.ts";
import type { CheckoutFiles } from "#runtime/operations/code-facts/modules/module-resolution.ts";
import type { RustUse } from "#runtime/operations/code-facts/rust/rust-scopes.ts";
import {
	type Crates,
	cratesOf,
	directoryOf,
	type Place,
	type PathTarget,
	type RustPackage,
} from "#runtime/operations/code-facts/rust/rust-crates.ts";

/** The words that start a path above the file's own names. */
const ABOVE = new Set(["crate", "super"]);

/** A module a glob of a file opens: its file, its facts, and whether its private names are the file's. */
interface Globbed {
	readonly file: string;
	readonly prefix: string;
	readonly facts: ParsedFacts;
	readonly open: boolean;
}

/** What leading one file's uses needs. */
interface FileLookup {
	readonly from: string;
	/** The names the file defines. */
	readonly own: ReadonlySet<string>;
	readonly globbed: readonly Globbed[];
}

/**
 * Whether an import is a glob, `path::*`.
 * @param found The import.
 * @returns True when it is.
 */
function isGlob(found: Import): boolean {
	return found.specifier.endsWith("::*");
}

/**
 * The path an import names: the module a glob opens, else the leaf's path.
 * @param found The import.
 * @returns The path's names.
 */
function pathOf(found: Import): string[] {
	const names = found.specifier.split("::");
	return isGlob(found) ? names.slice(0, -1) : names;
}

/**
 * Where one import leads.
 * @param crates The checkout's crates.
 * @param from The importing file.
 * @param found The import.
 * @returns The import, with its file where its path leads to one.
 */
function resolveImport(crates: Crates, from: string, found: Import): ResolvedImport {
	const target = crates.resolvePath(from, pathOf(found));
	const [name] = found.names;
	if (target === undefined || name === undefined) return found;
	const whole = target.item.length === 0;
	if (isGlob(found) && !whole) return found;
	const imported = whole ? "*" : target.item.join(".");
	return { ...found, resolved: target.file, names: [{ ...name, imported }] };
}

/**
 * Whether a module is the other or inside it, in the same crate.
 * @param outer The outer module's place.
 * @param inner The inner module's place.
 * @returns True when the outer module's private names are the inner's to use.
 */
function holds(outer: Place, inner: Place): boolean {
	return (
		outer.root === inner.root && outer.module.every((name, index) => inner.module[index] === name)
	);
}

/**
 * Whether a use is the file's own to read: it reaches through an import, is
 * no use in code, starts at a value, at a name the file binds in a narrower
 * scope, or at a name the file defines.
 * @param use The use.
 * @param lookup The file's names.
 * @returns True when it leads nowhere here.
 */
function ownUse(
	use: Reference & { readonly through?: ReferenceThroughImport },
	lookup: FileLookup,
): boolean {
	const [first = ""] = use.symbol.split(".");
	const unled = use.via !== "code" || use.through !== undefined;
	return unled || first === "" || lookup.own.has(use.symbol);
}

/**
 * Whether a first name is the file's own: bound in a narrower scope, or
 * defined by the file where it starts no path above it.
 * @param first The name.
 * @param lookup The file's names.
 * @returns True when it is.
 */
function ownName(first: string, lookup: FileLookup): boolean {
	return !ABOVE.has(first) && lookup.own.has(first);
}

/**
 * The resolver of Rust imports and uses in one checkout, for one pass.
 * @param checkout The checkout's files.
 * @param read Reads a file as text: each `Cargo.toml`.
 * @param parsed Reads the facts of another file of the checkout.
 * @returns The resolver.
 */
function createRustResolver(
	checkout: CheckoutFiles,
	read: ReadText,
	parsed: ReadParsed,
): ImportResolver {
	let known: Crates | undefined;
	/**
	 * The checkout's crates, read once in the pass.
	 * @returns Them.
	 */
	const crates = (): Crates => {
		known ??= cratesOf(checkout, read);
		return known;
	};

	/**
	 * The local package a dependency a manifest names is.
	 * @param from The manifest.
	 * @param key The dependency's key.
	 * @returns The package, or undefined for a dependency outside the checkout.
	 */
	const dependencyOf = (from: string, key: string): RustPackage | undefined => {
		const own = crates().packageOf(from);
		const dependency = own?.manifest.dependencies.find((each) => each.key === key);
		return own === undefined || dependency === undefined
			? undefined
			: crates().dependencyPackage(own, dependency);
	};

	/**
	 * Where a dependency a manifest names leads: the directory of its library.
	 * @param from The manifest.
	 * @param key The dependency's key.
	 * @returns The target, or undefined for a dependency outside the checkout.
	 */
	const dependencyTarget = (from: string, key: string): Target | undefined => {
		const target = dependencyOf(from, key);
		const directory = target?.lib === undefined ? target?.directory : directoryOf(target.lib);
		return directory === undefined || directory === ""
			? undefined
			: { path: `${directory}/`, symbol: "*" };
	};

	/**
	 * One module a glob of a file opens.
	 * @param target The module's file and inline path.
	 * @param place The globbing file's place.
	 * @returns The module, or none where its facts cannot be read.
	 */
	const globbedModule = async (target: PathTarget, place: Place): Promise<Globbed[]> => {
		const { file, item } = target;
		const other = crates().placeOf(file);
		const facts = await parsed(file);
		const open = other !== undefined && holds(other, place);
		return facts === undefined ? [] : [{ file, prefix: item.join("."), facts, open }];
	};

	/**
	 * The modules the globs of a file open, other than itself.
	 * @param from The file.
	 * @param imports Its imports.
	 * @param place Its place.
	 * @returns Each module.
	 */
	const globbedBy = async (
		from: string,
		imports: readonly Import[],
		place: Place,
	): Promise<Globbed[]> => {
		const files = imports.filter(isGlob).flatMap((found) => {
			const target = crates().resolvePath(from, pathOf(found));
			return target === undefined ? [] : [target];
		});
		const modules = await Promise.all(files.map((target) => globbedModule(target, place)));
		return modules.flat();
	};

	/**
	 * Whether a module offers a name directly or through public glob re-exports.
	 * @param module The module and its facts.
	 * @param name The requested name.
	 * @param seen The modules already visited on this path.
	 * @returns True when the name is available.
	 */
	const offers = async (
		module: Globbed,
		name: string,
		seen: ReadonlySet<string>,
	): Promise<boolean> => {
		const key = `${module.file}#${module.prefix}`;
		if (seen.has(key)) return false;
		const qualified = [module.prefix, name].filter(Boolean).join(".");
		const defined = module.facts.definitions.some(
			(each) => each.symbol === qualified && (module.open || each.exposed),
		);
		if (defined) return true;
		return offeredImports(module, qualified, new Set([...seen, key]));
	};

	/**
	 * Follow imports that a module exposes, including cycles of public globs.
	 * @param module The module.
	 * @param name Its qualified name.
	 * @param seen The modules already visited.
	 * @returns True when an import offers the name.
	 */
	const offeredImports = async (
		module: Globbed,
		name: string,
		seen: ReadonlySet<string>,
	): Promise<boolean> => {
		const imports = module.facts.imports.filter((found) => module.open || found.reexport);
		if (imports.some((found) => found.names.some((each) => each.local === name))) return true;
		const place = crates().placeOf(module.file);
		if (place === undefined) return false;
		const globs = imports.filter(
			(found) => isGlob(found) && found.names.some((each) => each.local === (module.prefix || "*")),
		);
		const modules = await globbedBy(module.file, globs, place);
		const leaf = name.slice(module.prefix === "" ? 0 : module.prefix.length + 1);
		return (await Promise.all(modules.map((each) => offers(each, leaf, seen)))).some(Boolean);
	};

	/**
	 * The one glob that offers a use's first name. Ambiguous names stay unresolved.
	 * @param use The use.
	 * @param lookup The visible modules.
	 * @returns Its target, if one module offers it.
	 */
	const globTarget = async (use: Reference, lookup: FileLookup): Promise<Target | undefined> => {
		const [first = ""] = use.symbol.split(".");
		const offered = await Promise.all(
			lookup.globbed.map(async (module) =>
				(await offers(module, first, new Set())) ? module : undefined,
			),
		);
		const [only, ...more] = offered.filter((module) => module !== undefined);
		return only === undefined || more.length > 0
			? undefined
			: { path: only.file, symbol: [only.prefix, use.symbol].filter(Boolean).join(".") };
	};

	/**
	 * Where one use that no import names leads: along its path, else through a glob.
	 * @param use The use.
	 * @param lookup The file and what its globs open.
	 * @returns The target, or undefined.
	 */
	const useTarget = async (use: Reference, lookup: FileLookup): Promise<Target | undefined> => {
		const [first = ""] = use.symbol.split(".");
		if (ownName(first, lookup)) return { path: lookup.from, symbol: use.symbol };
		const target = crates().resolvePath(lookup.from, use.symbol.split("."));
		if (target === undefined) return globTarget(use, lookup);
		const whole = target.item.length === 0;
		return { path: target.file, symbol: whole ? "*" : target.item.join(".") };
	};

	/**
	 * Where the uses of one Rust file lead that no import names.
	 * @param from The file.
	 * @param facts Its facts.
	 * @returns The target of each use.
	 */
	const fileTargets = async (from: string, facts: ParsedFacts): Promise<(Target | undefined)[]> => {
		const place = crates().placeOf(from);
		if (place === undefined) return [];
		const lookup: FileLookup = {
			from,
			own: new Set(facts.definitions.map((each) => each.symbol)),
			globbed: [],
		};
		return Promise.all(
			facts.references.map(async (use: Reference & Partial<Pick<RustUse, "local" | "globs">>) => {
				if (use.local === true || ownUse(use, lookup)) return undefined;
				const imports = (use.globs ?? []).flatMap((index) => facts.imports[index] ?? []);
				const globbed = await globbedBy(from, imports, place);
				return useTarget(use, { ...lookup, globbed });
			}),
		);
	};

	return {
		/**
		 * Where one import leads in the crates.
		 * @param from The importing file.
		 * @param found The import.
		 * @returns The import, with its file where it leads to one.
		 */
		resolve: (from, found) => resolveImport(crates(), from, found),
		/**
		 * Where the uses of one file lead that no import names.
		 * @param from The file.
		 * @param facts Its facts.
		 * @returns Its definitions and the target of each use.
		 */
		inModule: async (from, facts): Promise<ModuleReading> => {
			const targets =
				path.posix.basename(from) === "Cargo.toml"
					? facts.references.map((use) => dependencyTarget(from, use.symbol))
					: await fileTargets(from, facts);
			return { definitions: facts.definitions, targets };
		},
	};
}

export { createRustResolver };
