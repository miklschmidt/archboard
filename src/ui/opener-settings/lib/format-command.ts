// How an opener command reads when it is shown to a person.

import type { OpenerCommand } from "@/shared/code-target";

/**
 * A command on one line, for the mono face.
 * @param command The executable and its argv.
 * @returns The command as it would be typed.
 */
function formatCommand(command: OpenerCommand): string {
	return [command.executable, ...command.argv].join(" ");
}

export { formatCommand };
