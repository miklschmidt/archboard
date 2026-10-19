// The language servers an agent configures for a checkout (ADR 0046, TASK-433).
//
// A server that can run code of a checkout runs only where the agent that works
// in that repository configured it. The configuration is one server per
// language on the checkout's registration, so the registry that stores it, the
// command that sets it and the code check that runs it name one shape.

import path from "node:path";
import { z } from "zod";
import {
	CONFIGURABLE_LANGUAGES,
	type ConfigurableLanguage,
} from "#shared/schemas/configurable-languages.ts";

/**
 * A command: a name found on the `PATH`, or the absolute path of a program. A
 * relative path would name a program from the working directory of whoever
 * runs it.
 */
const CommandSchema = z
	.string()
	.min(1)
	.refine((command) => path.basename(command) === command || path.isAbsolute(command), {
		message: "a command is a name on the PATH or an absolute path",
	});

/** The server of one language: its command and the arguments after it. */
const ConfiguredServerSchema = z.object({ command: CommandSchema, args: z.array(z.string()) });

/** The server of one language. */
type ConfiguredServer = z.infer<typeof ConfiguredServerSchema>;

/** The servers configured for a checkout, by language. */
const LanguageServersSchema = z.partialRecord(
	z.enum(CONFIGURABLE_LANGUAGES),
	ConfiguredServerSchema,
);

/** The servers configured for a checkout. */
type LanguageServers = z.infer<typeof LanguageServersSchema>;

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
 * The command that sets the server of a language for a registered checkout, as
 * a person types it. `<command>` is the program that the agent chooses. A
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
	ConfiguredServerSchema,
	LanguageServersSchema,
	configureCommand,
};
