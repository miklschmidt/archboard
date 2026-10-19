// Where a C or C++ `#include` leads in its checkout (ADR 0046, TASK-367.09),
// resolved again on each pass, because it depends on other files.
//
// The include directories are the build's, and `compile_commands.json` is the
// only place the check reads them from. The nearest one that Git lists, in the
// including file's directory or above it, or in a `build` directory there, as
// clangd looks for it, gives each source file its `-iquote`, `-I` and
// `-isystem` directories. A quoted include then resolves against the
// including file's directory, the `-iquote`, the `-I` and the `-isystem`
// directories in order, and an include in angle brackets against the `-I` and
// the `-isystem` directories, as a compiler searches. A header has no entry of
// its own, so it searches the directories of every entry, in order. A
// directory outside the checkout, such as the system's, holds no file of it.
//
// A checkout with no `compile_commands.json` resolves every include against
// the including file's directory, then the checkout root, then each directory
// named `include`, shallowest first. An include that resolves nowhere, such as
// `<stdio.h>`, reaches no file of the checkout. Nothing names include
// directories in a configuration of archboard.
//
// ADR 0046 matches an include that resolves nowhere by its file name, as a
// candidate. That is not built: on Redis, 393 of the 1,686 includes that
// resolve nowhere would match one file by name, and 191 of those are system
// headers in angle brackets (`<stdint.h>`, `<assert.h>`, `<math.h>`) that
// would match jemalloc's own copies. A checkout that needs exact includes
// lists them in `compile_commands.json`.
//
// The uses of a file lead where its includes put their names
// (include-scope.ts).

import path from "node:path";
import type { ImportResolver, ReadParsed, ReadText } from "#runtime/operations/code-facts/facts.ts";
import {
	type IncludeSearch,
	includedTargets,
} from "#runtime/operations/code-facts/c/include-scope.ts";
import type { CheckoutFiles } from "#runtime/operations/code-facts/modules/module-resolution.ts";

/** The include directories one compile command searches, relative to the checkout. */
interface SearchPath {
	readonly quote: readonly string[];
	readonly include: readonly string[];
	readonly system: readonly string[];
}

/** One `compile_commands.json`: the search path of each file it compiles, and of them all. */
interface CompileDatabase {
	readonly byFile: ReadonlyMap<string, SearchPath>;
	readonly all: SearchPath;
}

/** The flags that name an include directory, and which list each joins. */
const FLAGS: readonly (readonly [string, keyof SearchPath])[] = [
	["-iquote", "quote"],
	["-isystem", "system"],
	["-I", "include"],
];

/** One argument of a command line: words, quoted strings and escapes with no space between. */
const ARGUMENT = /(?:[^\s"'\\]|\\.|"(?:[^"\\]|\\.)*"|'[^']*')+/gu;
/** One piece of an argument: a double-quoted string, a single-quoted one, an escape, or plain text. */
const PIECE = /"((?:[^"\\]|\\.)*)"|'([^']*)'|\\(.)|([^"'\\]+)/gu;

/**
 * One piece of an argument without its quotes or escapes.
 * @param _whole The piece as written.
 * @param doubled The text of a double-quoted string.
 * @param single The text of a single-quoted string.
 * @param escaped An escaped character.
 * @param plain Plain text.
 * @returns The text it stands for.
 */
function unquoted(
	_whole: string,
	doubled: string | undefined,
	single: string | undefined,
	escaped: string | undefined,
	plain: string | undefined,
): string {
	return doubled?.replaceAll(/\\(.)/gu, "$1") ?? single ?? escaped ?? plain ?? "";
}

/**
 * Split a command line into its arguments, as a shell splits it, honouring
 * quotes and backslashes.
 * @param command The command.
 * @returns Its arguments.
 */
function splitCommand(command: string): string[] {
	return (command.match(ARGUMENT) ?? []).map((argument) => argument.replaceAll(PIECE, unquoted));
}

