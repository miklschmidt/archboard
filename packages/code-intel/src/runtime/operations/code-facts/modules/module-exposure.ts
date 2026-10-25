// What a module exposes (ADR 0044, ADR 0046): the code's side of a
// container's interface, which the code check holds against the interface a
// board derives.
//
// Each language says what its module is: a directory, the file that stands
// for it, and the root files callers may use. TypeScript's root files are
// what its `package.json` `exports` names, else the files directly in the
// directory (typescript-exposure.ts). A Python package's root file is its
// `__init__.py`. A Swift module is a target of its package, and each of its
// files is a root file (swift-exposure.ts). A Rust crate's root file is its
// `lib.rs`, and a module's is its `mod.rs` or the file beside its directory
// (rust-exposure.ts). A C, C++ or Objective-C
// module's root files are its public headers (c-exposure.ts): an `.m` file
// is a source file that pairs with its header, and a class extension in it
// exposes nothing. A Terraform or OpenTofu module is
// the configuration files directly in its directory, and exposes its
// variables and outputs (TASK-368.11). A Nix flake exposes its output
// attribute paths. A Helm chart exposes its values.yaml key paths
// (TASK-436.08). A language with no rule here
// exposes nothing the check can read, and the check says so.
//
// What a root file exposes reads the same in every language, from its code
// facts: each definition it exposes (an export, a name `__all__` lists or a
// public one, and the public members of one), and each name it passes on
// through a re-export, followed to the file that defines it. Each adapter
// records the names a file passes on as re-exports: `export ... from` and
// `export { name }` of an imported name in TypeScript, and in Python each
// imported name that `from module import *` would pass on. A declaration,
// such as a C prototype in a public header, is exposed where its code is,
// passed on by the file that declares it (definition-site.ts).

import { cRootFiles, isCFile } from "#runtime/operations/code-facts/c/c-exposure.ts";
import { projectDirectoryOf } from "#runtime/operations/code-facts/csharp/csharp-project.ts";
import { projectFilesIn } from "#runtime/operations/code-facts/csharp/csharp-resolution.ts";
import { codeSiteOf } from "#runtime/operations/code-facts/definition-site.ts";
import type {
	Definition,
	ImportedName,
	SyntaxFacts,
} from "#runtime/operations/code-facts/facts.ts";
import type { CheckoutFiles } from "#runtime/operations/code-facts/modules/module-resolution.ts";
import { isHelmValues } from "#runtime/operations/code-facts/kubernetes/helm-values.ts";
import type { FactsPass } from "#runtime/services/code-facts/reader.ts";
import {
	RUST_FILE,
	rustHolds,
	rustRootFiles,
} from "#runtime/operations/code-facts/rust/rust-exposure.ts";
import { SWIFT_FILE, swiftRootFiles } from "#runtime/operations/code-facts/swift/swift-exposure.ts";
import { isTerraformFile } from "#runtime/operations/code-facts/terraform/terraform-address.ts";
import {
	directoryOf,
	terraformModules,
} from "#runtime/operations/code-facts/terraform/terraform-resolution.ts";
import {
	ENTRY_FILE,
	TYPESCRIPT_FILE,
	typeScriptRootFiles,
} from "#runtime/operations/code-facts/typescript/typescript-exposure.ts";

/** How many files a chain of re-exports may pass through. */
const CHAIN_DEPTH = 16;

/** What one language says about its modules. */
interface ExposureRule {
	/**
	 * Whether a file is written in the language, so it can use a module of it.
	 * @param file The file, relative to its checkout.
	 */
	readonly writes: (file: string) => boolean;
	/**
	 * Whether a file stands for the module its directory is, as `index.ts` does.
	 * @param name The file's name, without its directory.
	 */
	readonly entry: (name: string) => boolean;
	/**
	 * The files of a module that callers may use; none when it has none the rule can read.
	 * @param pass The pass.
	 * @param checkout The checkout.
	 * @param directory The module's directory.
	 */
	readonly rootFiles: (
		pass: FactsPass,
		checkout: CheckoutFiles,
		directory: string,
	) => Promise<string[]>;
	/**
	 * Whether an exposed name is a member of another, counted for its holder,
	 * where the language's names say more than their dots, as C# qualifies a
	 * type by its namespace too. Without it, a name's `.` says so.
	 * @param name The name.
	 * @param exposed Every name the module exposes.
	 */
	readonly member?: (name: ExposedName, exposed: readonly ExposedName[]) => boolean;
	/**
	 * Whether a file is the module's own, so no caller of it. Without it, every
	 * file below the module's directory is.
	 * @param directory The module's directory.
	 * @param file A file of the language.
	 */
	readonly holds?: (directory: string, file: string) => boolean;
}

