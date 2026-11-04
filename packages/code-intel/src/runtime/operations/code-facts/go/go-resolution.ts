// Where the uses of a Go file lead (ADR 0046, TASK-575), for one pass.
//
// A Go package is the `.go` files directly in one directory that share a
// package clause. Its tests (`_test.go`) see the package's names, and no
// other file sees theirs. A test file whose clause is `<name>_test` is a
// package of its own, which imports the package it tests.
//
// An import path names a package below a module: the module path that a
// `go.mod` declares, and the directory below that file. Every `go.mod` of the
// checkout counts, so a module that a `go.work` uses, or that a `replace`
// leads to a local directory, resolves without reading either file: its own
// `go.mod` declares its path. The longest module path that the import path
// starts with decides. A module path that two `go.mod` files declare resolves
// to the module of the importing file, else to none. A `go.mod` under
// `vendor`, `testdata`, or a directory whose name starts with `.` or `_` is no
// module, because the go command ignores those directories. An import that
// leads to no directory of the checkout, such as the standard library or a
// module the checkout does not hold, leads nowhere.
//
// The files of one package see each other's names with no import, and an
// import brings in what another package exports. So a use leads to the one
// other file of its package that defines its spelling (the longest of its
// names that one does, `Ledger.Post` before `Ledger`), else, where it starts
// with an import's name, to the one file of that package that defines and
// exports the rest (`ledger.New`). An import with no name of its own is named
// by the package clause of the package it leads to. The names a dot import
// (`.`) brings in unqualified lead nowhere. A name the file defines itself
// stays the file's own. A name that two files define, as two files with other
// build constraints can, is not resolved. A use whose first name the file
// binds in a narrower scope (a parameter, a receiver, a local) may be that
// binding, and leads nowhere. A definition in a part of a file that did not
// parse is found in no other file.
//
// An import of a package of the checkout leads to the package's directory,
// written with a trailing `/`, so the build dependency reaches the part bound
// to that directory. A module that a `go.mod` requires leads to the module's
// directory the same way (go-mod.ts).

import path from "node:path";
import type {
	Definition,
	ImportResolver,
	ModuleReading,
	ParsedFacts,
	ReadParsed,
	ReadText,
	Reference,
	Target,
} from "#runtime/operations/code-facts/facts.ts";
import {
	type GoFacts,
	type GoImport,
	isGoFacts,
} from "#runtime/operations/code-facts/go/go-adapter.ts";
import type { CheckoutFiles } from "#runtime/operations/code-facts/modules/module-resolution.ts";

