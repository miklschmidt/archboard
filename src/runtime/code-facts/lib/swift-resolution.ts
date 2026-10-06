// Where the uses of a Swift file lead (ADR 0046, TASK-367.12), for one pass.
//
// A Swift module is a target of a package: the Swift files below the target's
// directory, which `Package.swift` names (`path:`) or SwiftPM's convention
// gives (`Sources/<name>`, `Source`, `src` or `srcs`; `Tests/<name>` for a test
// target; `Plugins/<name>` for a plugin). The manifest of a file is the
// nearest `Package.swift` above it, read statically (swift-package.ts). A file
// that no target of a manifest holds is in no module the check knows, and its
// uses lead nowhere (a language server resolves them, TASK-367.16).
//
// The files of one module see each other's names with no import, and an
// import brings in what another module exposes. So a use leads to the one
// other file of its module that defines its spelling (the longest of its
// names that one does, `Ledger.refund` before `Ledger`), else to the one file
// of a module the file imports that defines it and exposes it. A name the file
// defines itself stays the file's own, a name two files define is not
// resolved, and a bare name finds a declaration at file level only, never a
// member. A definition only its own file can use (`private`, `fileprivate`)
// is found in no other file. Within a package, the module and the manifest
// name the files, so the use is resolved, as the files of one C# project see
// each other's names (TASK-367.11).
//
// A name is resolved only where nothing nearer can be it. A use whose first
// name the file binds in a narrower scope (a parameter, a local, a closure's
// or a generic parameter, a member of its types) may be that binding, and
// leads nowhere: on swift-nio, 727 of 6,057 resolved uses were such names. A
// member reached through a value (`self.close()`) is spelled `.close` and is
// no name of the module. A definition in the part of a file that did not
// parse may stand outside its declaration, a member read at file level or a
// local read as a declaration, so no other file's use leads to it.
//
// An import of a local module that the importing target depends on in the
// manifest leads to the module's directory, written with a trailing `/`, so
// the build dependency reaches the part bound to that directory. The
// dependencies a manifest names lead there too.

import path from "node:path";
import type {
	Definition,
	ImportResolver,
	ModuleReading,
	ParsedFacts,
	ReadParsed,
	ReadText,
	Target,
} from "@/runtime/code-facts/lib/facts";
import type { CheckoutFiles } from "@/runtime/code-facts/lib/module-resolution";
import { isSwiftFacts } from "@/runtime/code-facts/lib/swift-adapter";
import { filePrivate } from "@/runtime/code-facts/lib/swift-definitions";
import { isManifest, type SwiftTarget } from "@/runtime/code-facts/lib/swift-package";

/** The file that declares a package. */
const MANIFEST = "Package.swift";

/** The directories SwiftPM looks in for a target's sources, in order. */
const SOURCE_ROOTS = ["Sources", "Source", "src", "srcs"];

/**
 * One module of a package: its name, its directory in the checkout, and the
 * names it depends on. A product of another package never shares a name with
 * a module of the package, which SwiftPM refuses, so a name that is a module
 * here names that module.
 */
interface SwiftModule {
	readonly name: string;
	readonly directory: string;
	readonly dependencies: ReadonlySet<string>;
}

/** One package: its manifest and its modules by name. */
interface PackageModel {
	readonly manifest: string;
	readonly modules: ReadonlyMap<string, SwiftModule>;
}

/** Each name some files of a module define, and those files. */
type ModuleIndex = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * A directory below another, `""` being the checkout, as a manifest may write
 * it: `Sources/Core/` and `./Sources/Core` are `Sources/Core`, and `.` is the
 * package's own directory.
 * @param directory The directory.
 * @param name The path inside it.
 * @returns The joined path, with no trailing `/`.
 */
function below(directory: string, name: string): string {
	const joined = path.posix.normalize(path.posix.join(directory, name)).replace(/\/+$/u, "");
	return joined === "." ? "" : joined;
}

/**
 * Whether a file is below a directory.
 * @param file The file.
 * @param directory The directory.
 * @returns True when it is.
 */
function inside(file: string, directory: string): boolean {
	return directory === "" || file.startsWith(`${directory}/`);
}