/** TypeScript's rule: a directory whose root files export what it exposes. */
const TYPESCRIPT: ExposureRule = {
	/**
	 * Whether a file is TypeScript or TSX.
	 * @param file The file.
	 * @returns True when it is.
	 */
	writes: (file) => TYPESCRIPT_FILE.test(file),
	/**
	 * Whether a file is an `index` file.
	 * @param name The file's name.
	 * @returns True when it is.
	 */
	entry: (name) => ENTRY_FILE.test(name),
	rootFiles: typeScriptRootFiles,
};

/** A Python file or stub. */
const PYTHON_FILE = /\.pyi?$/u;
/** The file of a Python package, which stands for its directory. */
const PACKAGE_FILE = /^__init__\.pyi?$/u;

/** Python's rule: a package, whose `__init__.py` says what it exposes. */
const PYTHON: ExposureRule = {
	/**
	 * Whether a file is Python or a Python stub.
	 * @param file The file.
	 * @returns True when it is.
	 */
	writes: (file) => PYTHON_FILE.test(file),
	/**
	 * Whether a file is a package's `__init__.py`.
	 * @param name The file's name.
	 * @returns True when it is.
	 */
	entry: (name) => PACKAGE_FILE.test(name),
	/**
	 * The package's `__init__.py`, else its stub; an import of the package
	 * reads the first of the two, as the resolver does.
	 * @param _pass The pass.
	 * @param checkout The checkout.
	 * @param directory The package's directory.
	 * @returns The file, or none for a directory that is no package.
	 */
	rootFiles: (_pass, checkout, directory) => {
		const files = ["__init__.py", "__init__.pyi"].map((name) =>
			directory === "" ? name : `${directory}/${name}`,
		);
		return Promise.resolve(files.filter((file) => checkout.files.has(file)).slice(0, 1));
	},
};

/** Swift's rule: a target of a package, whose files expose its `open`, `public` and `package` declarations. */
const SWIFT: ExposureRule = {
	/**
	 * Whether a file is Swift.
	 * @param file The file.
	 * @returns True when it is.
	 */
	writes: (file) => SWIFT_FILE.test(file),
	/**
	 * No file stands for a Swift module.
	 * @returns False.
	 */
	entry: () => false,
	rootFiles: swiftRootFiles,
};

/**
 * Rust's rule: a crate, whose `lib.rs` exposes its `pub` items and what it
 * passes on, or a module of a crate's tree, whose `mod.rs` or file beside its
 * directory does (rust-exposure.ts).
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
	holds: rustHolds,
};

/**
 * C, C++ and Objective-C's rule: a directory, whose public headers declare
 * what it exposes, each name at its code in the header's pair.
 */
const C: ExposureRule = {
	writes: isCFile,
	/**
	 * No file stands for a C, C++ or Objective-C module.
	 * @returns False.
	 */
	entry: () => false,
	rootFiles: cRootFiles,
};

/** A C# file. */
const CSHARP_FILE = /\.cs$/u;

/**
 * C#'s rule: a project, the `.cs` files below the directory of its project
 * file, each of which is a root file, as the files of one assembly are. It
 * exposes its public types and their public members. `InternalsVisibleTo`
 * opens internal code to the friends it names, mostly the project's tests,
 * which are no callers. It does not widen the interface, so a friend that
 * uses internal code reaches past it.
 */
