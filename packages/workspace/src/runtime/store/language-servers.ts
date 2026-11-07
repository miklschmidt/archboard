// The language servers of a checkout (ADR 0046, TASK-433, TASK-599).
//
// A repository names its servers in `.archboard/language-servers.json` at the
// root of its checkout, so every machine and every CI run that has the
// checkout runs the same servers. The global file, `language-servers.json`
// beside the registry, names a server for each language that the repository
// file leaves out. Both files map a language to a command and its arguments,
// `archboard repo language-server` writes both, and the code check reads both.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { errnoCode, errorMessage } from "@archboard/diagnostics/errno";
import { unlinkDurably, writeFileAtomic } from "#runtime/store/atomic-write.ts";
import { registryPath } from "#runtime/store/registry-file.ts";
import {
	CONFIGURABLE_LANGUAGES,
	type ConfigurableLanguage,
} from "#shared/schemas/configurable-languages.ts";

/** The server of one language: its command and the arguments after it. */
const ConfiguredServerSchema = z.strictObject({
	command: z.string().min(1),
	args: z.array(z.string()).default([]),
});

/** The server of one language. */
type ConfiguredServer = z.infer<typeof ConfiguredServerSchema>;

/** The servers that one file names, by language. */
const LanguageServersSchema = z.partialRecord(
	z.enum(CONFIGURABLE_LANGUAGES),
	ConfiguredServerSchema,
);

/** The servers that one file names. */
type LanguageServers = z.infer<typeof LanguageServersSchema>;

/**
 * The global file has no directory to read a relative path from, so its
 * command is a name on the `PATH` or an absolute path.
 */
const GlobalServersSchema = LanguageServersSchema.refine(
	(servers) => Object.values(servers).every(({ command }) => !isRelativePath(command)),
	{ message: "a command in the global file is a name on the PATH or an absolute path" },
);

/** Which file a server comes from. */
type ServerScope = "repository" | "global";

/** What one file says: the servers it names, or why it says nothing. */
type ServerFile =
	| { readonly file: string; readonly servers: LanguageServers }
	| { readonly file: string; readonly problem: string };

/** The server that a file names for a language, with the command as the check starts it. */
interface NamedServer extends ConfiguredServer {
	/** The file that names it. */
	readonly file: string;
}

/**
 * What the files of a checkout say about one language: the server they name,
 * a file that could not be read, or nothing.
 */
type ServerChoice = NamedServer | { readonly problem: string } | undefined;

/**
 * Whether a command is a path relative to some directory: neither a bare name
 * nor an absolute path.
 * @param command The command.
 * @returns True when it is.
 */
function isRelativePath(command: string): boolean {
	return path.basename(command) !== command && !path.isAbsolute(command);
}

/**
 * The repository file of a checkout.
 * @param root The checkout's root.
 * @returns Its path.
 */
function repositoryServersPath(root: string): string {
	return path.join(root, ".archboard", "language-servers.json");
}

/**
 * The global file. It sits beside the registry, so `ARCHBOARD_REPOS`, which
 * gives a test or a second Archboard its own registry, gives it its own global
 * servers too.
 * @returns Its path.
 */
function globalServersPath(): string {
	return path.join(path.dirname(registryPath()), "language-servers.json");
}

/**
 * The path of a file in one scope.
 * @param scope The scope.
 * @param root The checkout's root, for the repository file.
 * @returns The path.
 */
function serversPath(scope: ServerScope, root: string | undefined): string {
	if (scope === "global") return globalServersPath();
	if (root === undefined) throw new Error("the repository file needs a checkout");
	return repositoryServersPath(root);
}

/**
 * Read one file. A file that is not there names no server.
 * @param scope Which file it is.
 * @param root The checkout's root, for the repository file.
 * @returns What it says.
 */
function readServers(scope: ServerScope, root?: string): ServerFile {
	const file = serversPath(scope, root);
	let text: string;
	try {
		text = fs.readFileSync(file, "utf8");
	} catch (error) {
		if (errnoCode(error) === "ENOENT") return { file, servers: {} };
		return { file, problem: `${file} cannot be read: ${errorMessage(error)}` };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		return { file, problem: `${file} is not valid JSON: ${errorMessage(error)}` };
	}
	const schema = scope === "global" ? GlobalServersSchema : LanguageServersSchema;
	const servers = schema.safeParse(parsed);
	return servers.success
		? { file, servers: servers.data }
		: { file, problem: `${file} is not valid: ${z.prettifyError(servers.error)}` };
}