/**
 * The directory of a target: the one `path:` names, else the first of SwiftPM's
 * conventional directories that holds a file.
 * @param target The target.
 * @param root The package's directory.
 * @param files The checkout's files.
 * @returns The directory, relative to the checkout.
 */
function directoryOf(target: SwiftTarget, root: string, files: ReadonlySet<string>): string {
	if (target.path !== undefined) return below(root, target.path);
	if (target.kind === "testTarget") return below(root, `Tests/${target.name}`);
	if (target.kind === "plugin") return below(root, `Plugins/${target.name}`);
	const candidates = SOURCE_ROOTS.map((source) => below(root, `${source}/${target.name}`));
	const held = candidates.find((directory) => [...files].some((file) => inside(file, directory)));
	return held ?? candidates[0] ?? target.name;
}

/**
 * The package one manifest declares.
 * @param manifest The manifest, relative to the checkout.
 * @param facts Its facts.
 * @param files The checkout's files.
 * @returns The package, or undefined when the facts are not a manifest's.
 */
function modelOf(
	manifest: string,
	facts: ParsedFacts | undefined,
	files: ReadonlySet<string>,
): PackageModel | undefined {
	if (facts === undefined || !isManifest(facts)) return undefined;
	const root = path.posix.dirname(manifest) === "." ? "" : path.posix.dirname(manifest);
	const modules = facts.package.targets.map((target): SwiftModule => ({
		name: target.name,
		directory: directoryOf(target, root, files),
		dependencies: new Set(target.dependencies.map((each) => each.name)),
	}));
	return { manifest, modules: new Map(modules.map((module) => [module.name, module])) };
}

/**
 * The module directory a use of a module leads to.
 * @param module The module.
 * @returns The target: the directory, with a trailing `/`; none for a module
 * that is the whole checkout, which every part holds.
 */
function moduleTarget(module: SwiftModule): Target | undefined {
	return module.directory === "" ? undefined : { path: `${module.directory}/`, symbol: "*" };
}

/**
 * The manifest of the package that holds a directory: the nearest
 * `Package.swift` in it or above it.
 * @param files The checkout's files.
 * @param directory The directory, `.` or `""` being the checkout.
 * @returns The manifest, or undefined when no package holds the directory.
 */
function manifestAbove(files: ReadonlySet<string>, directory: string): string | undefined {
	const names = directory === "" || directory === "." ? [] : directory.split("/");
	const above = names.map((_, index) => names.slice(0, names.length - index).join("/"));
	return [...above.map((at) => `${at}/${MANIFEST}`), MANIFEST].find((file) => files.has(file));
}

/**
 * The directory of each module the package that holds a directory declares.
 * @param files The checkout's files.
 * @param directory The directory.
 * @param parsed Reads the facts of the package's manifest.
 * @returns The directories, relative to the checkout; none when no package holds the directory.
 */
async function moduleDirectories(
	files: ReadonlySet<string>,
	directory: string,
	parsed: ReadParsed,
): Promise<string[]> {
	const manifest = manifestAbove(files, directory);
	if (manifest === undefined) return [];
	const model = modelOf(manifest, await parsed(manifest), files);
	return [...(model?.modules.values() ?? [])].map((module) => module.directory);
}

/**
 * The module that holds a file: the target whose directory is the deepest above it.
 * @param model The package.
 * @param file The file.
 * @returns The module, or undefined when no target holds the file.
 */
function moduleHolding(model: PackageModel, file: string): SwiftModule | undefined {
	let deepest: SwiftModule | undefined;
	for (const module of model.modules.values()) {
		if (!inside(file, module.directory)) continue;
		if (deepest === undefined || module.directory.length > deepest.directory.length) {
			deepest = module;
		}
	}
	return deepest;
}

/** What finding where a file's names lead needs. */
interface NameLookup {
	/** Every name the file defines itself. */
	readonly own: ReadonlySet<string>;
	/** The names the file binds in a scope narrower than the file. */
	readonly scoped: ReadonlySet<string>;
	readonly module: ModuleIndex;
	/** The modules the file imports, by name, and what each exposes. */
	readonly imported: ReadonlyMap<string, ModuleIndex>;
}

