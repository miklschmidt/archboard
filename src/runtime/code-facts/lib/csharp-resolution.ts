// Where the names a C# file uses lead in its checkout (ADR 0046), resolved
// again on each pass, because they depend on every file of the project.
//
// The files of one C# project see each other without an import, and a
// `using` names a namespace, not a file. So a name a file uses leads to the
// file that declares it, found by C#'s own lookup over what the project and
// the projects it references declare:
//
// 1. The types and namespaces around the use, innermost first: from inside
//    `Shop.Core.Ledger.Post`, the name `Audit` is looked up as
//    `Shop.Core.Ledger.Post.Audit`, `Shop.Core.Ledger.Audit`,
//    `Shop.Core.Audit`, `Shop.Audit` and `Audit`. So a member that another
//    file of a partial class declares is found.
// 2. The file's aliases (`using L = Shop.Core.Ledger;`).
// 3. The file's `using` directives, then the `global using` directives of
//    every file of the project. A `using static` type reads as a namespace
//    does, so its members are found too.
//
// Each lookup takes the longest run of the use's names that a project
// declares: `Ledger.Post` leads to the method `Post` where it is declared,
// and `Ledger.Instance.Post` to the property `Instance`, because what follows
// a value is the value's type's, which only a language server knows
// (TASK-367.14). Where the syntax lets only a type stand (`asType`: a declared
// type, `new`, an attribute, `typeof`, a base list), a name may be found as a
// type in a namespace. Any other name may be a local or a member that a base
// class declares, which the check cannot see, so in a namespace or a `using`
// it needs the member after the type (`Ledger.Create`), and a bare `Ledger`
// passed as a value finds no type; under a type around it, it is that type's
// member. A member of a value the code does not name (`.Command`) is looked
// up nowhere. A name declared in several files, a partial class, leads to the
// using file itself if it declares it, else to the file named after the
// type, else to the first in path order. The lookup is C#'s binding of a
// namespace-qualified name to its declaration, so the evidence it gives is
// resolved: the namespace and the name are the declaration's address, as an
// import path names a file. A use whose definition is in no project of the
// checkout, such as `Console`, leads nowhere.
//
// A project is a `.csproj` file and the `.cs` files below its directory, as
// the .NET SDK includes them by default: not those below a project file
// further down, nor those in its `bin` or `obj`. A `.cs` file below no project
// file belongs to the loose files of the checkout. A `ProjectReference`
// resolves against the directory of its project file, and the projects it
// names are searched too, and theirs in turn, as the SDK passes project
// references on. A name another project declares reaches the using file
// through that project's file, as a name reaches a TypeScript file through
// the `index.ts` it imports, so a part bound to a `.csproj` holds and owns what
// its project declares for the code of other projects.
//
// An internal definition names the friends its project gives it: the
// assemblies `InternalsVisibleTo` names, in an attribute of any of its files or
// in its project file.

import path from "node:path";
import type {
	Definition,
	Import,
	ImportResolver,
	ModuleReading,
	ParsedFacts,
	ReadParsed,
	ReadText,
	Reference,
	Target,
} from "@/runtime/code-facts/lib/facts";
import type { CheckoutFiles } from "@/runtime/code-facts/lib/module-resolution";

/** Where one name is declared. */
interface Declared {
	readonly file: string;
	readonly start: number;
}

/** What one project declares, and what it builds with. */
interface Project {
	/** Its project file, or undefined for the loose files of the checkout. */
	readonly file: string | undefined;
	/** Each qualified name its files declare, and where. */
	readonly declared: ReadonlyMap<string, readonly Declared[]>;
	/** The `global using` directives of its files. */
	readonly globalUsings: readonly Import[];
	/** The assemblies `InternalsVisibleTo` names, sorted. */
	readonly friends: readonly string[];
	/** The project files its `ProjectReference` items name in the checkout. */
	readonly references: readonly string[];
}

/** The output directories of a .NET project, which the SDK leaves out of its files. */
const OUTPUT = /(?:^|\/)(?:bin|obj)\//u;

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
 * The checkout path a `ProjectReference` names from a project file.
 * @param project The project file.
 * @param specifier The path as written, with `/`, or a package's id.
 * @returns The path, or undefined for a package or a path that leaves the checkout.
 */
function projectPath(project: string, specifier: string): string | undefined {
	if (!specifier.endsWith("proj")) return undefined;
	const joined = path.posix.normalize(path.posix.join(directoryOf(project), specifier));
	return joined.startsWith("../") || joined === ".." ? undefined : joined;
}