/**
 * A path as the checkout names it, or undefined when it lies outside.
 * @param root The checkout.
 * @param absolute The path.
 * @returns It relative to the checkout, `""` for the checkout itself.
 */
function inCheckout(root: string, absolute: string): string | undefined {
	const relative = path.relative(root, absolute).split(path.sep).join("/");
	if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
	return relative;
}

/**
 * Each include directory a command names, with the list it joins: `-I dir`
 * and `-Idir` alike.
 * @param args The command's arguments.
 * @returns The directories as written.
 */
function flagValues(args: readonly string[]): { list: keyof SearchPath; value: string }[] {
	return args.flatMap((arg, index) => {
		const entry = FLAGS.find(([flag]) => arg.startsWith(flag));
		if (entry === undefined) return [];
		const [flag, list] = entry;
		const value = arg === flag ? args[index + 1] : arg.slice(flag.length);
		return value === undefined ? [] : [{ list, value }];
	});
}

/**
 * The search path of one compile command.
 * @param root The checkout.
 * @param directory The command's working directory.
 * @param args Its arguments.
 * @returns The include directories inside the checkout.
 */
function searchPathOf(root: string, directory: string, args: readonly string[]): SearchPath {
	const lists: Record<keyof SearchPath, string[]> = { quote: [], include: [], system: [] };
	for (const { list, value } of flagValues(args)) {
		const dir = inCheckout(root, path.resolve(directory, value));
		if (dir !== undefined) lists[list].push(dir);
	}
	return lists;
}

/**
 * Each directory of one list of every search path, once, in order.
 * @param paths The search paths.
 * @param key The list.
 * @returns The directories.
 */
function onceEach(paths: readonly SearchPath[], key: keyof SearchPath): string[] {
	return [...new Set(paths.flatMap((each) => each[key]))];
}

/**
 * Join the search paths of every command.
 * @param paths The search paths.
 * @returns Their union.
 */
function unionOf(paths: readonly SearchPath[]): SearchPath {
	return {
		quote: onceEach(paths, "quote"),
		include: onceEach(paths, "include"),
		system: onceEach(paths, "system"),
	};
}

/**
 * Whether a value is a plain object.
 * @param value The value.
 * @returns True for an object that is not an array.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The arguments of one compile command, listed or as one command line.
 * @param entry The command.
 * @returns Its arguments.
 */
function argumentsOf(entry: Record<string, unknown>): string[] {
	const listed = entry["arguments"];
	if (Array.isArray(listed)) return listed.filter((each) => typeof each === "string");
	const command = entry["command"];
	return typeof command === "string" ? splitCommand(command) : [];
}

/**
 * The file one compile command compiles, and its search path.
 * @param root The checkout.
 * @param at The directory that holds the database, relative to the checkout.
 * @param entry The command.
 * @returns The file, relative to the checkout, and its search path, or undefined.
 */
function entryOf(root: string, at: string, entry: unknown): [string, SearchPath] | undefined {
	if (!isRecord(entry) || typeof entry["file"] !== "string") return undefined;
	const directory = entry["directory"];
	const cwd = path.resolve(root, at, typeof directory === "string" ? directory : ".");
	const compiled = inCheckout(root, path.resolve(cwd, entry["file"]));
	return compiled === undefined
		? undefined
		: [compiled, searchPathOf(root, cwd, argumentsOf(entry))];
}

/**
 * A JSON value, or undefined when the text is not JSON.
 * @param text The text.
 * @returns The value.
 */
function parsedJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/**
 * Read one `compile_commands.json`.
 * @param root The checkout.
 * @param text The file's text.
 * @param at The directory that holds it, relative to the checkout.
 * @returns The search path of each file, or undefined when it is not a list of commands.
 */
function parseDatabase(root: string, text: string, at: string): CompileDatabase | undefined {
	const entries = parsedJson(text);
	if (!Array.isArray(entries)) return undefined;
	const byFile = new Map(
		entries.flatMap((entry: unknown) => {
			const compiled = entryOf(root, at, entry);
			return compiled === undefined ? [] : [compiled];
		}),
	);
	return { byFile, all: unionOf([...byFile.values()]) };
}