/**
 * The servers of a checkout, as the check starts them: for each language, the
 * repository file's server, else the global file's. A relative command in the
 * repository file names a program from the checkout's root. A file that
 * cannot be read decides every language that it could name.
 * @param root The checkout's root.
 * @param global The global file, which a pass reads once.
 * @returns What the files say about each language.
 */
function checkoutServers(
	root: string,
	global: ServerFile,
): (language: ConfigurableLanguage) => ServerChoice {
	const own = readServers("repository", root);
	return (language) => {
		if ("problem" in own) return { problem: own.problem };
		const mine = own.servers[language];
		if (mine !== undefined) {
			const command = isRelativePath(mine.command)
				? path.resolve(root, mine.command)
				: mine.command;
			return { ...mine, command, file: own.file };
		}
		if ("problem" in global) return { problem: global.problem };
		const machine = global.servers[language];
		return machine === undefined ? undefined : { ...machine, file: global.file };
	};
}

/**
 * Set or remove the server of one language in one file. The file lists its
 * languages in a fixed order and leaves out empty arguments, so a person reads
 * and diffs it easily. A file left with no server is deleted.
 * @param scope Which file.
 * @param language The language.
 * @param server Its command and arguments, or undefined to remove it.
 * @param root The checkout's root, for the repository file.
 * @returns The file as it now stands.
 * @throws {Error} When the file cannot be read or written: nothing changed.
 */
function setServer(
	scope: ServerScope,
	language: ConfigurableLanguage,
	server: ConfiguredServer | undefined,
	root?: string,
): { readonly file: string; readonly servers: LanguageServers } {
	const current = readServers(scope, root);
	if ("problem" in current)
		throw new Error(`${current.problem}. Fix or delete it, then run this again.`);
	const { file } = current;
	const { [language]: _replaced, ...others } = current.servers;
	const changed: LanguageServers =
		server === undefined ? others : { ...others, [language]: server };
	const servers: LanguageServers = Object.fromEntries(
		CONFIGURABLE_LANGUAGES.flatMap((each) => {
			const entry = changed[each];
			return entry === undefined ? [] : [[each, entry]];
		}),
	);
	try {
		if (Object.keys(servers).length === 0) {
			if (fs.existsSync(file)) unlinkDurably(file);
		} else {
			fs.mkdirSync(path.dirname(file), { recursive: true });
			const stored = Object.fromEntries(
				Object.entries(servers).map(([each, { command, args }]) => [
					each,
					args.length === 0 ? { command } : { command, args },
				]),
			);
			writeFileAtomic(file, `${JSON.stringify(stored, null, "\t")}\n`);
		}
	} catch (error) {
		throw new Error(`Could not write ${file}, so nothing changed: ${errorMessage(error)}`, {
			cause: error,
		});
	}
	return { file, servers };
}

/**
 * A word as a shell reads it: as it stands when it has only characters a shell
 * leaves alone, and in single quotes otherwise.
 * @param word The word.
 * @returns The word, quoted when it needs it.
 */
function shellWord(word: string): string {
	return /^[\w@%+=:,./-]+$/u.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`;
}

/**
 * The command that sets the server of a language for a repository, as a
 * person types it. `<command>` is the program that the agent chooses. A
 * repository identity can hold a space when a checkout has no remote and is
 * named by its directory, so it is quoted for a shell.
 * @param language The language.
 * @param repo The repository identity, when the command must name it.
 * @returns The command.
 */
function configureCommand(language: ConfigurableLanguage, repo?: string): string {
	const checkout = repo === undefined ? "" : ` --repo ${shellWord(repo)}`;
	return `archboard repo language-server ${language} <command>${checkout}`;
}

export {
	type ConfiguredServer,
	type LanguageServers,
	type ServerChoice,
	type ServerFile,
	type ServerScope,
	ConfiguredServerSchema,
	LanguageServersSchema,
	checkoutServers,
	configureCommand,
	readServers,
	setServer,
};