const CSHARP: ExposureRule = {
	/**
	 * Whether a file is C#.
	 * @param file The file.
	 * @returns True when it is.
	 */
	writes: (file) => CSHARP_FILE.test(file),
	/**
	 * Whether a file is a project file, which stands for its project.
	 * @param name The file's name.
	 * @returns True when it is.
	 */
	entry: (name) => projectDirectoryOf(name) !== undefined,
	/**
	 * The files of the project whose project file is in the directory.
	 * @param _pass The pass.
	 * @param checkout The checkout.
	 * @param directory The project's directory.
	 * @returns The files, or none for a directory that holds no project file.
	 */
	rootFiles: (_pass, checkout, directory) =>
		Promise.resolve([...projectFilesIn(checkout.files, directory)]),
	/**
	 * Whether an exposed type or member is held by an exposed type around it
	 * in its file; a type in a namespace is held by none.
	 * @param name The name.
	 * @param exposed Every name the project exposes.
	 * @returns True for a member or a nested type.
	 */
	member: (name, exposed) => {
		const { symbol, start, end } = name.definition;
		const holder = symbol.slice(0, Math.max(symbol.lastIndexOf("."), 0));
		return exposed.some(
			(other) =>
				other.path === name.path &&
				other.definition.symbol === holder &&
				other.definition.start <= start &&
				end <= other.definition.end,
		);
	},
};

/**
 * Terraform's and OpenTofu's rule: a module is the configuration files
 * directly in its directory, each a root file, and it exposes its variables
 * and outputs, `var.name` and `output.url`, none a member of another. No file
 * stands for a module, and a module in a directory below it, such as an
 * example, is another module that can call it.
 */
const TERRAFORM: ExposureRule = {
	writes: isTerraformFile,
	/**
	 * No file stands for a Terraform module.
	 * @returns False.
	 */
	entry: () => false,
	/**
	 * The configuration files directly in the directory.
	 * @param _pass The pass.
	 * @param checkout The checkout.
	 * @param directory The module's directory.
	 * @returns The files, or none for a directory that holds no configuration.
	 */
	rootFiles: (_pass, checkout, directory) =>
		Promise.resolve(terraformModules(checkout).get(directory) ?? []),
	/**
	 * Whether a file is directly in the module's directory.
	 * @param directory The directory.
	 * @param file The file.
	 * @returns True when it is.
	 */
	holds: (directory, file) => directoryOf(file) === directory,
	/**
	 * A variable or an output is a member of nothing.
	 * @returns False.
	 */
	member: () => false,
};

/** A Nix flake exposes its output attribute paths. */
const NIX: ExposureRule = {
	/**
	 * Whether a file declares a flake or its inputs.
	 * @param file The file.
	 * @returns True for a flake file.
	 */
	writes: (file) => /(?:^|\/)flake\.(?:nix|lock)$/u.test(file),
	/**
	 * Whether a file stands for a flake.
	 * @param name Its basename.
	 * @returns True for flake.nix.
	 */
	entry: (name) => name === "flake.nix",
	/**
	 * The file that declares the flake's outputs.
	 * @param _pass The pass.
	 * @param checkout The checkout's files.
	 * @param directory The flake's directory.
	 * @returns The entry file, if present.
	 */
	rootFiles: (_pass, checkout, directory) => {
		const flake = directory === "" ? "flake.nix" : `${directory}/flake.nix`;
		return Promise.resolve(checkout.files.has(flake) ? [flake] : []);
	},
	/**
	 * Each output attribute path is an exposed name in its own right.
	 * @returns False.
	 */
	member: () => false,
};

/** A chart exposes its values, while its templates remain implementation. */
const HELM: ExposureRule = {
	/**
	 * Whether a file can hold chart values or a manifest.
	 * @param file The file.
	 * @returns True for YAML.
	 */
	writes: (file) => /\.ya?ml$/u.test(file),
	/**
	 * Whether a file identifies a chart or declares its values.
	 * @param name Its basename.
	 * @returns True for either entry file.
	 */
	entry: (name) => name === "Chart.yaml" || name === "values.yaml",
	/**
	 * The values file of a directory identified as a chart.
	 * @param _pass The pass.
	 * @param checkout The checkout's files.
	 * @param directory The chart's directory.
	 * @returns Its values file, if present.
	 */
	rootFiles: (_pass, checkout, directory) => {
		const values = directory === "" ? "values.yaml" : `${directory}/values.yaml`;
		return Promise.resolve(
			checkout.files.has(values) && isHelmValues(checkout, values) ? [values] : [],
		);
	},
	/**
	 * Each value path can be supplied independently.
	 * @returns False.
	 */
	member: () => false,
};

