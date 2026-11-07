// The global flags every command shares (-C, --doing,
// --as-session), pulled out of argv before a command's own parser sees them.
import { CliUsageError } from "#cli/contract/protocol/contract.ts";

/**
 * Removes `<flag> value` or `<flag>=value` from argv, in place, and returns the value.
 * @param argv - The arguments to search; the flag and its value are spliced out.
 * @param flag - The flag as it is spelled, dashes included.
 * @returns The flag's value, or null when the flag is absent.
 */
function takeGlobalFlag(argv: string[], flag: string): string | null {
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i]!;
		if (token === flag) {
			const value = argv[i + 1];
			if (value === undefined) {
				throw new CliUsageError(`Flag ${flag} requires a value`);
			}
			argv.splice(i, 2);
			return value;
		}
		if (token.startsWith(`${flag}=`)) {
			argv.splice(i, 1);
			return token.slice(flag.length + 1);
		}
	}
	return null;
}

/**
 * Pull `-C <dir>` out of the arguments before the command sees it.
 *
 * Global: every server call a command makes names
 * the vault, and `-C` says where that vault is found from (ADR 0049). It
 * changes nothing else; a relative `--input` or `--out` still resolves
 * against the working directory.
 * @param argv - The arguments after the command name; the flag is spliced out.
 * @returns The directory as it was written, or null when none was passed.
 */
function takeDirectoryFlag(argv: string[]): string | null {
	return takeGlobalFlag(argv, "-C");
}

/**
 * And `--doing "..."`, for the same reason (TASK-095).
 *
 * Global because a command may make several requests and each of them is the
 * same act: `import` clears the model and then batches the scene in, and both
 * are "restoring the payment path from the export". Stripped before the
 * command's own parser sees it, so no command declares it and none can be the
 * one that dropped it.
 *
 * Not refused here. The server knows which routes are model writes and it is
 * the only side that should; a second list on this side would be a second
 * answer to the same question, and the two would drift.
 * @param argv - The arguments after the command name; the flag is spliced out.
 * @returns The step being taken, or null when none was passed.
 */
function takeDoingFlag(argv: string[]): string | null {
	return takeGlobalFlag(argv, "--doing");
}

/**
 * And `--as-session <thread>`, which says which agent session is writing.
 *
 * Global for the same reason `--doing` is: one command may make several
 * requests and they are all the same session's. A flag rather than an
 * environment variable on purpose — one private app-server child serves every
 * thread of a workbench, so anything read from that process's environment would
 * stamp one session's identity onto another's writes.
 *
 * Never required and never refused. What it is for is letting a session skip the
 * model news it wrote itself; a write that states nothing is delivered to
 * everybody, its own author included, which is redundancy rather than silence.
 * @param argv - The arguments after the command name; the flag is spliced out.
 * @returns The session writing, or null when none was passed.
 */
function takeSessionFlag(argv: string[]): string | null {
	return takeGlobalFlag(argv, "--as-session");
}

export { takeDirectoryFlag, takeDoingFlag, takeSessionFlag };
