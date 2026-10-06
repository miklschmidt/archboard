// The compilation database that clangd answers about a C, C++ or
// Objective-C file with, and the copy of it that clangd reads (ADR 0046,
// TASK-367.15).
//
// clangd takes the flags of each file, its include directories, its language
// and its defines, from `compile_commands.json`. Without one it guesses, and
// a guess is no better than the candidate code facts already have, so a file
// with no database in its checkout is not asked, and the pass says so once.
// The database of a file is the one clangd would find: in the file's
// directory or one above it, no higher than the checkout, or in a `build`
// directory there. It may be a file Git ignores, as CMake's `build` is: the
// check reads it only to know that it lists a command. A database whose real
// path is outside the checkout is not the checkout's, and is not read.
//
// clangd finds a definition in a file the pass never opened through its
// background index, which parses every file the database lists. Without it,
// an answer depends on which files the pass happened to open before
// (measured: the same question named a header's declaration, then the
// definition once its source file had been opened). clangd keeps that index
// beside the database it reads, so the client gives it a copy of the database
// in a directory of the server's own (`--compile-commands-dir`), and the index
// is written there and removed with it. The copy names each command's
// directory as an absolute path, so a relative one still means what it meant
// beside the original, and moves the module cache of each command into the
// same directory: clangd builds the modules a command imports into the cache
// the command names, which can be inside the checkout (measured).

import fs from "node:fs/promises";
import path from "node:path";
import { splitCommand } from "@/runtime/code-facts/index";
import type { Once, Project } from "@/runtime/language-servers/lib/languages";

/** The database clangd reads, by its name. */
const DATABASE = "compile_commands.json";

/** The flag that names where clang keeps the modules it builds. */
const MODULE_CACHE = "-fmodules-cache-path";

/**
 * Whether a path exists.
 * @param file The path.
 * @returns True when it does.
 */
async function exists(file: string): Promise<boolean> {
	return fs.stat(file).then(
		() => true,
		() => false,
	);
}

/**
 * Where clangd looks for a file's database, in order: the file's directory,
 * then `build` in it, then the same for each directory above, no higher than
 * the checkout.
 * @param root The checkout, absolute.
 * @param file The file, relative to the checkout.
 * @returns Each directory, absolute.
 */
function searched(root: string, file: string): string[] {
	const directories: string[] = [];
	for (let at = path.dirname(path.join(root, file)); ; at = path.dirname(at)) {
		directories.push(at, path.join(at, "build"));
		if (at === root || !at.startsWith(root)) return directories;
	}
}

/**
 * Whether a path, with its links resolved, stays inside the checkout.
 * @param root The checkout, absolute.
 * @param file The path.
 * @returns True when it does.
 */
async function insideCheckout(root: string, file: string): Promise<boolean> {
	const [realRoot, real] = await Promise.all([fs.realpath(root), fs.realpath(file)]);
	const relative = path.relative(realRoot, real);
	return !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * The directory of the database clangd would read for a file.
 * @param root The checkout, absolute.
 * @param file The file, relative to the checkout.
 * @returns The directory, or undefined when the checkout holds none for the file.
 */
async function databaseDirectoryOf(root: string, file: string): Promise<string | undefined> {
	const directories = searched(root, file);
	const found = await Promise.all(
		directories.map((directory) => exists(path.join(directory, DATABASE))),
	);
	const directory = directories[found.indexOf(true)];
	if (directory === undefined) return undefined;
	return (await insideCheckout(root, path.join(directory, DATABASE))) ? directory : undefined;
}

/**
 * The commands of a database, or undefined when it is not a list of them.
 * @param directory The directory that holds it.
 * @returns Each command as the database spells it.
 */
async function commandsIn(directory: string): Promise<unknown[] | undefined> {
	try {
		const entries: unknown = JSON.parse(await fs.readFile(path.join(directory, DATABASE), "utf8"));
		return Array.isArray(entries) ? entries : undefined;
	} catch {
		return undefined;
	}
}

/**
 * The project clangd answers about a file in: the directory of its database,
 * and why it cannot answer there, if it cannot.
 * @param root The checkout, absolute.
 * @param file The file, relative to the checkout.
 * @param once A look the pass does once for each database.
 * @returns The project; the checkout when it holds no database for the file.
 */
async function compileDatabaseOf(root: string, file: string, once: Once): Promise<Project> {
	const directory = await databaseDirectoryOf(root, file);
	if (directory === undefined) {
		const where = path.dirname(file);
		return {
			root,
			unready: `no ${DATABASE} in ${where} or above it in the checkout, nor in a build directory there: generate one`,
		};
	}
	return once(`compile-database\0${directory}`, async () => {
		const commands = await commandsIn(directory);
		if (commands !== undefined && commands.length > 0) return { root: directory };
		const name = path.relative(root, path.join(directory, DATABASE));
		return { root: directory, unready: `${name} lists no compile command` };
	});
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
 * A command's arguments with its module cache in the server's own directory:
 * every module cache it names is dropped, and one in that directory goes
 * before the files, so the last one clang reads is the client's.
 * @param args The arguments.
 * @param cache The module cache in the server's own directory.
 * @returns The arguments.
 */
function withModuleCache(args: readonly string[], cache: string): string[] {
	const kept = args.filter(
		(arg, index) =>
			!arg.startsWith(MODULE_CACHE) &&
			!(arg === "-Xclang" && (args[index + 1] ?? "").startsWith(MODULE_CACHE)),
	);
	const files = kept.indexOf("--");
	const at = files < 0 ? kept.length : files;
	return [...kept.slice(0, at), `${MODULE_CACHE}=${cache}`, ...kept.slice(at)];
}

/**
 * The arguments of one command, listed or as one command line.
 * @param entry The command.
 * @returns Its arguments, or undefined when it names none.
 */
function argumentsOf(entry: Record<string, unknown>): string[] | undefined {
	const listed = entry["arguments"];
	if (Array.isArray(listed)) return listed.filter((each) => typeof each === "string");
	const command = entry["command"];
	return typeof command === "string" ? splitCommand(command) : undefined;
}

/**
 * One command as the copy spells it: its directory absolute, its arguments
 * listed, and its module cache in the server's own directory.
 * @param entry The command as the database spells it.
 * @param directory The directory that holds the database.
 * @param cache The module cache in the server's own directory.
 * @returns The command, or undefined when it is not one.
 */
function copied(entry: unknown, directory: string, cache: string): object | undefined {
	if (!isRecord(entry) || typeof entry["file"] !== "string") return undefined;
	const args = argumentsOf(entry);
	if (args === undefined) return undefined;
	const from = typeof entry["directory"] === "string" ? entry["directory"] : ".";
	return {
		directory: path.resolve(directory, from),
		file: entry["file"],
		arguments: withModuleCache(args, cache),
	};
}

/**
 * Give clangd a copy of a project's database in its own directory, and the
 * arguments that make it read the copy, keep its index there, and read no
 * configuration file.
 * @param project The project: the directory of its database.
 * @param own The server's own directory.
 * @returns The arguments clangd starts with after its command's own.
 */
async function clangdStart(project: string, own: string): Promise<readonly string[]> {
	const commands = (await commandsIn(project)) ?? [];
	const cache = path.join(own, "modules");
	const copy = commands.flatMap((entry) => copied(entry, project, cache) ?? []);
	await fs.writeFile(path.join(own, DATABASE), JSON.stringify(copy));
	return [
		`--compile-commands-dir=${own}`,
		"--background-index",
		"--enable-config=false",
		"--clang-tidy=false",
	];
}

export { clangdStart, compileDatabaseOf };
