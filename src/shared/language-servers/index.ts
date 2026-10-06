// The language servers an agent configures for a checkout (ADR 0046, TASK-433).
//
// A server that can run code of a checkout runs only where the agent that works
// in that repository configured it. The configuration is one server per
// language on the checkout's registration, so the registry that stores it, the
// command that sets it and the code check that runs it name one shape.

import path from "node:path";
import { z } from "zod";

/**
 * The languages with no server of Archboard's own. `c` is the whole C family:
 * C, C++ and Objective-C, which one clangd reads. TypeScript is not here: its
 * server needs no configuration.
 */
const CONFIGURABLE_LANGUAGES = ["python", "csharp", "swift", "c"] as const;

/** A language whose server an agent configures. */
type ConfigurableLanguage = (typeof CONFIGURABLE_LANGUAGES)[number];

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

export {
	type ConfigurableLanguage,
	type ConfiguredServer,
	type LanguageServers,
	CONFIGURABLE_LANGUAGES,
	ConfiguredServerSchema,
	LanguageServersSchema,
};