/**
 * The directories of a checkout named `include`, shallowest first.
 * @param files The checkout's files.
 * @returns Each directory, relative to the checkout.
 */
function includeDirectoriesOf(files: ReadonlySet<string>): string[] {
	const directories = new Set<string>();
	for (const file of files) {
		const names = file.split("/").slice(0, -1);
		names.forEach((name, index) => {
			if (name === "include") directories.add(names.slice(0, index + 1).join("/"));
		});
	}
	return [...directories].toSorted(
		(left, right) => left.split("/").length - right.split("/").length || left.localeCompare(right),
	);
}

/**
 * The directories a file and those above it, deepest first.
 * @param file A file, relative to the checkout.
 * @returns Its directory, then each one above it, ending with the root `""`.
 */
function directoriesAbove(file: string): string[] {
	const names = file.split("/").slice(0, -1);
	return names.map((_, index) => names.slice(0, names.length - index).join("/")).concat("");
}

/**
 * The resolver of one checkout's includes for one pass.
 * @param checkout The checkout's files.
 * @param read Reads a file of the checkout as text.
 * @param parsed Reads the facts of a header.
 * @returns The resolver.
 */
function createCResolver(
	checkout: CheckoutFiles,
	read: ReadText,
	parsed: ReadParsed,
): ImportResolver {
	const databases = new Map<string, CompileDatabase | undefined>();
	let includeDirectories: string[] | undefined;
	/**
	 * The nearest `compile_commands.json` of a file, read once in the pass.
	 * @param from The file.
	 * @returns Its database, or undefined when none is listed.
	 */
	const databaseOf = (from: string): CompileDatabase | undefined => {
		for (const directory of directoriesAbove(from)) {
			for (const at of [directory, path.posix.join(directory, "build")]) {
				const file = path.posix.join(at, "compile_commands.json");
				if (!checkout.files.has(file)) continue;
				if (!databases.has(file)) {
					const text = read(file);
					databases.set(
						file,
						text === undefined ? undefined : parseDatabase(checkout.root, text, at),
					);
				}
				return databases.get(file);
			}
		}
		return undefined;
	};
	/**
	 * The directories one include searches, in order.
	 * @param from The including file.
	 * @param angle Whether the include is in angle brackets.
	 * @returns The directories, relative to the checkout.
	 */
	const searched = (from: string, angle: boolean): string[] => {
		const own = path.posix.dirname(from) === "." ? "" : path.posix.dirname(from);
		const database = databaseOf(from);
		if (database === undefined) {
			includeDirectories ??= includeDirectoriesOf(checkout.files);
			return [own, "", ...includeDirectories];
		}
		const flags = database.byFile.get(from) ?? database.all;
		return angle
			? [...flags.include, ...flags.system]
			: [own, ...flags.quote, ...flags.include, ...flags.system];
	};
	/**
	 * Where one include leads.
	 * @param from The including file.
	 * @param found The include.
	 * @returns The include, with the file it names where the checkout holds it.
	 */
	const resolve: ImportResolver["resolve"] = (from, found) => {
		const angle = /^<.*>$/u.test(found.specifier);
		const name = angle ? found.specifier.slice(1, -1) : found.specifier;
		const resolved = searched(from, angle)
			.map((directory) => path.posix.normalize(path.posix.join(directory, name)))
			.find((candidate) => checkout.files.has(candidate));
		return resolved === undefined ? found : { ...found, resolved };
	};
	const search: IncludeSearch = { resolve, parsed, included: new Map() };
	return {
		resolve,
		/**
		 * Where the uses of one file lead through its includes.
		 * @param from The file.
		 * @param facts Its facts.
		 * @returns Its definitions, and the target of each use.
		 */
		inModule: async (from, facts) => ({
			definitions: facts.definitions,
			targets: await includedTargets(search, from, facts),
		}),
	};
}

export { createCResolver };