/**
 * Where one spelled name leads among indexed files: the asking file's own
 * name leads nowhere, and the first module that defines it leads to its file
 * when one file of it does.
 * @param symbol The name.
 * @param lookup The asking file and its own names.
 * @param indexes The modules to look in, nearest first.
 * @returns The target, `nowhere` when the name is the file's own or several
 * files define it, or undefined when no module defines it.
 */
function lookUp(
	symbol: string,
	lookup: NameLookup,
	indexes: readonly ModuleIndex[],
): Target | "nowhere" | undefined {
	if (lookup.own.has(symbol)) return "nowhere";
	const files = indexes.map((index) => index.get(symbol)).find((each) => each !== undefined);
	if (files === undefined) return undefined;
	const [file, ...more] = files;
	return file === undefined || more.length > 0 ? "nowhere" : { path: file, symbol };
}

/**
 * Whether the asking file or a module declares a name.
 * @param name The name.
 * @param lookup The asking file and its own names.
 * @param indexes The modules.
 * @returns True when one does.
 */
function declared(name: string, lookup: NameLookup, indexes: readonly ModuleIndex[]): boolean {
	return lookup.own.has(name) || indexes.some((index) => index.has(name));
}

/**
 * Where a spelling leads among indexed files: the longest of its names that a
 * file defines, unless the asking file defines it or several files do. Its
 * first name must be declared there or in the asking file: a member that an
 * extension adds to a type from elsewhere, such as `String.init`, may be
 * another member of that type, which the check does not read.
 * @param names The spelling's names.
 * @param lookup The asking file and its own names.
 * @param indexes The modules to look in, nearest first.
 * @returns The target, or undefined.
 */
function spelledTarget(
	names: readonly string[],
	lookup: NameLookup,
	indexes: readonly ModuleIndex[],
): Target | undefined {
	if (!declared(names[0] ?? "", lookup, indexes)) return undefined;
	for (let count = names.length; count > 0; count -= 1) {
		const target = lookUp(names.slice(0, count).join("."), lookup, indexes);
		if (target !== undefined) return target === "nowhere" ? undefined : target;
	}
	return undefined;
}

/**
 * Where one use of a name leads: in the file's module, else in a module it
 * imports. A spelling that starts with an imported module's name
 * (`Core.Ledger`) looks only in that module, and one that starts with a name
 * the file binds in a narrower scope leads nowhere.
 * @param symbol The use's spelling.
 * @param lookup The asking file, its module and its imports.
 * @returns The target, or undefined.
 */
function nameTarget(symbol: string, lookup: NameLookup): Target | undefined {
	const [first = "", ...rest] = symbol.split(".");
	if (lookup.scoped.has(first)) return undefined;
	const qualified = rest.length > 0 ? lookup.imported.get(first) : undefined;
	if (qualified !== undefined) {
		return spelledTarget(rest, { ...lookup, own: new Set() }, [qualified]);
	}
	return spelledTarget([first, ...rest], lookup, [lookup.module, ...lookup.imported.values()]);
}

/**
 * The names the files of a module define for other files to use.
 * @param module The module.
 * @param files The checkout's files.
 * @param parsed Reads a file's facts.
 * @param exposedOnly Whether only names another module can use count.
 * @returns Each name and the files that define it.
 */
async function indexOf(
	module: SwiftModule,
	files: ReadonlySet<string>,
	parsed: ReadParsed,
	exposedOnly: boolean,
): Promise<ModuleIndex> {
	const sources = [...files].filter(
		(file) => file.endsWith(".swift") && inside(file, module.directory),
	);
	const index = new Map<string, Set<string>>();
	for (const file of sources.toSorted()) {
		// oxlint-disable-next-line no-await-in-loop -- one file at a time, through the pass's queue of parses
		const seen = offered(await parsed(file), exposedOnly);
		for (const { symbol } of seen) index.set(symbol, new Set([...(index.get(symbol) ?? []), file]));
	}
	return index;
}

/**
 * The definitions of a file that other files can use: none in the part that
 * did not parse, where a definition may stand outside its declaration.
 * @param facts The file's facts.
 * @param exposedOnly Whether the other files are in another module.
 * @returns The definitions.
 */
function offered(facts: ParsedFacts | undefined, exposedOnly: boolean): Definition[] {
	const { definitions = [], unparsed = [] } = facts ?? {};
	return definitions.filter(
		(each) =>
			!unparsed.some((part) => part.start <= each.start && each.start <= part.end) &&
			seenOutside(each, definitions, exposedOnly),
	);
}

