import type { ConfiguredServer } from "@archboard/workspace/checkouts";

/**
 * A configured server as a person reads it: its command, then its arguments.
 * @param server The server.
 * @returns The line.
 */
function commandLine(server: ConfiguredServer): string {
	return [server.command, ...server.args].join(" ");
}

export { commandLine };
