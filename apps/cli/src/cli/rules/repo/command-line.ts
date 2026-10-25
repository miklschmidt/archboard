import type { z } from "zod";
import type { ConfiguredServerSchema } from "@archboard/workspace/checkouts";

/**
 * A configured server as a person reads it: its command, then its arguments.
 * @param server The server.
 * @returns The line.
 */
function commandLine(server: z.infer<typeof ConfiguredServerSchema>): string {
	return [server.command, ...server.args].join(" ");
}

export { commandLine };
