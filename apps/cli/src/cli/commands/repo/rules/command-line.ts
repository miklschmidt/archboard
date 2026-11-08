import type { setServer } from "@archboard/workspace/checkouts";

/** A server that a language server file names: its command and its arguments. */
type NamedServer = NonNullable<Parameters<typeof setServer>[2]>;

/**
 * A server as a person reads it: its command, then its arguments.
 * @param server The server.
 * @returns The line.
 */
function commandLine(server: NamedServer): string {
	return [server.command, ...server.args].join(" ");
}

export { type NamedServer, commandLine };