/** The rule of each adapter that reads a language or an infrastructure interface. */
const RULES: readonly ExposureRule[] = [
	TYPESCRIPT,
	PYTHON,
	SWIFT,
	RUST,
	C,
	CSHARP,
	TERRAFORM,
	NIX,
	HELM,
];

/** One name a module exposes, and the definition it reaches. */
interface ExposedName {
	/**
	 * The name as a caller spells it after importing the root file: `readBoard`,
	 * `default`, `Ledger.post` for a public member, `ns.read` through `export * as ns`.
	 */
	readonly name: string;
	/** The file that defines it, relative to the checkout. */
	readonly path: string;
	readonly definition: Definition;
	/** The files that pass it on, the root file first; empty when the root file defines it. */
	readonly via: readonly string[];
	/** Whether it is a member of another exposed name, where its language's rule says (`ExposureRule.member`). */
	readonly member?: boolean;
}

/** What one module exposes, and where its callers can be. */
interface ModuleExposure {
	/** The module's directory, relative to the checkout. */
	readonly directory: string;
	/** The files callers may use, relative to the checkout. */
	readonly rootFiles: readonly string[];
	/** Each name a root file exposes, in the root files' order. */
	readonly exposed: readonly ExposedName[];
	/** Every file outside the module written in its language: where a caller can be. */
	readonly outside: readonly string[];
}

/**
 * Whether a path lies in a directory or is it.
 * @param directory The directory, relative to the checkout; empty for the checkout.
 * @param file The path.
 * @returns True when it does.
 */
function within(directory: string, file: string): boolean {
	return directory === "" || file === directory || file.startsWith(`${directory}/`);
}

/**
 * The name a caller spells for a definition the file exposes: `default` for
 * the default export and its members.
 * @param definition The definition.
 * @param defaults The names the file exports by default.
 * @returns The name.
 */
function spelled(definition: Definition, defaults: ReadonlySet<string>): string {
	const [first = "", ...rest] = definition.symbol.split(".");
	return defaults.has(first) ? ["default", ...rest].join(".") : definition.symbol;
}

/**
 * The names one file passes on from another, renamed as the file names them.
 * @param name What the re-export names.
 * @param passed What the other file exposes.
 * @returns The names the file exposes through it.
 */
function passedOn(name: ImportedName, passed: readonly ExposedName[]): ExposedName[] {
	if (name.local === "*") {
		return passed.filter((each) => each.name !== "default" && !each.name.startsWith("default."));
	}
	if (name.imported === "*")
		return passed.map((each) => ({ ...each, name: `${name.local}.${each.name}` }));
	return passed.flatMap((each) => {
		if (each.name === name.imported) return [{ ...each, name: name.local }];
		const prefix = `${name.imported}.`;
		return each.name.startsWith(prefix)
			? [{ ...each, name: `${name.local}.${each.name.slice(prefix.length)}` }]
			: [];
	});
}

/**
 * One search for the names a module's root files expose: the pass, the
 * checkout, the files on the chain, and what each file read so far exposes.
 */
interface Search {
	readonly pass: FactsPass;
	readonly checkout: CheckoutFiles;
	readonly chain: readonly string[];
	/** Each file the search has read, and the names it exposes; files re-export one file many times. */
	readonly read: Map<string, Promise<ExposedName[]>>;
}

/**
 * The names one file exposes, each followed to the file that defines it,
 * read once in a search. A file already on the chain ends a cycle of
 * re-exports, so it adds nothing there.
 * @param search The search.
 * @param file The file.
 * @returns The names; none for a file no adapter reads.
 */
function exposedBy(search: Search, file: string): Promise<ExposedName[]> {
	if (search.chain.includes(file) || search.chain.length > CHAIN_DEPTH) return Promise.resolve([]);
	let names = search.read.get(file);
	if (names === undefined) {
		names = (async () => {
			const facts = await search.pass.read(search.checkout, file);
			if (facts === undefined || facts.adapter === "text") return [];
			const deeper: Search = { ...search, chain: [...search.chain, file] };
			const own = await Promise.all(ownExposed(facts).map((name) => withCode(search, name)));
			return [...own, ...(await passedExposed(deeper, facts))];
		})();
		search.read.set(file, names);
	}
	return names;
}