/**
 * Whether another file can use a definition: any other file of its module
 * unless it is file-private, and a file of another module only where it is exposed.
 * @param definition The definition.
 * @param definitions Every definition of its file.
 * @param exposedOnly Whether the other file is in another module.
 * @returns True when it can.
 */
function seenOutside(
	definition: Definition,
	definitions: readonly Definition[],
	exposedOnly: boolean,
): boolean {
	return exposedOnly ? definition.exposed : !filePrivate(definition, definitions);
}

/**
 * The resolver of Swift uses in one checkout, for one pass.
 * @param checkout The checkout's files.
 * @param _read Reads a file as text; the manifest is read through its facts instead.
 * @param parsed Reads the facts of another file of the checkout.
 * @returns The resolver.
 */
function createSwiftResolver(
	checkout: CheckoutFiles,
	_read: ReadText,
	parsed: ReadParsed,
): ImportResolver {
	const packages = new Map<string, Promise<PackageModel | undefined>>();
	const indexes = new Map<string, Promise<ModuleIndex>>();
	/**
	 * The package of a file: the nearest manifest above it.
	 * @param file The file.
	 * @returns The package, or undefined when none holds the file.
	 */
	const packageOf = (file: string): Promise<PackageModel | undefined> => {
		const manifest = manifestAbove(checkout.files, path.posix.dirname(file));
		if (manifest === undefined) return Promise.resolve(undefined);
		let model = packages.get(manifest);
		if (model === undefined) {
			model = parsed(manifest).then((facts) => modelOf(manifest, facts, checkout.files));
			packages.set(manifest, model);
		}
		return model;
	};
	/**
	 * What a module offers other files, once in a pass.
	 * @param module The module.
	 * @param exposedOnly Whether the files are in another module.
	 * @returns The index.
	 */
	const indexFor = (module: SwiftModule, exposedOnly: boolean): Promise<ModuleIndex> => {
		const key = `${module.directory}\0${String(exposedOnly)}`;
		let index = indexes.get(key);
		if (index === undefined) {
			index = indexOf(module, checkout.files, parsed, exposedOnly);
			indexes.set(key, index);
		}
		return index;
	};
	return {
		/**
		 * An import names a module, never a file, so it resolves to none here.
		 * @param _from The importing file.
		 * @param found The import.
		 * @returns The import, as it is.
		 */
		resolve: (_from, found) => found,
		/**
		 * Where the uses of one file lead in its package.
		 * @param from The file.
		 * @param facts Its facts.
		 * @returns Its definitions and the target of each use.
		 */
		inModule: async (from, facts): Promise<ModuleReading> => {
			const model = await packageOf(from);
			const none: ModuleReading = { definitions: facts.definitions, targets: [] };
			if (model === undefined) return none;
			if (from === model.manifest) {
				const targets = facts.references.map((use) => {
					const module = model.modules.get(use.symbol);
					return use.kind === "build-dependency" && module !== undefined
						? moduleTarget(module)
						: undefined;
				});
				return { definitions: facts.definitions, targets };
			}
			const module = moduleHolding(model, from);
			if (module === undefined) return none;
			const importedModules = facts.imports.flatMap((found) => {
				const other = model.modules.get(found.specifier);
				return other === undefined || other === module ? [] : [other];
			});
			const lookup: NameLookup = {
				own: new Set(facts.definitions.map((definition) => definition.symbol)),
				scoped: new Set(isSwiftFacts(facts) ? facts.scoped : []),
				module: await indexFor(module, false),
				imported: new Map(
					await Promise.all(
						importedModules.map(
							async (other) => [other.name, await indexFor(other, true)] as const,
						),
					),
				),
			};
			const targets = facts.references.map((use) => {
				if (use.via !== "code") return undefined;
				if (use.kind !== "build-dependency") return nameTarget(use.symbol, lookup);
				const other = model.modules.get(use.symbol);
				return other !== undefined && module.dependencies.has(other.name)
					? moduleTarget(other)
					: undefined;
			});
			return { definitions: facts.definitions, targets };
		},
	};
}

export { createSwiftResolver, moduleDirectories };
