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
// beside the original.
//
// A command is the checkout's, so the copy also takes out what in it could
// run a program or write outside that directory (measured with clangd
// 21.1.8). clangd builds the modules a command imports into the cache the
// command names, which can be inside the checkout, so the copy names its own.
// clang's driver runs a program to find the GPU of a CUDA, HIP or OpenMP
// command that asks for the `native` one: the program a command names, or one
// it finds through `-B`, a `--cuda-path`, or beside the compiler a command
// names. So the copy names a program that does not exist, keeps no `-B`, and
// moves the compiler into its own directory, keeping its name, which tells the
// driver the language and the target; nothing beside it is read. It keeps no
// response file and no driver configuration file, since either could hold any
// of these, and nothing after `--`, which clangd replaces with the file. The
// copy's own flags come right after the compiler, where no flag of the
// command can take one as its value, and the command keeps no flag they would
// compete with.

import fs from "node:fs/promises";
import path from "node:path";
import { splitCommand } from "@/runtime/code-facts/index";
import type { Once, Project, ServerSetup } from "@/runtime/language-servers/lib/languages";

/** The database clangd reads, by its name. */
const DATABASE = "compile_commands.json";

/** The flag that names where clang keeps the modules it builds. */
const MODULE_CACHE = "-fmodules-cache-path";

/** The prefix by which clang-cl passes a flag on to clang's own driver. */
const CL_PASS = /^[-/]clang:/u;

/**
 * The flags the copy drops with the argument after them, when they name it
 * there: a program prefix and a driver configuration file.
 */
const WITH_VALUE = new Set(["-B", "--prefix", "--config"]);

/**
 * A flag that only passes the argument after it on, such as `-Xclang`, which
 * the copy drops with a dropped argument.
 */
const FORWARDS = /^-X[^=]*$|^-Xopenmp-target=/u;

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
		if (!(await insideCheckout(root, path.join(directory, DATABASE)))) {
			return {
				root: directory,
				unready: `${name} is outside the checkout once its links are followed`,
			};
		}
		const commands = await commandsIn(directory);
		if (commands !== undefined && commands.length > 0) return { root: directory };
		const what =
			commands === undefined ? "is not a list of compile commands" : "lists no compile command";
		return { root: directory, unready: `${name} ${what}: generate it again` };
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
 * Whether the copy drops an argument: a response file, a module cache, a
 * GPU's architecture program, a program prefix or a driver configuration
 * file. A module cache or an architecture program is matched anywhere in the
 * argument, so one passed on through `-Xclang=`, `-Wp,` or clang-cl's
 * `/clang:` goes too.
 * @param arg The argument.
 * @returns True when the copy drops it.
 */
function dropped(arg: string): boolean {
	const flag = arg.replace(CL_PASS, "");
	return (
		arg.startsWith("@") ||
		arg.includes(MODULE_CACHE) ||
		arg.includes("arch-tool") ||
		/^(?:-B|--prefix|--config)/u.test(flag)
	);
}

/**
 * Whether a command runs clang-cl, whose own flags are spelled `/flag`: by
 * its last `--driver-mode`, or else by the name of its compiler.
 * @param driver The compiler.
 * @param args Its arguments.
 * @returns True for clang-cl.
 */
function clMode(driver: string, args: readonly string[]): boolean {
	const mode = args.findLast((arg) => arg.startsWith("--driver-mode="));
	if (mode !== undefined) return mode === "--driver-mode=cl";
	const name = (driver.split(/[/\\]/u).at(-1) ?? "").toLowerCase().replace(/\.exe$/u, "");
	return name === "cl" || name.endsWith("-cl");
}

/**
 * A command's flags but those the copy drops, up to `--`.
 * @param args The flags, after the compiler.
 * @returns The flags the copy keeps.
 */
function keptFlags(args: readonly string[]): string[] {
	const kept: string[] = [];
	for (let index = 0; index < args.length && args[index] !== "--"; index += 1) {
		const arg = args[index] ?? "";
		if (dropped(arg)) index += forget(kept, arg);
		else kept.push(arg);
	}
	return kept;
}