/** Which project each `.cs` file belongs to, and the files of each project. */
interface Membership {
	/** Each `.cs` file's project file, `""` for the loose files. */
	readonly projectOf: ReadonlyMap<string, string>;
	/** Each project's `.cs` files, in path order. */
	readonly filesOf: ReadonlyMap<string, readonly string[]>;
}

/**
 * The project file of each directory that holds one; the first in path order
 * where a directory holds several.
 * @param files The checkout's files, in path order.
 * @returns Each directory's project file.
 */
function projectDirectories(files: readonly string[]): Map<string, string> {
	const projectIn = new Map<string, string>();
	for (const file of files.filter((each) => each.endsWith(".csproj")).toReversed()) {
		projectIn.set(directoryOf(file), file);
	}
	return projectIn;
}

/**
 * The project a file belongs to: the project file nearest above it.
 * @param file The file.
 * @param projectIn The project file of each directory that holds one.
 * @returns The project file, or `""` for a file below none.
 */
function nearestProject(file: string, projectIn: ReadonlyMap<string, string>): string {
	let directory = directoryOf(file);
	while (directory !== "" && !projectIn.has(directory)) directory = directoryOf(directory);
	return projectIn.get(directory) ?? "";
}

/**
 * Each `.cs` file of the checkout by the project file it belongs to, `""` for
 * the loose files, leaving out what a project builds into `bin` and `obj`.
 * @param files The checkout's files.
 * @returns The membership.
 */
function membershipOf(files: ReadonlySet<string>): Membership {
	const sorted = [...files].toSorted();
	const projectIn = projectDirectories(sorted);
	const projectOf = new Map<string, string>();
	const filesOf = new Map<string, string[]>();
	for (const file of sorted.filter((each) => each.endsWith(".cs"))) {
		const project = nearestProject(file, projectIn);
		if (OUTPUT.test(file.slice(directoryOf(project).length))) continue;
		projectOf.set(file, project);
		filesOf.set(project, [...(filesOf.get(project) ?? []), file]);
	}
	return { projectOf, filesOf };
}

/**
 * Each qualified name the files of a project declare, and where.
 * @param files The files, with their facts.
 * @returns Where each name is declared, in the files' order.
 */
function declaredIn(
	files: readonly (readonly [string, ParsedFacts | undefined])[],
): Map<string, Declared[]> {
	const declared = new Map<string, Declared[]>();
	for (const [file, facts] of files) {
		for (const { symbol, start } of facts?.definitions ?? []) {
			declared.set(symbol, [...(declared.get(symbol) ?? []), { file, start }]);
		}
	}
	return declared;
}

/**
 * The friend assemblies the files of a project and its project file name.
 * @param facts The facts of each file and of the project file.
 * @returns The friends, sorted.
 */
function friendsIn(facts: readonly (ParsedFacts | undefined)[]): string[] {
	const names = facts.flatMap((each) =>
		(each?.references ?? []).filter((reference) => reference.via === "assembly"),
	);
	return [...new Set(names.map((reference) => reference.symbol))].toSorted();
}

/**
 * The project files a project file's `ProjectReference` items name in the checkout.
 * @param project The project file.
 * @param facts Its facts.
 * @param checkout The checkout's files.
 * @returns The project files.
 */
function referencedProjects(
	project: string,
	facts: ParsedFacts | undefined,
	checkout: ReadonlySet<string>,
): string[] {
	return (facts?.imports ?? []).flatMap((found) => {
		const target = projectPath(project, found.specifier);
		return target !== undefined && checkout.has(target) ? [target] : [];
	});
}

/**
 * What one project declares, read from the facts of its files and its project file.
 * @param project The project file, or `""` for the loose files.
 * @param files Its `.cs` files.
 * @param parsed Reads the facts of a file.
 * @param checkout The checkout's files.
 * @returns The project.
 */
async function readProject(
	project: string,
	files: readonly string[],
	parsed: ReadParsed,
	checkout: ReadonlySet<string>,
): Promise<Project> {
	const [own, ...read] = await Promise.all([
		project === "" ? undefined : parsed(project),
		...files.map((file) => parsed(file)),
	]);
	return {
		file: project === "" ? undefined : project,
		declared: declaredIn(files.map((file, index) => [file, read[index]] as const)),
		globalUsings: read.flatMap((facts) => (facts?.imports ?? []).filter((found) => found.reexport)),
		friends: friendsIn([own, ...read]),
		references: project === "" ? [] : referencedProjects(project, own, checkout),
	};
}

