// The compilation database that clangd answers about a C, C++ or
// Objective-C file with (ADR 0046, TASK-367.15, TASK-433).
//
// clangd takes the flags of each file, its include directories, its language
// and its defines, from `compile_commands.json`. Without one it guesses, and
// a guess is no better than the candidate code facts already have, so a file
// with no database in its checkout is not asked, and the pass says so once.
// The database of a file is the one clangd would find: in the file's
// directory or one above it, no higher than the checkout, or in a `build`
// directory there. It may be a file Git ignores, as CMake's `build` is: the
// check reads it only to know that it lists a command. clangd itself reads
// it where it is, and keeps its background index where it keeps it under an
// editor.

import fs from "node:fs/promises";
import path from "node:path";
import type { Once, Project } from "@/runtime/language-servers/lib/languages";

/** The database clangd reads, by its name. */
const DATABASE = "compile_commands.json";

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
 * The directory of the database clangd would read for a file: the first
 * place it looks that holds one.
 * @param root The checkout, absolute.
 * @param file The file, relative to the checkout.
 * @returns The directory, or undefined when the checkout holds none for the file.
 */
async function databaseDirectoryOf(root: string, file: string): Promise<string | undefined> {
	const directories = searched(root, file);
	const found = await Promise.all(
		directories.map((directory) => exists(path.join(directory, DATABASE))),
	);
	return directories[found.indexOf(true)];
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
	const name = path.relative(root, path.join(directory, DATABASE));
	return once(`compile-database\0${directory}`, async () => {
		const commands = await commandsIn(directory);
		if (commands !== undefined && commands.length > 0) return { root: directory };
		const what =
			commands === undefined ? "is not a list of compile commands" : "lists no compile command";
		return { root: directory, unready: `${name} ${what}: generate it again` };
	});
}

export { compileDatabaseOf };