/**
 * Forget a dropped flag: the flag before it, when that only passes it on,
 * and the argument after it, when that is its value.
 * @param kept The flags kept so far, which this shortens.
 * @param arg The dropped flag.
 * @returns How many more arguments to skip.
 */
function forget(kept: string[], arg: string): number {
	if (FORWARDS.test(kept.at(-1) ?? "")) kept.pop();
	return WITH_VALUE.has(arg.replace(CL_PASS, "")) ? 1 : 0;
}

/**
 * The compiler as the copy names it: one named with a directory moves into
 * the server's own directory under the same name, so nothing beside it is
 * read; one named alone is found on the `PATH`.
 * @param driver The compiler as the command names it.
 * @param own The server's own directory.
 * @returns The compiler.
 */
function movedCompiler(driver: string, own: string): string {
	const name = driver.split(/[/\\]/u).at(-1) ?? driver;
	return name === driver ? driver : path.join(own, "compiler", name);
}

/**
 * The copy's own flags: its module cache, and a GPU program that does not
 * exist, spelled for clang-cl where the command runs it.
 * @param own The server's own directory.
 * @param cl Whether the command runs clang-cl.
 * @returns The flags.
 */
function ownFlags(own: string, cl: boolean): string[] {
	const none = path.join(own, "none");
	const flags = [
		`${MODULE_CACHE}=${path.join(own, "modules")}`,
		`--nvptx-arch-tool=${none}`,
		`--amdgpu-arch-tool=${none}`,
	];
	return cl ? flags.map((flag) => `/clang:${flag}`) : flags;
}

/**
 * A command's arguments as the copy spells them: its compiler moved, the
 * copy's own flags right after it, and the flags it keeps.
 * @param args The arguments, the compiler first.
 * @param own The server's own directory.
 * @returns The arguments.
 */
function safeArguments(args: readonly string[], own: string): string[] {
	const [driver = "cc", ...rest] = args;
	const kept = keptFlags(rest);
	return [movedCompiler(driver, own), ...ownFlags(own, clMode(driver, kept)), ...kept];
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
 * One command as the copy spells it: its directory absolute, and its
 * arguments listed as `safeArguments` spells them.
 * @param entry The command as the database spells it.
 * @param directory The directory that holds the database.
 * @param own The server's own directory.
 * @returns The command, or undefined when it is not one.
 */
function copied(entry: unknown, directory: string, own: string): object | undefined {
	if (!isRecord(entry) || typeof entry["file"] !== "string") return undefined;
	const args = argumentsOf(entry);
	if (args === undefined) return undefined;
	const from = typeof entry["directory"] === "string" ? entry["directory"] : ".";
	return {
		directory: path.resolve(directory, from),
		file: entry["file"],
		arguments: safeArguments(args, own),
	};
}

/**
 * Give clangd a copy of a project's database in its own directory, and what
 * makes it read the copy, keep its index and its temporary files there, and
 * read no configuration: no `.clangd`, no configuration of the user's, and no
 * `CLANGD_FLAGS`, whose `--query-driver` would run the compilers a command
 * names. clangd is a default for every checkout, so its flags are the
 * check's; flags of the user's go in `args` of `language-servers.json`.
 * @param project The project: the directory of its database.
 * @param own The server's own directory.
 * @returns What clangd starts with after its command's own arguments.
 */
async function clangdStart(project: string, own: string): Promise<ServerSetup> {
	const commands = (await commandsIn(project)) ?? [];
	const copy = commands.flatMap((entry) => copied(entry, project, own) ?? []);
	await fs.writeFile(path.join(own, DATABASE), JSON.stringify(copy));
	return {
		args: [
			`--compile-commands-dir=${own}`,
			"--background-index",
			"--enable-config=false",
			"--clang-tidy=false",
		],
		environment: { CLANGD_FLAGS: undefined, TMPDIR: own, XDG_CACHE_HOME: own },
	};
}

export { clangdStart, compileDatabaseOf };