/** A Go file. */
const GO_FILE = /\.go$/u;
/** A file of tests. */
const TEST_FILE = /_test\.go$/u;
/** A directory the go command ignores: no package or module is in it. */
const IGNORED = /(?:^|\/)(?:vendor|testdata|[._][^/]*)\//u;
/** The module directive of a `go.mod`. */
const MODULE_DIRECTIVE = /^\s*module\s+"?([^\s"/][^\s"]*)"?\s*(?:\/\/.*)?$/mu;

/** Each module path of the checkout, and the directories whose `go.mod` declares it. */
type Modules = ReadonlyMap<string, readonly string[]>;

/** Each name some files of a package define, and those files. */
type PackageIndex = ReadonlyMap<string, ReadonlySet<string>>;

/** One package of the checkout: its directory, its name and its files with their facts. */
interface GoPackage {
	readonly directory: string;
	readonly name: string;
	readonly files: ReadonlyMap<string, GoFacts>;
}

/** Reads the package of a directory: by its clause, or the clause of its files that are not tests. */
type PackageIn = (directory: string, name?: string) => Promise<GoPackage | undefined>;

/**
 * The directory of a file, `""` being the checkout.
 * @param file The file.
 * @returns Its directory.
 */
function directoryOf(file: string): string {
	const directory = path.posix.dirname(file);
	return directory === "." ? "" : directory;
}

/**
 * Whether a file is a `go.mod` the go command reads.
 * @param file The file.
 * @returns True when it is.
 */
function declaresModule(file: string): boolean {
	return path.posix.basename(file) === "go.mod" && !IGNORED.test(file);
}

/**
 * The module path of every `go.mod` of the checkout, with the directories
 * that declare it.
 * @param files The checkout's files.
 * @param read Reads a file as text.
 * @returns Each module path and its directories.
 */
function modulesOf(files: ReadonlySet<string>, read: ReadText): Modules {
	const modules = new Map<string, string[]>();
	for (const file of [...files].filter(declaresModule).toSorted()) {
		const declared = MODULE_DIRECTIVE.exec(read(file) ?? "")?.[1];
		if (declared !== undefined)
			modules.set(declared, [...(modules.get(declared) ?? []), directoryOf(file)]);
	}
	return modules;
}

/**
 * Whether a file is in a directory or below it.
 * @param file The file.
 * @param directory The directory.
 * @returns True when it is.
 */
function inside(file: string, directory: string): boolean {
	return directory === "" || file.startsWith(`${directory}/`);
}

/**
 * The longest module path that an import path starts with.
 * @param specifier The import path.
 * @param modules The checkout's modules.
 * @returns The module path, or undefined where none holds the import path.
 */
function longestModule(specifier: string, modules: Modules): string | undefined {
	return [...modules.keys()]
		.filter((module) => specifier === module || specifier.startsWith(`${module}/`))
		.toSorted((left, right) => right.length - left.length)[0];
}

/**
 * The directory an import path leads to in the checkout.
 * @param specifier The import path.
 * @param from The importing file, whose module decides between two that declare one path.
 * @param modules The checkout's modules.
 * @returns The directory, or undefined where no module of the checkout holds the path.
 */
function directoryOfImport(specifier: string, from: string, modules: Modules): string | undefined {
	const module = longestModule(specifier, modules);
	const roots = module === undefined ? [] : (modules.get(module) ?? []);
	const root = roots.length === 1 ? roots[0] : roots.find((each) => inside(from, each));
	if (module === undefined || root === undefined) return undefined;
	const rest = specifier.slice(module.length + 1);
	return path.posix.join(root, rest).replace(/^\.$/u, "").replace(/\/$/u, "");
}

/**
 * The target of a use of a package or module: its directory, with a trailing `/`.
 * @param directory The directory, if the checkout holds it.
 * @param except A directory the use cannot lead to: the user's own.
 * @returns The target; none for the checkout, which every part holds.
 */
function directoryTarget(directory: string | undefined, except?: string): Target | undefined {
	return directory === undefined || directory === "" || directory === except
		? undefined
		: { path: `${directory}/`, symbol: "*" };
}

/**
 * The definitions of a file that other files can use: none in the part that
 * did not parse, and only exported ones for another package.
 * @param facts The file's facts.
 * @param exportedOnly Whether the other files are in another package.
 * @returns The definitions.
 */
function offered(facts: ParsedFacts, exportedOnly: boolean): Definition[] {
	return facts.definitions.filter(
		(each) =>
			(!exportedOnly || each.exposed) &&
			!facts.unparsed.some((part) => part.start <= each.start && each.start <= part.end),
	);
}

/**
 * The names the files of a package define for one file to use.
 * @param pkg The package.
 * @param exportedOnly Whether only names another package can use count.
 * @param tests Whether the package's tests count, as they do for one of its tests.
 * @returns Each name and the files that define it.
 */
function indexOf(pkg: GoPackage, exportedOnly: boolean, tests: boolean): PackageIndex {
	const index = new Map<string, Set<string>>();
	for (const [file, facts] of pkg.files) {
		if (!tests && TEST_FILE.test(file)) continue;
		for (const { symbol } of offered(facts, exportedOnly)) {
			index.set(symbol, new Set([...(index.get(symbol) ?? []), file]));
		}
	}
	return index;
}

/**
 * The Go files directly in a directory, with their facts.
 * @param checkout The checkout's files.
 * @param parsed Reads a file's facts.
 * @param directory The directory.
 * @returns Each file and its facts.
 */
async function factsIn(
	checkout: CheckoutFiles,
	parsed: ReadParsed,
	directory: string,
): Promise<Map<string, GoFacts>> {
	const files = [...checkout.files]
		.filter((file) => GO_FILE.test(file) && directoryOf(file) === directory)
		.toSorted();
	const read = new Map<string, GoFacts>();
	for (const file of files) {
		// oxlint-disable-next-line no-await-in-loop -- one file at a time, through the pass's queue of parses
		const facts = await parsed(file);
		if (isGoFacts(facts)) read.set(file, facts);
	}
	return read;
}

/**
 * The package of a directory's files that a clause names.
 * @param directory The directory.
 * @param files Its Go files.
 * @param name The clause; without it, the clause of its first file that is no test.
 * @returns The package, or undefined where no file has the clause.
 */
function packageNamed(
	directory: string,
	files: ReadonlyMap<string, GoFacts>,
	name?: string,
): GoPackage | undefined {
	const chosen = name ?? [...files].find(([file]) => !TEST_FILE.test(file))?.[1].package;
	const own = [...files].filter(([, facts]) => facts.package === chosen);
	return chosen === undefined || own.length === 0
		? undefined
		: { directory, name: chosen, files: new Map(own) };
}

/**
 * The name a file uses for the package an import leads to: the import's own
 * name, else the package's clause.
 * @param found The import.
 * @param pkg The package.
 * @returns The name; none for a blank or a dot import.
 */
function importedName(found: GoImport, pkg: GoPackage): string | undefined {
	const local = found.names[0]?.local;
	if (local === undefined || local === ".") return undefined;
	return found.alias ?? pkg.name;
}

/** What the imports of one file reach. */
interface Imported {
	/** What each imported package exports, by the name the file uses for it. */
	readonly names: ReadonlyMap<string, PackageIndex>;
	/** The directory of each import path that leads into the checkout. */
	readonly directories: ReadonlyMap<string, string>;
}

/**
 * The packages of the checkout a file imports.
 * @param from The file.
 * @param facts Its facts.
 * @param modules The checkout's modules.
 * @param packageIn Reads the package of a directory.
 * @returns What its imports reach.
 */
async function importsOf(
	from: string,
	facts: GoFacts,
	modules: Modules,
	packageIn: PackageIn,
): Promise<Imported> {
	const names = new Map<string, PackageIndex>();
	const directories = new Map<string, string>();
	for (const found of facts.imports) {
		const directory = directoryOfImport(found.specifier, from, modules);
		// oxlint-disable-next-line no-await-in-loop -- the file's imports, one at a time, through the pass's queue of parses
		const pkg = directory === undefined ? undefined : await packageIn(directory);
		if (directory === undefined || pkg === undefined) continue;
		directories.set(found.specifier, directory);
		const name = importedName(found, pkg);
		if (name !== undefined) names.set(name, indexOf(pkg, true, false));
	}
	return { names, directories };
}

/** What finding where a file's names lead needs. */
interface NameLookup {
	/** Every name the file defines itself. */
	readonly own: ReadonlySet<string>;
	/** The names the file binds in a scope narrower than the file. */
	readonly scoped: ReadonlySet<string>;
	/** The names of the file's package. */
	readonly package: readonly PackageIndex[];
	readonly imported: Imported;
}

/**
 * Where a spelling leads among indexed files: the longest of its names that
 * a file defines, unless the asking file defines it or several files do.
 * @param names The spelling's names.
 * @param own The names the asking file defines.
 * @param indexes The packages to look in.
 * @returns The target, or undefined.
 */
function spelledTarget(
	names: readonly string[],
	own: ReadonlySet<string>,
	indexes: readonly PackageIndex[],
): Target | undefined {
	for (let count = names.length; count > 0; count -= 1) {
		const symbol = names.slice(0, count).join(".");
		if (own.has(symbol)) return undefined;
		const files = indexes.map((index) => index.get(symbol)).find((each) => each !== undefined);
		if (files === undefined) continue;
		const [file, ...more] = files;
		return file === undefined || more.length > 0 ? undefined : { path: file, symbol };
	}
	return undefined;
}

/**
 * Where one use of a name leads: through the import whose name it starts
 * with, else in the file's package.
 * @param symbol The use's spelling.
 * @param lookup The asking file, its package and its imports.
 * @returns The target, or undefined.
 */
function nameTarget(symbol: string, lookup: NameLookup): Target | undefined {
	const [first = "", ...rest] = symbol.split(".");
	if (lookup.scoped.has(first)) return undefined;
	const qualified = lookup.imported.names.get(first);
	if (qualified !== undefined) return spelledTarget(rest, new Set(), [qualified]);
	return spelledTarget([first, ...rest], lookup.own, lookup.package);
}

/**
 * Where one use of a Go file leads.
 * @param use The use.
 * @param lookup The file, its package and its imports.
 * @returns The target, or undefined.
 */
function useTarget(use: Reference, lookup: NameLookup): Target | undefined {
	if (use.via !== "code") return undefined;
	return use.kind === "build-dependency"
		? directoryTarget(lookup.imported.directories.get(use.symbol))
		: nameTarget(use.symbol, lookup);
}

/**
 * The resolver of Go uses in one checkout, for one pass.
 * @param checkout The checkout's files.
 * @param read Reads a file as text: each `go.mod`.
 * @param parsed Reads the facts of another file of the checkout.
 * @returns The resolver.
 */
function createGoResolver(
	checkout: CheckoutFiles,
	read: ReadText,
	parsed: ReadParsed,
): ImportResolver {
	let modules: Modules | undefined;
	const directories = new Map<string, Promise<Map<string, GoFacts>>>();
	/**
	 * The package of a directory, its files read once in a pass.
	 * @param directory The directory.
	 * @param name The package clause, if known.
	 * @returns The package, or undefined for a directory that holds none.
	 */
	const packageIn: PackageIn = async (directory, name) => {
		const files = directories.get(directory) ?? factsIn(checkout, parsed, directory);
		directories.set(directory, files);
		return packageNamed(directory, await files, name);
	};
	return {
		/**
		 * An import names a package, never a file, so it resolves to none here.
		 * @param _from The importing file.
		 * @param found The import.
		 * @returns The import, as it is.
		 */
		resolve: (_from, found) => found,
		/**
		 * Where the uses of one file lead: a `go.mod`'s to the modules it
		 * requires, a Go file's in its package and the packages it imports.
		 * @param from The file.
		 * @param facts Its facts.
		 * @returns Its definitions and the target of each use.
		 */
		inModule: async (from, facts): Promise<ModuleReading> => {
			modules ??= modulesOf(checkout.files, read);
			const known = modules;
			const { definitions } = facts;
			if (path.posix.basename(from) === "go.mod") {
				const targets = facts.references.map((use) =>
					directoryTarget(directoryOfImport(use.symbol, from, known), directoryOf(from)),
				);
				return { definitions, targets };
			}
			if (!isGoFacts(facts)) return { definitions, targets: [] };
			const own = await packageIn(directoryOf(from), facts.package);
			const lookup: NameLookup = {
				own: new Set(definitions.map((each) => each.symbol)),
				scoped: new Set(facts.scoped),
				package: own === undefined ? [] : [indexOf(own, false, TEST_FILE.test(from))],
				imported: await importsOf(from, facts, known, packageIn),
			};
			return { definitions, targets: facts.references.map((use) => useTarget(use, lookup)) };
		},
	};
}

export { createGoResolver, directoryOf, GO_FILE, TEST_FILE };