/**
 * The file a lookup chose among the files that declare one name: the using
 * file, else the file named after the name, else the first.
 * @param declared Where the name is declared.
 * @param symbol The qualified name.
 * @param from The using file.
 * @returns The chosen file.
 */
function chosenFile(
	declared: readonly Declared[],
	symbol: string,
	from: string,
): string | undefined {
	const named = `${symbol.split(".").at(-1) ?? ""}.cs`;
	const chosen =
		declared.find((each) => each.file === from) ??
		declared.find((each) => path.posix.basename(each.file) === named);
	return (chosen ?? declared[0])?.file;
}

/**
 * The prefixes a name is looked up under from where it is used: the
 * qualified name of the innermost definition around its line, and each
 * shorter one down to the global namespace.
 * @param definitions The file's definitions.
 * @param line The use's line.
 * @returns The prefixes, innermost first; `""` is the global namespace.
 */
function enclosing(definitions: readonly Definition[], line: number): string[] {
	const around = definitions
		.filter((definition) => definition.start <= line && line <= definition.end)
		.toSorted((left, right) => left.end - left.start - (right.end - right.start))[0];
	const names = around?.symbol.split(".") ?? [];
	return names.map((_, index) => names.slice(0, names.length - index).join(".")).concat("");
}

/** The projects a file sees: its own first, then every project it references. */
type Seen = readonly Project[];

/**
 * Where one qualified name is declared in the projects a file sees. A name
 * another project declares passes through that project's file.
 * @param seen The projects, the file's own first.
 * @param symbol The qualified name.
 * @param from The using file.
 * @returns The target, or undefined when no project declares it.
 */
function declaredAt(seen: Seen, symbol: string, from: string): Target | undefined {
	for (const project of seen) {
		const declared = project.declared.get(symbol);
		const file = declared === undefined ? undefined : chosenFile(declared, symbol, from);
		if (file === undefined) continue;
		const passing = project === seen[0] ? undefined : project.file;
		return { path: file, symbol, ...(passing === undefined ? {} : { via: [passing] }) };
	}
	return undefined;
}

/** One way to look a use up: a prefix, the names under it, and the fewest of them a match needs. */
interface Lookup {
	readonly prefix: string;
	readonly names: readonly string[];
	readonly least: number;
}

/**
 * Where one run of names leads under one prefix, in the projects a file sees.
 * @param seen The projects.
 * @param way The prefix, the names, and the fewest names a match needs.
 * @param from The using file.
 * @returns The target of the longest run that is declared, or undefined.
 */
function declaredUnder(seen: Seen, way: Lookup, from: string): Target | undefined {
	for (let count = way.names.length; count >= way.least; count -= 1) {
		const run = [way.prefix, ...way.names.slice(0, count)].filter((name) => name !== "");
		const target = declaredAt(seen, run.join("."), from);
		if (target !== undefined) return target;
	}
	return undefined;
}

/** Where a use is: what is around it, what its file imports, and the projects it sees. */
interface UseScope {
	/** The prefixes around it, innermost first. */
	readonly enclosing: readonly string[];
	/** The file's imports and its project's global usings. */
	readonly imports: readonly Import[];
	readonly seen: Seen;
	/** The using file. */
	readonly from: string;
}

/**
 * The fewest names of a use a match under a prefix needs. Under a type, a
 * member or a `using static` type, one: the name is a member there. Under a
 * namespace, one only where the syntax lets only a type stand; any other name
 * may be a local or a member a base class declares, so a match there needs the
 * member after the type (`Ledger.Create`), and a bare `Ledger` finds no type.
 * @param prefix The prefix.
 * @param asType Whether only a type can stand where the use is.
 * @param seen The projects the file sees.
 * @returns The fewest names.
 */
function leastUnder(prefix: string, asType: boolean, seen: Seen): number {
	return asType || seen.some((project) => project.declared.has(prefix)) ? 1 : 2;
}

/**
 * The ways a use is looked up, in C#'s order: the types and namespaces around
 * it, an alias its first name is, then each using.
 * @param names The use's names.
 * @param asType Whether only a type can stand where the use is.
 * @param scope Where it is.
 * @returns The lookups.
 */
function lookups(names: readonly string[], asType: boolean, scope: UseScope): Lookup[] {
	const [first, ...rest] = names;
	const aliased = scope.imports.flatMap((found) =>
		found.names.some((name) => name.local === first) ? [found.specifier] : [],
	);
	const usings = scope.imports.flatMap((found) =>
		found.names.some((name) => name.local === "*") ? [found.specifier] : [],
	);
	/**
	 * The lookup under one prefix.
	 * @param prefix The prefix.
	 * @returns The lookup.
	 */
	const under = (prefix: string): Lookup => ({
		prefix,
		names,
		least: leastUnder(prefix, asType, scope.seen),
	});
	return [
		...scope.enclosing.map(under),
		...aliased
			.slice(0, 1)
			.map((specifier) => ({ prefix: "", names: [specifier, ...rest], least: 1 })),
		...usings.map(under),
	];
}

