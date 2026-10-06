// Which language server this machine runs for each language (ADR 0046).
//
// `language-servers.json` lives in Archboard's state directory beside
// `repos.json` and `opener.json`, because a server command and its place on
// disk are facts about one machine, not about the vault or a checkout. An
// entry names the command for a language, or turns the language off with
// `false`. A language with no entry uses its default (languages.ts). A bare
// command is looked up on the `PATH`; an absolute path names the program
// itself.
//
// The file is read again by every pass, so an edit applies to the next check
// with no restart. A file that is not valid turns every server off for the
// pass, and each language that had a question says why, once.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
	LANGUAGE_KEYS,
	LANGUAGES,
	type Language,
	type ServerCommand,
} from "@/runtime/language-servers/lib/languages";
import { stateDir } from "@/runtime/engine/state-dir";

/**
 * A command: a name found on the `PATH`, or the absolute path of a program. A
 * relative path would name a program from the server's working directory.
 */
const CommandSchema = z
	.string()
	.min(1)
	.refine((command) => path.basename(command) === command || path.isAbsolute(command), {
		message: "a command is a name on the PATH or an absolute path",
	});

/** One entry: the command of a language's server, or `false` to run none. */
const ServerEntrySchema = z.union([
	z.literal(false),
	z.object({ command: CommandSchema, args: z.array(z.string()).optional() }).strict(),
]);

/** The whole file: an entry for any language, and no key that names no language. */
const LanguageServersFileSchema = z.partialRecord(z.enum(LANGUAGE_KEYS), ServerEntrySchema);

/** The server one language uses on this machine, or why it has none. */
type LanguageServer =
	| { readonly status: "command"; readonly argv: readonly [string, ...string[]] }
	| { readonly status: "missing"; readonly detail: string };

/** The server of every language, as one pass reads the file. */
type LanguageServerTable = ReadonlyMap<Language, LanguageServer>;

/**
 * Where this machine keeps its language server commands. A test moves the
 * file with `ARCHBOARD_LANGUAGE_SERVERS`, as `ARCHBOARD_REPOS` moves
 * `repos.json`, so a pass in the test does not depend on this machine's file
 * or on the servers its `PATH` holds.
 * @returns The path of `language-servers.json`.
 */
function languageServersFile(): string {
	return (
		process.env["ARCHBOARD_LANGUAGE_SERVERS"] || path.join(stateDir(), "language-servers.json")
	);
}

/**
 * A command as this machine runs it: a bare name found on the `PATH`, or a
 * path to a program that exists.
 * @param server The command.
 * @param origin Where the command was named, for the reason it is missing.
 * @returns The program and its arguments, or why there is none.
 */
function runnable(server: ServerCommand, origin: string): LanguageServer {
	const program = Bun.which(server.command);
	if (program === null) {
		return { status: "missing", detail: `${server.command} (${origin}) is not installed` };
	}
	return { status: "command", argv: [program, ...server.args] };
}

/**
 * The server one language uses.
 * @param language The language.
 * @param entry Its entry in the file, if it has one.
 * @param file The file, for the reason a server is missing.
 * @returns The server, or why there is none.
 */
function serverOf(
	language: Language,
	entry: z.infer<typeof ServerEntrySchema> | undefined,
	file: string,
): LanguageServer {
	if (entry === false) return { status: "missing", detail: `turned off in ${file}` };
	if (entry !== undefined) {
		return runnable({ command: entry.command, args: entry.args ?? [] }, `named in ${file}`);
	}
	const fallback = LANGUAGES[language].defaultServer();
	if (typeof fallback === "string") return { status: "missing", detail: fallback };
	return runnable(fallback, "the default");
}

/**
 * The text of the file, or why it cannot be read. An absent file has none.
 * @param file The file.
 * @returns Its text, `{}` for no file, or the reason every server is off.
 */
function readText(file: string): { text: string } | { reason: string } {
	try {
		return { text: fs.readFileSync(file, "utf8") };
	} catch (error) {
		const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
		return missing ? { text: "{}" } : { reason: `${file} cannot be read` };
	}
}

/**
 * The entries of the file, or why it cannot be read.
 * @param file The file.
 * @returns The entries, or the reason every server is off.
 */
function readEntries(file: string): z.infer<typeof LanguageServersFileSchema> | string {
	const read = readText(file);
	if ("reason" in read) return read.reason;
	try {
		const parsed = LanguageServersFileSchema.safeParse(JSON.parse(read.text));
		if (parsed.success) return parsed.data;
		return `${file} is not valid: ${z.prettifyError(parsed.error).replaceAll("\n", " ")}`;
	} catch {
		return `${file} is not valid JSON`;
	}
}

/**
 * The server every language uses on this machine, read from
 * `language-servers.json` and the defaults.
 * @param file The file; this machine's own by default.
 * @returns The table.
 */
function readLanguageServers(file: string = languageServersFile()): LanguageServerTable {
	const entries = readEntries(file);
	return new Map(
		LANGUAGE_KEYS.map((language): [Language, LanguageServer] => [
			language,
			typeof entries === "string"
				? { status: "missing", detail: entries }
				: serverOf(language, entries[language], file),
		]),
	);
}

export { type LanguageServer, type LanguageServerTable, languageServersFile, readLanguageServers };