/**
 * A name exposed where its code is: a declaration, such as a C prototype,
 * at the definition its file's pair holds, which the declaring file passes on.
 * @param search The search.
 * @param name A name a file exposes that it declares itself.
 * @returns The name, at its code where the pair defines it.
 */
async function withCode(search: Search, name: ExposedName): Promise<ExposedName> {
	if (name.definition.declaration !== true) return name;
	return { ...name, ...(await codeSiteOf(search.pass, search.checkout, name)) };
}

/**
 * The names a file exposes that it defines itself.
 * @param facts The file's facts.
 * @returns The names.
 */
function ownExposed(facts: SyntaxFacts): ExposedName[] {
	const defaults = new Set(
		facts.definitions.flatMap((each) =>
			each.visibility === "export default" ? [each.symbol] : [],
		),
	);
	return facts.definitions.flatMap((definition): ExposedName[] =>
		definition.exposed
			? [{ name: spelled(definition, defaults), path: facts.path, definition, via: [] }]
			: [],
	);
}

/**
 * The names a file passes on from the files its re-exports name.
 * @param search The search, with the file on its chain.
 * @param facts The file's facts.
 * @returns The names, each with the file first among those that pass it on.
 */
async function passedExposed(search: Search, facts: SyntaxFacts): Promise<ExposedName[]> {
	const passed: ExposedName[] = [];
	for (const found of facts.imports) {
		if (!found.reexport || found.resolved === undefined) continue;
		// oxlint-disable-next-line no-await-in-loop -- one re-export at a time keeps the names in the file's order
		const further = await exposedBy(search, found.resolved);
		const names = found.names.flatMap((name) => passedOn(name, further));
		passed.push(...names.map((each) => ({ ...each, via: [facts.path, ...each.via] })));
	}
	return passed;
}

/**
 * The module a bound path names: a directory, or the file that stands for
 * the directory that holds it, such as an `index.ts` or an `__init__.py`.
 * @param bound The path, relative to its checkout.
 * @param kind Whether it is a file or a directory.
 * @returns The module's directory, or undefined when the path names no module.
 */
function moduleOf(bound: string, kind: "file" | "directory"): string | undefined {
	if (kind === "directory") return bound;
	const slash = bound.lastIndexOf("/");
	const name = bound.slice(slash + 1);
	const entry = RULES.some((rule) => rule.entry(name)) || /\.ya?ml$/u.test(name);
	return entry ? bound.slice(0, Math.max(slash, 0)) : undefined;
}

/**
 * What a module exposes, by the rule of the first language whose root files
 * it has.
 * @param pass The pass.
 * @param checkout The checkout and the files the pass may read.
 * @param directory The module's directory, relative to the checkout.
 * @returns What it exposes, or undefined when no rule finds a root file.
 */
async function moduleExposure(
	pass: FactsPass,
	checkout: CheckoutFiles,
	directory: string,
): Promise<ModuleExposure | undefined> {
	for (const rule of RULES) {
		// oxlint-disable-next-line no-await-in-loop -- the first language whose root files the module has decides, so later rules are never read
		const rootFiles = await rule.rootFiles(pass, checkout, directory);
		if (rootFiles.length === 0) continue;
		const search: Search = { pass, checkout, chain: [], read: new Map() };
		const exposed: ExposedName[] = [];
		for (const file of rootFiles) {
			// oxlint-disable-next-line no-await-in-loop -- one root file at a time keeps the names in the root files' order
			exposed.push(...(await exposedBy(search, file)));
		}
		const { member, holds = within } = rule;
		const outside = [...checkout.files]
			.filter((file) => rule.writes(file) && !holds(directory, file))
			.toSorted();
		const named =
			member === undefined
				? exposed
				: exposed.map((name) => ({ ...name, member: member(name, exposed) }));
		return { directory, rootFiles, exposed: named, outside };
	}
	return undefined;
}

export { type ExposedName, type ModuleExposure, moduleExposure, moduleOf, within };