/**
 * Where one use leads, by C#'s lookup. A member of a value the code does not
 * name (`.Command`) is found by no lookup.
 * @param use The use.
 * @param scope Where it is.
 * @returns The target, or undefined when no project of the checkout declares it.
 */
function lookup(use: Reference, scope: UseScope): Target | undefined {
	if (use.symbol.startsWith(".")) return undefined;
	for (const each of lookups(use.symbol.split("."), use.asType === true, scope)) {
		const target = declaredUnder(scope.seen, each, scope.from);
		if (target !== undefined) return target;
	}
	return undefined;
}

/**
 * A definition with the friends its project gives it, where it is internal.
 * @param definition The definition.
 * @param friends The project's friends.
 * @returns The definition.
 */
function withFriends(definition: Definition, friends: readonly string[]): Definition {
	if (friends.length === 0 || !definition.visibility.split(" ").includes("internal"))
		return definition;
	return {
		...definition,
		visibility: `${definition.visibility}, InternalsVisibleTo(${friends.join(", ")})`,
	};
}

/**
 * A resolver for one checkout, which reads each project once in a pass.
 * @param checkout The checkout's files.
 * @param _read Reads a file as text; the facts of every file are read instead.
 * @param parsed Reads the facts of another file.
 * @returns The resolver.
 */
function createCSharpResolver(
	checkout: CheckoutFiles,
	_read: ReadText,
	parsed: ReadParsed,
): ImportResolver {
	let membership: Membership | undefined;
	const projects = new Map<string, Promise<Project>>();
	/**
	 * One project, read once in the pass.
	 * @param project Its project file, or `""`.
	 * @returns The project.
	 */
	const projectRead = (project: string): Promise<Project> => {
		membership ??= membershipOf(checkout.files);
		let reading = projects.get(project);
		if (reading === undefined) {
			reading = readProject(project, membership.filesOf.get(project) ?? [], parsed, checkout.files);
			projects.set(project, reading);
		}
		return reading;
	};
	/**
	 * A project and every project it references, its own first.
	 * @param project The project file, or `""`.
	 * @returns The projects, each once.
	 */
	const seenFrom = async (project: string): Promise<Project[]> => {
		const seen: Project[] = [];
		const queue = [project];
		const visited = new Set(queue);
		for (let index = 0; index < queue.length; index += 1) {
			// oxlint-disable-next-line no-await-in-loop -- each project's references say which project is read next
			const read = await projectRead(queue[index] ?? "");
			seen.push(read);
			for (const next of read.references.filter((each) => !visited.has(each))) {
				visited.add(next);
				queue.push(next);
			}
		}
		return seen;
	};
	return {
		/**
		 * Where one import leads: a `ProjectReference` to the project file it
		 * names; a `using` and a package to no file.
		 * @param from The importing file.
		 * @param found The import.
		 * @returns The import, with its file where it names one.
		 */
		resolve(from, found) {
			const resolved = from.endsWith(".csproj") ? projectPath(from, found.specifier) : undefined;
			return resolved !== undefined && checkout.files.has(resolved)
				? { ...found, resolved }
				: found;
		},
		/**
		 * Where the uses of a C# file lead in its project, and its definitions
		 * with the friends its project gives them.
		 * @param from The file.
		 * @param facts Its facts.
		 * @returns What its project says of it.
		 */
		async inModule(from, facts): Promise<ModuleReading> {
			if (!from.endsWith(".cs")) return { definitions: facts.definitions, targets: [] };
			membership ??= membershipOf(checkout.files);
			const [own, ...referenced] = await seenFrom(membership.projectOf.get(from) ?? "");
			if (own === undefined) return { definitions: facts.definitions, targets: [] };
			const imports = [...facts.imports, ...own.globalUsings];
			const seen = [own, ...referenced];
			const targets = facts.references.map((reference: Reference) =>
				reference.via === "code"
					? lookup(reference, {
							enclosing: enclosing(facts.definitions, reference.line),
							imports,
							seen,
							from,
						})
					: undefined,
			);
			const definitions = facts.definitions.map((each) => withFriends(each, own.friends));
			return { definitions, targets };
		},
	};
}

export { createCSharpResolver };
